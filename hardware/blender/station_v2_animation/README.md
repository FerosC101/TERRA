# TERRA v2 animation production

Rendering is cancelled. Open `TERRA_Branded_Detailed.blend` and read
`RENDER_HANDOFF.md` for the current scene, evidence, limitations, and resume steps.

Source: FerosC101/TERRA commit 25c63adaf47091932ba094a80841d7b18ef39894.
The original v2 blend and solar texture are preserved beside the production scripts.
The exterior uses its original 12 canopy facets. Electronics and accessory placement
are conceptual, not verified manufacturing drawings. No app files are changed.

## Commands

Run from this directory with Blender 5.3:

```powershell
$blender = 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe'
& $blender -b --python produce.py -- --preview
& $blender -b TERRA_Exploded_Production.blend --python inspect_scene.py
& $blender -b TERRA_Exploded_Production.blend --python render_stills.py
& $blender -b TERRA_Branded_Detailed.blend --python render_film.py
```

`produce.py` rebuilds the scene from source. `repair_preview.py` is a one-time
migration of the initial build and must not be run on a regenerated scene.
The film renderer resumes existing numbered frames. Remove affected cached frames
after any scene change. Film output is silent, 2160 frames, 4K, 24 fps.

## Layout and review

The timeline contains hero shots, four angles, staged explosion, two exploded
angles, twenty isolated module shots, and reassembly. The parts manifest lists
the 20 module roots and their conceptual operating accessory status. The battery,
GNSS, optics, shield, collector, radiation diffuser, probes, storage and RTC have
distinct details; several logic boards still share generic component layouts.

The current scene is a production draft. Detailed connector separation,
collision-free internal packing, dedicated exterior detail shots, five-second
standalone module clips, contact sheets and final visual grading remain unfinished.
Do not describe the conceptual interiors as engineering validated.

Skills applied: blender-motion-state-inspection, verification-before-completion,
agent-self-evaluation. The verification JSON records measured state; visual and
collision approval must accompany it before final production acceptance.
