"""Mix the TERRA film soundtrack (30 s): narration lines placed on their scenes, ducked music bed,
looped wind ambience and sound effects, loudness-normalised."""
import os, subprocess, sys

A = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio")
OUT = sys.argv[1]
TEMPO = 1.04

# narration lines in take 1: (source start, source end, place at), seconds
VO = [(0.00, 3.30, 0.35), (4.56, 10.74, 3.95), (11.36, 16.84, 10.30), (17.33, 23.38, 15.80),
      (24.47, 28.84, 22.00), (29.95, 30.45, 26.60), (31.47, 33.10, 27.30)]
# sound effects: (file, at, gain)
SFX = [("whoosh2.mp3", 9.70, 0.32), ("whoosh3.mp3", 15.20, 0.26), ("whoosh3.mp3", 19.30, 0.16),
       ("whoosh2.mp3", 21.40, 0.28), ("whoosh2.mp3", 25.90, 0.32),
       ("pulse1.mp3", 4.40, 0.22), ("pulse2.mp3", 5.15, 0.22), ("pulse1.mp3", 5.90, 0.22), ("pulse2.mp3", 6.65, 0.22),
       ("impact2.mp3", 10.55, 0.55), ("pulse2.mp3", 11.10, 0.16), ("pulse1.mp3", 11.70, 0.16),
       ("impact1.mp3", 26.25, 0.30), ("impact1.mp3", 27.00, 0.95)]

inputs = ["vo-take1.mp3", "music.wav", "wind4.mp3"] + sorted({f for f, _, _ in SFX})
idx = {name: i for i, name in enumerate(inputs)}
uses = {name: 0 for name in inputs}
for f, _, _ in SFX:
    uses[f] += 1
uses["vo-take1.mp3"] = len(VO)

g = []
for name, i in idx.items():
    n = uses.get(name, 1)
    g.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo" + (f",asplit={n}" + "".join(f"[{i}s{k}]" for k in range(n)) if n > 1 else f"[{i}s0]"))

# narration
vo_labels = []
for k, (s, e, at) in enumerate(VO):
    lab = f"vo{k}"
    g.append(f"[{idx['vo-take1.mp3']}s{k}]atrim={s}:{e},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,"
             f"afade=t=out:st={e - s - 0.06:.2f}:d=0.06,atempo={TEMPO},adelay={int(at * 1000)}:all=1[{lab}]")
    vo_labels.append(f"[{lab}]")
g.append("".join(vo_labels) + f"amix=inputs={len(VO)}:normalize=0,apad=whole_dur=30,atrim=0:30,"
         "highpass=f=70,acompressor=threshold=0.12:ratio=2.5:attack=8:release=120,volume=1.15,asplit=2[vo][vosc]")

# wind: forward/reversed copies joined without clicks, two passages (dawn aerial, golden hour)
w = idx["wind4.mp3"]
g.append(f"[{w}s0]asplit=2[wa][wb];[wb]areverse[wr];[wa][wr]concat=n=2:v=0:a=1,asplit=2[wc][wd];"
         f"[wd]areverse[we];[wc][we]concat=n=2:v=0:a=1,lowpass=f=5000,asplit=2[w1][w2]")
g.append("[w1]atrim=0:10.6,afade=t=in:d=1.2,afade=t=out:st=9.4:d=1.2,volume=0.55[wind1]")
g.append("[w2]atrim=0:4.8,afade=t=in:d=0.8,afade=t=out:st=3.8:d=1.0,volume=0.35,adelay=21600:all=1[wind2]")

# effects
fx = []
count = {name: 0 for name in inputs}
for k, (f, at, gain) in enumerate(SFX):
    i = idx[f]; c = count[f]; count[f] += 1
    extra = ",aecho=0.8:0.6:180|420:0.35|0.22" if f == "impact1.mp3" and gain > 0.5 else ""
    g.append(f"[{i}s{c}]volume={gain}{extra},adelay={int(at * 1000)}:all=1[fx{k}]")
    fx.append(f"[fx{k}]")

# bed = music + wind + effects, ducked under the narration
g.append(f"[{idx['music.wav']}s0]volume=0.42[mus]")
g.append("[mus][wind1][wind2]" + "".join(fx) + f"amix=inputs={3 + len(fx)}:normalize=0,apad=whole_dur=30,atrim=0:30[bed]")
g.append("[bed][vosc]sidechaincompress=threshold=0.04:ratio=5:attack=25:release=450:makeup=1[duck]")
g.append("[duck][vo]amix=inputs=2:normalize=0,apad=whole_dur=30,atrim=0:30,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad=whole_dur=30,atrim=0:30[out]")

cmd = ["ffmpeg", "-loglevel", "error", "-y"]
for name in inputs:
    cmd += ["-i", os.path.join(A, name)]
cmd += ["-filter_complex", ";".join(g), "-map", "[out]", "-ar", "48000", "-c:a", "pcm_s16le", OUT]
subprocess.run(cmd, check=True)
print("ok", OUT)
