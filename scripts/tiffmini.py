"""Minimal single-band GeoTIFF reader (stdlib + numpy), for the small rasters TERRA downloads
(ISRIC SoilGrids WCS, NASA AppEEARS). No GDAL in the pipeline's environment.

Supports: little-endian classic TIFF; strips or tiles; no compression, Deflate (8, 32946) or LZW (5);
horizontal predictor 2; int16/uint16/int32/uint8/float32 samples; GeoTIFF ModelPixelScale + ModelTiepoint.
Anything else raises ValueError rather than guessing.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

import numpy as np


def lzw_decode(data: bytes) -> bytes:
    """TIFF LZW (MSB-first codes, 9-12 bits, ClearCode 256, EOI 257, 'early change')."""
    out = bytearray()
    table: list[bytes] = [bytes([i]) for i in range(256)] + [b"", b""]
    width, bitpos, nbits, prev = 9, 0, len(data) * 8, None
    padded = data + b"\0\0\0"
    while bitpos + width <= nbits:
        byte = bitpos >> 3
        val = int.from_bytes(padded[byte:byte + 3], "big")
        code = (val >> (24 - (bitpos & 7) - width)) & ((1 << width) - 1)
        bitpos += width
        if code == 256:
            table = table[:258]
            width, prev = 9, None
            continue
        if code == 257:
            break
        if prev is None:
            entry = table[code]
        elif code < len(table):
            entry = table[code]
            table.append(prev + entry[:1])
        elif code == len(table):
            entry = prev + prev[:1]
            table.append(entry)
        else:
            raise ValueError(f"LZW: bad code {code} (table {len(table)})")
        out += entry
        prev = entry
        if len(table) >= (1 << width) - 1 and width < 12:
            width += 1
    return bytes(out)


def read_tiff(path: Path) -> tuple[np.ndarray, tuple[float, float, float, float], float | None]:
    """Returns (array as float, (x0, y0, sx, sy) of the top-left corner, nodata or None)."""
    b = path.read_bytes()
    if b[:2] != b"II" or struct.unpack_from("<H", b, 2)[0] != 42:
        raise ValueError(f"{path.name}: not a little-endian classic TIFF")
    (ifd,) = struct.unpack_from("<I", b, 4)
    (n,) = struct.unpack_from("<H", b, ifd)
    size = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8}
    fmt = {1: "B", 3: "H", 4: "I", 8: "h", 9: "i", 11: "f", 12: "d", 16: "Q"}
    tags: dict[int, object] = {}
    for i in range(n):
        tag, typ, cnt, val = struct.unpack_from("<HHII", b, ifd + 2 + 12 * i)
        off = ifd + 2 + 12 * i + 8 if size[typ] * cnt <= 4 else val
        if typ == 2:
            tags[tag] = b[off:off + cnt].rstrip(b"\0").decode()
        elif typ in fmt:
            tags[tag] = list(struct.unpack_from(f"<{cnt}{fmt[typ]}", b, off))
    if tags.get(277, [1])[0] != 1:
        raise ValueError(f"{path.name}: {tags[277][0]} samples per pixel, expected 1")
    w, h, bits = tags[256][0], tags[257][0], tags[258][0]
    comp, pred, sfmt = tags.get(259, [1])[0], tags.get(317, [1])[0], tags.get(339, [1])[0]
    dtype = {(16, 2): "<i2", (16, 1): "<u2", (32, 3): "<f4", (32, 2): "<i4", (32, 1): "<u4", (8, 1): "u1"}[(bits, sfmt)]

    def decode(chunk: bytes) -> bytes:
        if comp == 1:
            return chunk
        if comp in (8, 32946):
            return zlib.decompress(chunk)
        if comp == 5:
            return lzw_decode(chunk)
        raise ValueError(f"{path.name}: unsupported compression {comp}")

    def unpredict(block: np.ndarray) -> np.ndarray:
        if pred == 1:
            return block
        if pred == 2:
            return np.cumsum(block, axis=1, dtype=block.dtype)
        raise ValueError(f"{path.name}: unsupported predictor {pred}")

    if 324 in tags:  # tiled
        tw, th = tags[322][0], tags[323][0]
        per_row = (w + tw - 1) // tw
        arr = np.zeros((((h + th - 1) // th) * th, per_row * tw), dtype=dtype)
        for k, (o, c) in enumerate(zip(tags[324], tags[325])):
            t = np.frombuffer(decode(b[o:o + c]), dtype=dtype)[: tw * th].reshape(th, tw)
            r, q = divmod(k, per_row)
            arr[r * th:(r + 1) * th, q * tw:(q + 1) * tw] = unpredict(t)
        arr = arr[:h, :w]
    else:
        rps = tags.get(278, [h])[0]
        parts = []
        for o, c in zip(tags[273], tags[279]):
            s = np.frombuffer(decode(b[o:o + c]), dtype=dtype)
            parts.append(unpredict(s[: (len(s) // w) * w].reshape(-1, w)))
        arr = np.concatenate(parts)[:h]
        if arr.shape != (h, w):
            raise ValueError(f"{path.name}: decoded {arr.shape}, expected {(h, w)} (rows per strip {rps})")
    sx, sy, _ = tags[33550]
    _, _, _, tx, ty, _ = tags[33922]
    nodata = float(tags[42113]) if 42113 in tags else None
    return arr.astype(float), (tx, ty, sx, sy), nodata
