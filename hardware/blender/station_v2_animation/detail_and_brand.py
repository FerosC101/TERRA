"""Enhance existing v2 production parts without replacing its exterior."""
import bpy,math,json,bmesh,time
from pathlib import Path
from mathutils import Vector,Matrix
P=Path(__file__).resolve().parent;s=bpy.context.scene;s.frame_set(1)
start=time.time();modules=bpy.data.collections['02_Twenty_Hardware_Modules'];ext=bpy.data.collections['01_V2_Exterior']
def stats(objects):
 meshes=[o for o in objects if o.type=='MESH'];return {'mesh_objects':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),'polygons':sum(len(o.data.polygons) for o in meshes)}
before=stats(modules.objects);exterior=stats(ext.objects)
def material(n,col,metal=0,rough=.4):
 m=bpy.data.materials.new(n);m.diffuse_color=(*col,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*col,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;return m
tin=material('Solder tin',(.48,.51,.52),.9,.28);ceramic=material('Ceramic passives',(.23,.19,.13),0,.65);copper=material('PCB copper routing',(.12,.25,.14),.55,.4);ink=material('PCB silkscreen',(.62,.69,.6));black=material('Connector polymer',(.015,.018,.02),0,.5);gold=material('Gold plated contacts',(.62,.39,.09),.85,.24);steel=material('Machined steel',(.36,.39,.42),.9,.27);red=material('Power positive',(.32,.012,.009));rubber=material('Cable jacket',(.015,.017,.019),0,.64)
templates={}
for shape in ('cube','cyl'):
 bm=bmesh.new()
 if shape=='cube':bmesh.ops.create_cube(bm,size=1)
 else:bmesh.ops.create_cone(bm,cap_ends=True,cap_tris=False,segments=16,radius1=1,radius2=1,depth=1)
 me=bpy.data.meshes.new('Detail template '+shape);bm.to_mesh(me);bm.free();templates[shape]=me
def part(n,loc,size,mat,parent,shape='cube'):
 # Shared topology per shape/material keeps thousands of separate details efficient.
 key=(shape,mat.name)
 if key not in templates:
  me=templates[shape].copy();me.materials.clear();me.materials.append(mat);templates[key]=me
 o=bpy.data.objects.new(n,templates[key]);modules.objects.link(o);o.parent=parent;o.location=loc;o.scale=size
 # Inherit component visibility during isolated shots and accessory stowage.
 prototype=next((x for x in parent.children if x.name.startswith('PCB_')),None)
 if prototype and prototype.animation_data:o.animation_data_create();o.animation_data.action=prototype.animation_data.action
 return o
def wire(n,points,mat,parent,r=.001):
 cu=bpy.data.curves.new(n,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=3
 sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
 for v,p in zip(sp.bezier_points,points):v.co=p;v.handle_left_type='AUTO';v.handle_right_type='AUTO'
 o=bpy.data.objects.new(n,cu);modules.objects.link(o);o.parent=parent;cu.materials.append(mat)
 prototype=next((x for x in parent.children if x.name.startswith('PCB_')),None)
 if prototype and prototype.animation_data:o.animation_data_create();o.animation_data.action=prototype.animation_data.action
 return o
roots=sorted([o for o in modules.objects if o.type=='EMPTY'],key=lambda o:o.name)
for index,e in enumerate(roots,1):
 # Actual plated through-holes in the board, not printed dots.
 board=next(x for x in e.children if x.name.startswith('PCB_'))
 cutters=[]
 for x in (-.026,.026):
  for y in (-.016,.016):
   cut=part('Drill cutter',(x,y,0),(.00165,.00165,.008),black,e,'cyl');cutters.append(cut)
   mod=board.modifiers.new('Through mounting hole','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut
   cut.hide_render=True;cut.hide_viewport=True
   # Do not inherit animated visibility for construction cutters.
   cut.animation_data_clear()
   part('Mount plated shoulder',(x,y,.0012),(.0023,.0023,.0006),gold,e,'cyl')
   part('Fastener recess',(x,y,.0047),(.0005,.0018,.00015),black,e)
 # Fine package leads, alternating signal traces and vias, solder joints.
 for side in (-1,1):
  for k in range(10):
   x=-.009+k*.002
   part('IC gull wing lead',(x,side*.0103,.0026),(.00065,.003,.0005),tin,e)
   part('Solder fillet',(x,side*.0119,.00125),(.001,.0013,.0006),tin,e)
   wire('Signal trace',[(x,side*.012,.00086),(x,side*.013,.00086),(x+.002,side*.015,.00086),(x+.002,side*.018,.00086)],copper,e,.00012)
   part('Signal via',(x+.002,side*.018,.00093),(.00035,.00035,.00015),gold,e,'cyl')
 for side in (-1,1):
  for k in range(7):part('IC side lead',(side*.012,-.006+k*.002,.0026),(.003,.00065,.0005),tin,e)
 # Populated banks of passives with individual end caps and decoupling capacitors.
 for k in range(14):
  x=-.027+(k%7)*.008;y=(-.012 if k<7 else .012)
  part('Precision resistor',(x,y,.0024),(.0032,.0015,.001),ceramic,e)
  for dx in (-.00125,.00125):part('Resistor termination',(x+dx,y,.0024),(.0007,.0016,.0011),tin,e)
  part('Capacitor',(x,y*.7,.0028),(.002,.0013,.0016),ceramic,e)
 # A keyed socket with a recessed mouth and six separately modeled contacts.
 part('Socket housing',(0,-.028,.006),(.025,.009,.009),black,e)
 part('Socket mouth',(0,-.0326,.006),(.021,.0006,.005),steel,e)
 for k in range(6):part('Socket contact',(-.008+k*.0032,-.033,.006),(.0008,.001,.0018),gold,e)
 # Local connector tails remain with the module throughout the explosion.
 for k,mat in enumerate((red,rubber)):
  wire('Service lead',[(.012+k*.004,-.026,.005),(.025+k*.004,-.045,.01),(.04+k*.004,-.038,.012),(.045+k*.004,-.028,.005)],mat,e,.00075)
 # Board reference marking is physical silkscreen geometry, no screen overlay.
 cu=bpy.data.curves.new('Board marking','FONT');cu.body=f'TERRA  {index:02d}\nREV A';cu.size=.0032;cu.extrude=0
 o=bpy.data.objects.new('PCB reference',cu);modules.objects.link(o);o.parent=e;o.location=(-.027,-.007,.00092);cu.materials.append(ink)
 if board.animation_data:o.animation_data_create();o.animation_data.action=board.animation_data.action
 if index==3:
  for x in (-.035,0,.035):
   for y in (-.027,.027):
    part('Cell positive cap',(x,y,.062),(.011,.011,.001),steel,e,'cyl')
    part('Spot welded nickel strip',(x,y,.0635),(.007,.025,.0005),tin,e)
 if index==6:
  for x in (-.02,.02):
   for y in (-.012,.012):part('Heat sink screw',(x,y,.022),(.0017,.0017,.002),steel,e,'cyl')
 if index in (5,6,8):
  for k in range(4):part('Shield perimeter tab',(-.014+k*.009,.013,.009),(.003,.002,.004),tin,e)
print('DETAIL_ADDED',time.time()-start,flush=True)
# Powder-coated armor receives a thin printed wordmark, parented to the plate.
plate=bpy.data.objects['Plate_Front'];image=bpy.data.images.load(str(P/'textures'/'terra_wordmark.png'),check_existing=True)
print('LOGO_IMAGE',image.size[:],image.channels,flush=True)
image.pack();m=bpy.data.materials.new('TERRA printed logo');m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear()
tex=n.new('ShaderNodeTexImage');tex.image=image;bs=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial')
# White lettering becomes dark forest ink to retain contrast on off-white armor.
bw=n.new('ShaderNodeRGBToBW');l.new(tex.outputs['Color'],bw.inputs[0]);test=n.new('ShaderNodeMath');test.operation='GREATER_THAN';test.inputs[1].default_value=.8;l.new(bw.outputs[0],test.inputs[0]);mix=n.new('ShaderNodeMixRGB');l.new(test.outputs[0],mix.inputs[0]);l.new(tex.outputs['Color'],mix.inputs[1]);mix.inputs[2].default_value=(.012,.043,.025,1)
l.new(mix.outputs[0],bs.inputs['Base Color']);l.new(tex.outputs['Alpha'],bs.inputs['Alpha']);bs.inputs['Roughness'].default_value=.58;l.new(bs.outputs[0],out.inputs[0])
me=bpy.data.meshes.new('Logo decal');me.from_pydata([(-.43,-1.119,2.45),(.43,-1.119,2.45),(.43,-1.119,2.67),(-.43,-1.119,2.67)],[],[(0,1,2,3)]);me.materials.append(m)
uv=me.uv_layers.new()
for loop,xy in zip(me.polygons[0].loop_indices,[(.04,.30),(.97,.30),(.97,.71),(.04,.71)]):uv.data[loop].uv=xy
logo=bpy.data.objects.new('TERRA front armor wordmark',me);ext.objects.link(logo);logo.parent=plate
if plate.animation_data:logo.animation_data_create();logo.animation_data.action=plate.animation_data.action
after=stats(modules.objects);report={'v2_exterior':exterior,'modules_before':before,'modules_after':after,'note':'Detail meshes include shared topology, through-hole cutters, pins, solder, passives, contacts; curves and lettering counted separately.'}
(P/'detail_counts.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
# Detect supported Cycles GPU devices; retain CPU only if no accelerator is usable.
try:
 pref=bpy.context.preferences.addons['cycles'].preferences
 for backend in ('OPTIX','CUDA','HIP','ONEAPI'):
  try:
   pref.compute_device_type=backend;pref.get_devices();gpu=[d for d in pref.devices if d.type!='CPU']
   if gpu:
    for d in pref.devices:d.use=d.type!='CPU'
    s.cycles.device='GPU';print('GPU',backend,[d.name for d in gpu],flush=True);break
  except Exception:pass
except Exception:pass
s.frame_set(1);s.render.resolution_percentage=100;s.cycles.samples=128
bpy.ops.wm.save_as_mainfile(filepath=str(P/'TERRA_Branded_Detailed.blend'))
s.render.resolution_percentage=50;s.cycles.samples=32
for f,nm in [(1,'Branded_Hero'),(865,'Detailed_GNSS'),(1105,'Detailed_AI')]:
 s.frame_set(f);s.render.filepath=str(P/'preview'/f'{nm}.png');bpy.ops.render.render(write_still=True)
