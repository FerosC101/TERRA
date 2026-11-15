"""Apply checked production corrections to an existing generated scene."""
import bpy
from pathlib import Path
s=bpy.context.scene;p=Path(bpy.data.filepath).parent
# Existing build had a -0.239 m floor offset after source unit conversion.
for e in bpy.data.collections['03_Assembly_Rig'].objects:
 if not e.name.startswith('Assembly_'):continue
 for o in e.children:o.location.z+=.239
for image in bpy.data.images:
 if image.source=='FILE':image.filepath=str(p/'textures'/'solar_panel.png');image.reload();image.pack()
# Production component shots isolate exterior and every nonselected module.
device=list(bpy.data.collections['01_V2_Exterior'].objects)
roots=sorted([o for o in bpy.data.collections['02_Twenty_Hardware_Modules'].objects if o.type=='EMPTY'],key=lambda o:o.name)
for o in device:
 if o.name=='Body_Core':continue
 for f,v in [(1,False),(864,False),(865,True),(1824,True),(1825,False)]:o.hide_render=v;o.keyframe_insert(data_path='hide_render',frame=f)
for i,e in enumerate(roots):
 for o in e.children:
  for f,v in [(864,False),(865,True),(1824,True),(1825,False),(865+i*48,False),(912+i*48,False)]:o.hide_render=v;o.keyframe_insert(data_path='hide_render',frame=f)
  if i<19:o.hide_render=True;o.keyframe_insert(data_path='hide_render',frame=913+i*48)
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
s.render.resolution_percentage=35;s.cycles.samples=24
for f in (1,760,865,1345):
 s.frame_set(f);s.render.filepath=str(p/'preview'/f'{f:04d}.png');bpy.ops.render.render(write_still=True)
