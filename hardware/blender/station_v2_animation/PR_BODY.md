## Summary

Prepare the branded TERRA v2 exploded animation for rendering on another workstation.
The editable Blender 5.3 scene contains a front-armor wordmark, detailed conceptual
hardware modules, multi-angle cameras, and a 90-second explosion/inspection/reassembly
timeline. Rendering was cancelled at the user's request; no finished film is claimed.

## Changes

- Preserve the upstream v2 exterior and add 20 individually organized module assemblies.
- Add board-level leads, solder, traces, vias, contacts, passives, service leads and markings.
- Pack logo/solar textures, synchronize part visibility, and provide a resume-safe
  Cycles sequence renderer with Blender 5.3 VIDEO/H.264 encoding.
- Document exact timeline ranges, render transfer steps, benchmark requirements,
  existing preview evidence and remaining production review in RENDER_HANDOFF.md.

## Validation

- Original v2 exterior: 197 base meshes; detailed modules: 3677, including cutters.
- Sampled component shots isolate one module; exploded state includes all 20.
- Reviewed branded hero still and selected detail previews.
- Original rig check: ground error 2.33e-9 m; final transform error 0.
- Two-frame MP4 encoding smoke check succeeded.
- Thirteen 4K frames rendered before cancellation; full animation, collision review,
  final part-shot framing and final playback approval are still required.

## Scope

Only hardware/blender/station_v2_animation is included. Frame sequences, caches,
logs, temporary transfers and Blender backups are excluded. Internal dimensions
and packing remain conceptual. No web-app integration or completed MP4 is included.
