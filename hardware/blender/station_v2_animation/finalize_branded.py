import bpy,runpy
from pathlib import Path
s=bpy.context.scene;p=Path(bpy.data.filepath).parent
def follow(o,source):
 if o.animation_data:o.animation_data_clear()
 fc=o.driver_add('hide_render');d=fc.driver;d.type='SCRIPTED';v=d.variables.new();v.name='hidden';v.type='SINGLE_PROP';v.targets[0].id=source;v.targets[0].data_path='hide_render';d.expression='hidden'
for e in bpy.data.collections['02_Twenty_Hardware_Modules'].objects:
 if e.type!='EMPTY':continue
 board=next(x for x in e.children if x.name.startswith('PCB_'))
 for o in e.children:
  if o==board or o.name.startswith('Drill cutter'):continue
  follow(o,board)
follow(bpy.data.objects['TERRA front armor wordmark'],bpy.data.objects['Plate_Front'])
s.frame_set(1);s.render.resolution_percentage=100;s.cycles.samples=128
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
runpy.run_path(str(p/'check_details.py'))
s.frame_set(1);s.cycles.device='CPU';s.cycles.samples=16;s.render.resolution_percentage=35;s.render.threads_mode='FIXED';s.render.threads=6;s.render.filepath=str(p/'preview'/'Branded_Hero.png');bpy.ops.render.render(write_still=True)
