"""Blender -b TERRA_Exploded_Production.blend --python inspect_scene.py"""
import bpy,json
from pathlib import Path
from mathutils import Vector
s=bpy.context.scene;out=Path(bpy.data.filepath).parent
modules=list(bpy.data.collections['02_Twenty_Hardware_Modules'].objects)
roots=[o for o in modules if o.type=='EMPTY']
assert len(roots)==20,len(roots)
assert len({o.name[:2] for o in roots})==20
all_objects=[o for o in s.objects if o.type=='MESH']
feet=[o for o in all_objects if '_Tread_' in o.name]
samples=[];home={}
for f in (1,384,552,720,760,864,865,1345,1824,1944,2064,2160):
 s.frame_set(f);bpy.context.view_layer.update()
 if f==1:home={o.name:o.matrix_world.copy() for o in all_objects}
 ground=[(o.matrix_world@Vector(v)).z for o in feet for v in o.bound_box]
 samples.append({'frame':f,'camera':s.camera.name,'foot_min_z':min(ground),'foot_max_lower_bound':max(min((o.matrix_world@Vector(v)).z for v in o.bound_box) for o in feet)})
errors={o.name:max(abs(o.matrix_world[r][c]-home[o.name][r][c]) for r in range(4) for c in range(4)) for o in all_objects}
report={'modules':len(roots),'meshes':len(all_objects),'samples':samples,'return_transform_error':max(errors.values()),'render_engine':s.render.engine,'look':s.view_settings.look,'resolution':[s.render.resolution_x,s.render.resolution_y],'frames':s.frame_end,'conceptual_layout':True,'collision_check':'Requires visual inspection; bounding boxes alone cannot validate fitted parts.'}
(out/'verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
assert report['return_transform_error']<1e-6
