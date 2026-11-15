# TERRA branded v2 animation — render handoff

## Current state

Rendering was cancelled at the user's request on 15 November 2026. Do not restart
automatically. The render job launched here (PID 18596) was stopped; unrelated
Blender processes were not stopped. Thirteen completed 4K frames are retained
locally in `frames_branded/`. No complete 90-second MP4 exists.

The last progress record measured 3354.45 seconds for 13 frames (258.04 seconds
per frame on this run, including overhead). This is not a reliable estimate for
another workstation, but it does not support completion before the user's 4:30
deadline. Benchmark the target machine before committing to a delivery time.

## Open this file

`TERRA_Branded_Detailed.blend` is the final handoff scene. It includes the packed
solar texture and front-armor wordmark, 20 conceptual module assemblies, animated
explosion/reassembly, multi-angle cameras, and isolated component shots.
It opens in Blender 5.3.0, Cycles, AgX / Medium High Contrast. The native v2 source
is preserved as `source_v2.blend`. Source Git commit:
`25c63adaf47091932ba094a80841d7b18ef39894` in FerosC101/TERRA.

The module arrangement is conceptual, not a verified mechanical design. See
`parts.json`, `detail_counts.json`, and `detailed_verification.json`. Base mesh
counts: v2 exterior 197; detailed modules 3677, including 80 invisible drilling
cutters. New detail includes leads, solder, traces, vias, passive components,
connector cavities and contacts, fasteners, battery tabs, cables and PCB markings.

## Review evidence and remaining work

- `preview/Branded_Hero.png`: reviewed after correcting accessory visibility.
- `preview/Detailed_GNSS.png`: detail preview from before the final visibility-driver
  correction; rerender individual components to approve final framing.
- `detailed_verification.json`: 20 modules visible in the exploded state; one
  module visible in sampled isolated shots; logo follows the front armor visibility.
- `verification.json`: original production rig's floor error 2.33e-9 m and return
  transform error 0. The full detailed scene still needs final animation review.
- A two-frame H.264 encoding smoke test succeeded using Blender 5.3's VIDEO API.
  `encode_smoke.mp4` is a technical test, not the film.

Still required: collision review of the conceptual internal packing, chassis reveal
refinement, full-timeline playback, all part-shot framing, camera-cut review, and
final grading. Several boards share generic layouts. Dedicated five-second
component clips, exterior detail renders, and the contact sheet are not delivered.

## Timeline (24 fps, 2160 frames)

| Frames | Content |
|---|---|
| 1–192 | Assembled hero |
| 193–384 | Front, left, right and top cameras |
| 385–720 | Explode |
| 721–864 | Two elevated exploded angles |
| 865–1824 | Twenty module shots, 48 frames each |
| 1825–2064 | Reassembly |
| 2065–2160 | Final hero |

## Render on another workstation

1. Open the final blend and inspect representative frames: 1, 552, 760, 820,
   865, 1105, 1345, 1824, 1944, and 2160. Set a supported Cycles GPU backend.
2. Benchmark three frames at the intended resolution and sample count. For a
   deadline preview, use a separately named output at 1080p and 16–32 samples;
   do not mix preview frames into the 4K sequence.
3. The supplied `render_film.py` selects OptiX for the RTX workstation used here.
   Change that backend for another GPU, or select CPU explicitly. It bakes static
   PCB booleans once and uses persistent render data.
4. For the 4K master, run from this directory:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe' -b TERRA_Branded_Detailed.blend --python render_film.py
```

5. The script resumes `frames_branded/frame_####.png`, writes progress JSON, and
   encodes `TERRA_90s_4K.mp4` after all 2160 frames finish. Copy the thirteen local
   frames separately if resuming elsewhere; they are excluded from the PR/package.
   Remove old frames if changing the scene or render settings. The current
   resume check verifies existence and size, not image integrity.
6. Provide sufficient disk space for the PNG sequence. The script stops when
   available space falls below 2 GB. Inspect any partial final frame after a
   forced stop and remove it before resuming.
7. Verify 3840×2160, 24 fps, 2160 frames, 90 seconds, correct order, no missing
   frames, and visual continuity. Only then report the film complete.

## Rebuild and provenance

For editing, use the final blend directly. Rebuilding runs `produce.py`, then
`detail_and_brand.py`, then `finalize_branded.py` against the appropriate generated
blend. The latter scripts add geometry/drivers and are not idempotent; do not run
them repeatedly on the final scene. `repair_preview.py` is an obsolete one-time
migration and must not be run on the handoff scene. The logo is bundled as `textures/terra_wordmark.png`, copied from the upstream
`app/BRANDING/TERRA Green Leaf Wordmark.png`. No app checkout is needed to rebuild.

## PR scope

Add only `hardware/blender/station_v2_animation/`: editable scenes, scripts,
packed-source texture, previews, manifests, and this handoff. No web-app changes
are required for this render handoff. Exclude frame sequences, caches, machine
logs, process IDs, base64 transfers, smoke-video outputs, and `.blend1` backups.
The original station_v2 directory remains the upstream visual baseline.

Submission branch: `hardware`; PR base: `main`.
Suggested PR title: `feat: hand off branded TERRA v2 exploded animation for rendering`.

Skills applied: blender-motion-state-inspection, verification-before-completion,
agent-self-evaluation, and ecc-cmd-pr. Rendering and final visual approval remain
the receiving operator's responsibility.
