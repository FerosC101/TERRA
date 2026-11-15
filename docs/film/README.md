# TERRA — 30-second promotional film

The film plays on the website ([`public/landing/terra-promo.mp4`](../../public/landing/terra-promo.mp4), web encode,
1920 × 1080 · 30 fps · 30 s · H.264 + AAC, with English captions in `terra-promo.vtt`). The full-quality master is not
kept in git to keep the repository small; re-create it with the scripts in `src/`.

> **SI-generated.** This film was made with Super Intelligence (SI) tools. A visible "SI-generated" mark stays on
> screen for its full length, and the file's metadata repeats the note below. See also [`si-use.json`](../../si-use.json).

## Shot list

| Time | Scene | What you see | Narration |
|---|---|---|---|
| 0:00–0:03.9 | A field has a memory | Dawn aerial over farmland, descending toward one corn field | "Every field has a story. But are we reading the signs?" |
| 0:03.9–0:10.1 | Seeing beneath the surface | Four aligned data layers wipe in over the field: rainfall, soil moisture, vegetation, temperature | "TERRA brings NASA Earth observations and field data together…" |
| 0:10.1–0:15.6 | The Living Field Model | The field separates into five layers: climate, vegetation, rotation, soil, water | "Its Living Field Model connects environmental patterns…" |
| 0:15.6–0:19.6 | Experiment with the future | Four plots of corn, mungbean, peanut and sweet potato change crop each season | "Then, explore crop rotations…" |
| 0:19.6–0:21.8 | The real product | Screen recording of TERRA's Rotation Lab | (continues) |
| 0:21.8–0:26.3 | From insight to adaptation | Golden-hour flight over the corn | "Turning environmental intelligence…" |
| 0:26.3–0:30 | Brand reveal | Point of light, expanding ring, the TERRA mark with a light sweep | "TERRA. A smarter way to understand the land." |

## What is real and what is not

- **The 3D scenes are conceptual visualizations**, labelled "Conceptual 3D visualization" on screen. The data
  layers, layer patterns and crop growth are illustrative; they do not show measurements, NASA imagery or results.
- **The Rotation Lab clip is a real screen recording** of the running TERRA app, labelled on screen. The app was
  showing its demo data, which the app itself labels as demo.
- No NASA logos, flags or mission identifiers appear.

## How it was made

| Part | Tool | Notes |
|---|---|---|
| 3D scenes | Blender 5.2 (EEVEE), scripted in Python | Procedural terrain, field parcels, instanced crops (Geometry Nodes), data layers, the layered field model, crop-rotation time-lapse and the brand reveal. Scripts written with Claude Code (Anthropic). |
| Narration | ElevenLabs, Eleven Multilingual v2 | Voice: "Steven – Deep Documentary Narrator". Lines were placed on their scenes and gently time-stretched (×1.04, pitch preserved). |
| Sound effects | ElevenLabs text-to-sound | Wind, whooshes, soft data pulses, low impacts. |
| Music bed | Synthesised in code (numpy) | A warm pad (D – Bm – G – D) with a soft pulse; the available ElevenLabs connector could not generate music. |
| App footage | Headless Chrome | Captured frame by frame from the running app at 1920 × 1080. |
| Typography, assembly | Pillow, ffmpeg | Avenir Next titles, crossfades, labels, loudness-normalised mix (−16 LUFS target). |

The scene and assembly scripts are in [`src/`](src/): `film.py` (Blender scenes), `titles.py`, `music.py`,
`mix.py` and `assemble.py`.

## SI disclosure (as embedded in the file metadata)

SI-generated: TERRA promotional film. Narration (Steven - Deep Documentary Narrator, Eleven Multilingual v2) and
sound effects generated with ElevenLabs; 3D scenes built procedurally in Blender 5.2 from scripts written with
Claude Code (Anthropic); music bed synthesised in code. Rotation Lab footage is a real screen recording of the TERRA
app showing demo data. 3D scenes are conceptual visualizations, not real data.
