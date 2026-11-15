"""Fit all shots to their visible subjects and pack the checked scene."""
import bpy,math,sys
from pathlib import Path
from mathutils import Vector
s=bpy.context.scene;p=Path(bpy.data.filepath).parent
for o in s.objects:
 if o.name.startswith('Internal chassis rail'):
  for f,v in [(1,False),(864,False),(865,True),(1824,True),(1825,False)]:o.hide_render=v;o.keyframe_insert(data_path='hide_render',frame=f)
markers=sorted([m for m in s.timeline_markers if m.camera],key=lambda m:m.frame)
for k,m in enumerate(markers):
 start=m.frame;end=markers[k+1].frame-1 if k+1<len(markers) else 2160;c=m.camera
 for f in (start,end):
  s.frame_set(f);bpy.context.view_layer.update()
  pts=[o.matrix_world@Vector(v) for o in s.objects if o.type=='MESH' and o.name!='Studio_Backdrop' and not o.hide_render for v in o.bound_box]
  low=Vector(tuple(min(v[a] for v in pts) for a in range(3)));high=Vector(tuple(max(v[a] for v in pts) for a in range(3)));target=(low+high)*.5
  direction=c.rotation_euler.to_quaternion()@Vector((0,0,1));q=c.rotation_euler.to_quaternion().inverted()
  coords=[q@(v-target) for v in pts];tanx=math.tan(c.data.angle_x/2);tany=tanx*2160/3840
  dist=max(max(abs(v.x)/tanx,abs(v.y)/tany)*1.18+v.z for v in coords)
  c.location=target+direction*dist;c.keyframe_insert(data_path='location',frame=f)
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
if '--preview' in sys.argv:
 s.render.resolution_percentage=35;s.cycles.samples=24
 for f in (1,760,865):
  s.frame_set(f);s.render.filepath=str(p/'preview'/f'{f:04d}.png');bpy.ops.render.render(write_still=True)
