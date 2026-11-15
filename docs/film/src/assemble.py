"""Assemble the TERRA 30-second film: Blender segments + real app footage, crossfades,
typography, labels, SI watermark and the mixed soundtrack -> H.264 MP4 (1920x1080, 30 fps)."""
import os, subprocess, sys

D = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
SEGMENTS = [  # (frames pattern, graded with vignette)
    ("frames/landscape/f_%04d.png", True),   # 0.0 - 10.3
    ("frames/lfm/f_%04d.png", True),         # 9.9 - 15.8
    ("frames/rotation/f_%04d.png", True),    # 15.4 - 19.8
    ("app/a_%04d.png", False),               # 19.4 - 22.0  real screen recording
    ("frames/golden/f_%04d.png", True),      # 21.6 - 26.5
    ("frames/brand/f_%04d.png", False),      # 26.1 - 30.0
]
XFADE = [9.9, 15.4, 19.4, 21.6, 26.1]  # transition starts (0.4 s each)
OVERLAYS = [  # (png, fade-in start, fade-in dur, fade-out start or None, fade-out dur)
    ("label-concept", 0.0, 0.01, 19.25, 0.3),
    ("label-concept", 21.75, 0.3, 25.95, 0.3),
    ("label-app", 19.55, 0.3, 21.6, 0.3),
    ("t1", 0.7, 0.6, 3.3, 0.5),
    ("t2", 4.7, 0.6, 9.2, 0.5),
    ("t3", 10.7, 0.6, 15.0, 0.5),
    ("t4", 15.9, 0.5, 19.0, 0.4),
    ("t4b", 16.5, 0.6, 19.0, 0.4),
    ("t5", 22.5, 0.6, 25.8, 0.5),
    ("t6", 27.3, 0.7, None, 0),
    ("t6b", 27.8, 0.7, None, 0),
    ("label-si", 0.0, 0.01, None, 0),
]
NOTE = ("SI-generated: TERRA promotional film. Narration (Steven - Deep Documentary Narrator, Eleven Multilingual v2) "
        "and sound effects generated with ElevenLabs; 3D scenes built procedurally in Blender 5.2 from scripts written "
        "with Claude Code (Anthropic); music bed synthesised in code. Rotation Lab footage is a real screen recording of "
        "the TERRA app showing demo data. 3D scenes are conceptual visualizations, not real data.")

cmd = ["ffmpeg", "-loglevel", "error", "-y"]
for pat, _ in SEGMENTS:
    cmd += ["-framerate", "30", "-i", os.path.join(D, pat)]
for name, *_ in OVERLAYS:
    cmd += ["-loop", "1", "-framerate", "30", "-t", "30", "-i", os.path.join(D, "titles", name + ".png")]
cmd += ["-i", os.path.join(D, "audio", "mix.wav")]

g = []
for i, (_, grade) in enumerate(SEGMENTS):
    chain = f"[{i}:v]scale=1920:1080:flags=lanczos,fps=30,format=yuv444p,setsar=1"
    if grade:
        chain += ",vignette=angle=PI/6:mode=forward"
    g.append(chain + f"[s{i}]")
prev = "s0"
for k, off in enumerate(XFADE):
    g.append(f"[{prev}][s{k + 1}]xfade=transition=fade:duration=0.4:offset={off}[x{k}]")
    prev = f"x{k}"
base = prev
n0 = len(SEGMENTS)
for j, (name, ti, td, to, tod) in enumerate(OVERLAYS):
    f = f"[{n0 + j}:v]format=rgba,fade=t=in:st={ti}:d={td}:alpha=1"
    if to is not None:
        f += f",fade=t=out:st={to}:d={tod}:alpha=1"
    g.append(f + f"[o{j}]")
    g.append(f"[{base}][o{j}]overlay=0:0:format=auto:eof_action=pass[v{j}]")
    base = f"v{j}"
g.append(f"[{base}]trim=0:30,format=yuv420p[vout]")

cmd += ["-filter_complex", ";".join(g), "-map", "[vout]", "-map", f"{n0 + len(OVERLAYS)}:a",
        "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-t", "30", "-movflags", "+faststart",
        "-metadata", "title=TERRA — Discover. Predict. Regenerate.",
        "-metadata", f"comment={NOTE}", "-metadata", f"description={NOTE}", OUT]
subprocess.run(cmd, check=True)
print("ok", OUT)
