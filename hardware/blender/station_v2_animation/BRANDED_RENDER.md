# Branded animation render

Open `TERRA_Branded_Detailed.blend` for the branded production scene.
The front wordmark comes from `app/BRANDING/TERRA Green Leaf Wordmark.png`;
light lettering is rendered in forest ink for contrast on the armor. Its texture
and the solar texture are packed. The logo follows the front plate during explosion.

Geometry inspection (base meshes, before evaluated modifiers):

| Asset | Mesh objects | Vertices | Polygons |
|---|---:|---:|---:|
| Original v2 exterior | 197 | 10,642 | 8,258 |
| Original conceptual modules | 649 | 16,568 | 9,580 |
| Detailed modules | 3,677 | 54,472 | 34,588 |

The detailed count includes 80 hidden drilling cutters. It excludes curves used
for routed traces, service leads, and silkscreen. Shared mesh topology keeps
repeated pins and passive components efficient. Count alone is not a realism score.
New visible detail includes IC pins, solder fillets, trace routing, vias, resistors
with end caps, capacitors, connector mouths and contacts, battery caps and tabs,
shield tabs, heat-sink screws, and board markings. Layouts remain conceptual.

Fresh visibility checks in `detailed_verification.json` confirm 20 modules in the
exploded state and one module in sampled dedicated shots. Accessory details and
the front logo follow their parent visibility. Reviewed previews are in `preview`.

The 4K/24fps/2160-frame Cycles render writes `frames_branded/frame_####.png`,
then uses Blender 5.3's VIDEO media API to encode `TERRA_90s_4K.mp4`.
A two-frame MP4 smoke check succeeded. The full MP4 is not complete until
`render_progress.json` reports `encoded`. Check `render_job.json` for the process
and `master_render.log` / `master_render_errors.log` for output. Resume with:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe' -b TERRA_Branded_Detailed.blend --python render_film.py
```

The renderer uses OptiX, a writable project cache, persistent render data,
and one-time baking of static PCB drilling. It stops if free disk drops below
2 GB. Existing numbered frames are reused; remove outdated frames if changing
the scene. Final animation playback and grading require review after encoding.

Skills: blender-motion-state-inspection and verification-before-completion.
Self-evaluation: accuracy 4/5 (measured counts, conceptual layout), completeness
3/5 (full encode and playback review pending), clarity 4/5 (status recorded),
actionability 4/5 (resume workflow and logs), conciseness 4/5 (separate draft and
branded status documents remain). Overall 3.8/5; finish render and playback review.
