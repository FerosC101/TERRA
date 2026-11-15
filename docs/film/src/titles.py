"""On-screen typography for the TERRA film: transparent 1920x1080 PNG overlays."""
import os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
W, H = 1920, 1080
AV = "/System/Library/Fonts/Avenir Next.ttc"
DEMI, MED, REG = 2, 5, 7
WHITE = (246, 248, 244)
SOFT = (226, 234, 226)
GREEN = (150, 214, 150)


def font(face, size):
    return ImageFont.truetype(AV, size, index=face)


def tracked_width(text, f, track):
    return sum(f.getlength(ch) for ch in text) + track * f.size * (len(text) - 1)


def draw_tracked(d, xy, text, f, track, fill):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += f.getlength(ch) + track * f.size


def card(lines, name, anchor="lower-left", shadow=0.55, margin=(128, 120)):
    """lines: [(text, face, size, track, colour, gap_after)]"""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    heights = [size for _, _, size, _, _, _ in lines]
    gaps = [g for *_, g in lines]
    block_h = sum(heights) + sum(gaps[:-1])
    if anchor == "lower-left":
        x0, y = margin[0], H - margin[1] - block_h
    elif anchor == "upper-left":
        x0, y = margin[0], margin[1]
    else:  # centre, at a given y (margin[1] = top of block)
        x0, y = None, margin[1]
    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(shadow_layer)
    d = ImageDraw.Draw(img)
    for text, face, size, track, colour, gap in lines:
        f = font(face, size)
        tw = tracked_width(text, f, track)
        x = x0 if x0 is not None else (W - tw) / 2
        draw_tracked(ds, (x + 2, y + 3), text, f, track, (0, 0, 0, int(255 * shadow)))
        draw_tracked(d, (x, y), text, f, track, (*colour, 255))
        y += size + gap
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(9))
    out = Image.alpha_composite(shadow_layer, img)
    out.save(os.path.join(OUT, name + ".png"))


def pill(text, name, corner, size=19):
    """Small label in a translucent pill (labels and the SI watermark)."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font(MED, size)
    tw = tracked_width(text, f, 0.04)
    px, py = 14, 7
    w, h = tw + 2 * px, size + 2 * py + 2
    x = 40 if corner == "left" else W - 40 - w
    y = H - 36 - h
    d.rounded_rectangle((x, y, x + w, y + h), radius=h / 2, fill=(14, 33, 23, 150), outline=(255, 255, 255, 60), width=1)
    draw_tracked(d, (x + px, y + py - 2), text, f, 0.04, (*WHITE, 235))
    img.save(os.path.join(OUT, name + ".png"))


card([("EVERY FIELD HAS A STORY.", DEMI, 58, 0.16, WHITE, 0)], "t1", anchor="centre", margin=(0, 640))
card([("OBSERVE. CONNECT. UNDERSTAND.", DEMI, 46, 0.16, WHITE, 0)], "t2")
card([("THE LIVING FIELD MODEL", DEMI, 48, 0.16, WHITE, 16),
      ("DISCOVER WHAT’S CHANGING.", MED, 24, 0.26, SOFT, 0)], "t3", anchor="upper-left", margin=(128, 112))
card([("TEST A BETTER FUTURE.", DEMI, 48, 0.16, WHITE, 16),
      ("COMPARE. EVALUATE. ADAPT.", MED, 24, 0.26, SOFT, 0)], "t4")
card([("WATER  ·  DIVERSITY  ·  NUTRIENTS  ·  SOIL PROTECTION  ·  CLIMATE", MED, 18, 0.22, SOFT, 0)], "t4b",
     anchor="upper-left", margin=(128, 112), shadow=0.6)
card([("FROM INSIGHT TO ADAPTATION.", DEMI, 50, 0.16, WHITE, 0)], "t5", anchor="centre", margin=(0, 820))
card([("TERRA", DEMI, 104, 0.34, WHITE, 0)], "t6", anchor="centre", margin=(0, 700), shadow=0.0)
card([("DISCOVER. PREDICT. REGENERATE.", MED, 26, 0.34, GREEN, 0)], "t6b", anchor="centre", margin=(0, 842), shadow=0.0)
pill("Conceptual 3D visualization", "label-concept", "left")
pill("TERRA app · real screen recording · demo data", "label-app", "left")
pill("SI-generated", "label-si", "right")
print("ok")
