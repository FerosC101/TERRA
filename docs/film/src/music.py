"""Synthesised ambient music bed for the TERRA film (30 s, 48 kHz stereo WAV).

Warm detuned pad, D - Bm - G - D, swelling toward 24 s and resolving under the logo,
with a very soft pulse. Written in numpy; no samples or generated music are used.
"""
import sys, wave
import numpy as np

SR = 48000
DUR = 30.0
t = np.arange(int(SR * DUR)) / SR
rng = np.random.default_rng(4)

def hz(note):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    n, o = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)

CHORDS = [  # (start, end, notes)
    (0.0, 8.0, ["D2", "A2", "D3", "F#3", "A3", "E4"]),
    (7.0, 15.6, ["B1", "F#2", "B2", "D3", "F#3", "A3", "C#4"]),
    (14.6, 22.4, ["G1", "D2", "G2", "B2", "D3", "F#3", "A3"]),
    (21.4, 30.0, ["D2", "A2", "D3", "F#3", "A3", "C#4", "E4"]),
]

def env(start, end, fade=1.4):
    e = np.clip((t - start) / fade, 0, 1) * np.clip((end - t) / fade, 0, 1)
    return np.sin(e * np.pi / 2) ** 2

def voice(f, detune=0.0045):
    """Soft saw-ish tone: a few harmonics, two detuned copies, slow vibrato."""
    out = np.zeros_like(t)
    vib = 1 + 0.0015 * np.sin(2 * np.pi * (0.17 + rng.random() * 0.1) * t + rng.random() * 6)
    for d in (-detune, detune):
        ph = 2 * np.pi * f * (1 + d) * np.cumsum(vib) / SR
        for k, a in ((1, 1.0), (2, 0.35), (3, 0.16), (4, 0.07)):
            out += a * np.sin(k * ph + rng.random() * 6)
    return out

pad_l = np.zeros_like(t); pad_r = np.zeros_like(t)
for s, e, notes in CHORDS:
    en = env(s, e)
    for i, n in enumerate(notes):
        v = voice(hz(n)) * en * (0.9 if i < 2 else 0.55) / len(notes)
        pan = (i / max(1, len(notes) - 1)) - 0.5
        pad_l += v * (0.6 - pan * 0.35); pad_r += v * (0.6 + pan * 0.35)

# one-pole low-pass that opens toward the 24 s peak, then closes
cut = 900 + 1700 * np.clip((t - 4) / 20, 0, 1) - 1100 * np.clip((t - 25.5) / 4.5, 0, 1)
def lowpass(x):
    y = np.zeros_like(x); a = np.exp(-2 * np.pi * cut / SR); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc; y[i] = acc
    return y
pad_l, pad_r = lowpass(pad_l), lowpass(pad_r)

# soft pulse: filtered clicks on eighth notes at 84 bpm, entering at 4 s, peaking with the build
beat = 60 / 84 / 2
pulse = np.zeros_like(t)
for k in range(int(DUR / beat)):
    ts = k * beat
    if ts < 4.0 or ts > 27.6:
        continue
    i = int(ts * SR); n = int(0.18 * SR)
    seg = np.sin(2 * np.pi * hz("D4") * np.arange(n) / SR) * np.exp(-np.arange(n) / (0.035 * SR))
    pulse[i:i + n] += seg[: len(pulse) - i] * (0.6 if k % 2 == 0 else 0.35)
pulse *= 0.05 + 0.06 * np.clip((t - 4) / 18, 0, 1)

# simple stereo reverb: convolution with decaying noise
ir_len = int(2.6 * SR)
decay = np.exp(-np.arange(ir_len) / (0.8 * SR))
def verb(x, seed):
    ir = np.random.default_rng(seed).standard_normal(ir_len) * decay
    return np.fft.irfft(np.fft.rfft(x, len(x) + ir_len) * np.fft.rfft(ir, len(x) + ir_len))[: len(x)] / 40
L = pad_l + pulse + 0.55 * verb(pad_l + pulse, 1)
R = pad_r + pulse + 0.55 * verb(pad_r + pulse, 2)

# overall dynamics: quiet open, build to ~24 s, controlled fade after the logo
master = (0.55 + 0.45 * np.clip((t - 2) / 21, 0, 1)) * np.clip(t / 1.5, 0, 1) * np.clip((30 - t) / 2.2, 0, 1)
L *= master; R *= master
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.7, R / peak * 0.7
pcm = (np.stack([L, R], axis=1) * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("ok")
