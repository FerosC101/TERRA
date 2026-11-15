"""Run with Blender -b --python produce.py [-- --preview | --render]."""
import bpy, math, json, sys, hashlib
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(P/'source_v2.blend'))
s=bpy.context.scene
root=bpy.data.objects['TERRA_Station']
root.scale=(.2,)*3
root.location*=.2
root.location.z-=.001
bpy.context.view_layer.update()
# v2's authored coordinate system is retained, including its 25 degree heading.
device=list(root.children_recursive)
def collection(name):
 c=bpy.data.collections.new(name);s.collection.children.link(c);return c
ext=collection('01_V2_Exterior');mods=collection('02_Twenty_Hardware_Modules');rig=collection('03_Assembly_Rig');studio=collection('04_Studio');cams=collection('05_Cameras')
def move(o,c):
 for old in list(o.users_collection):old.objects.unlink(o)
 c.objects.link(o)
for o in device:move(o,ext)
move(root,rig)
def mat(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
 return m
pcb=mat('FR4 solder mask',(.018,.12,.065));black=mat('Moulded packages',(.012,.014,.018));silver=mat('Brushed aluminium',(.48,.51,.55),.85,.3);gold=mat('Connector contacts',(.5,.32,.075),.8);white=mat('Sensor shield',(.8,.81,.77));blue=mat('Battery wrap',(.035,.08,.19),.1)
def cube(name,loc,size,material,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(material);be=o.modifiers.new('Machined edges','BEVEL');be.width=min(size)*.1;be.segments=3
 if parent:o.parent=parent
 move(o,mods);return o
def cyl(name,loc,r,depth,material,parent=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(material)
 if parent:o.parent=parent
 move(o,mods);return o
def empty(name,c):
 o=bpy.data.objects.new(name,None);c.objects.link(o);return o
names=['GNSS Receiver Module','Solar Power Regulation Board','Battery Pack','Battery Management System BMS','Main Controller ESP32 STM32','Edge AI Processing Module','Main PCB','Communication Module LoRa LTE WiFi','Multispectral Camera Module','Camera Interface Module','Environmental Sensor Board','Rainfall Sensor Module','Solar Radiation Sensor','Soil Moisture Sensor Array','Soil Temperature Sensor Array','Soil Electrical Conductivity Module','Analog to Digital Converter ADC','MicroSD Storage Module','Real Time Clock RTC','Power Distribution Board']
manifest=[];module_roots=[]
for i,name in enumerate(names,1):
 e=empty(f'{i:02d}_{name}',mods);module_roots.append(e)
 # Four internal trays; external instruments remain detached accessories.
 external=i in (11,12,13,14,15,16)
 home=Vector((((i%3)-1)*.075,((i//3%2)-.5)*.11,.35+(i//6)*.13))
 if external:home=Vector((.7+(i-11)*.1,.5,.13))
 e.location=home
 board=cube('PCB_'+str(i),(0,0,0),(.065,.045,.0016),pcb,e)
 for x in (-.026,.026):
  for y in (-.016,.016):
   cyl('Standoff',(x,y,-.006),.0025,.01,silver,e);cyl('Mount screw',(x,y,.003),.0015,.003,silver,e)
 cube('IC package',(0,0,.004),(.022,.018,.005),black,e)
 for k in range(12):
  x=-.027+(k%6)*.01;y=(-1 if k<6 else 1)*.017
  cube('Surface mount passive',(x,y,.0025),(.004,.002,.002),silver,e)
 for k in range(6):cube('Header contact',(-.023+k*.009,.024,.004),(.0015,.006,.006),gold,e)
 cube('Keyed connector',(0,-.025,.005),(.021,.007,.008),black,e)
 if i==1: cube('Ceramic GNSS patch',(0,0,.012),(.025,.025,.009),white,e)
 if i==3:
  for x in (-.035,0,.035):
   for y in (-.027,.027):cyl('Battery cell',(x,y,.031),.014,.061,blue,e)
  cube('Battery retaining strap',(0,0,.064),(.1,.012,.004),black,e)
 if i in (2,4,20):
  for x in (-.018,.018):cyl('Electrolytic capacitor',(x,0,.013),.006,.018,black,e)
 if i in (5,6,8):
  cube('Shield can',(0,0,.009),(.032,.025,.004),silver,e)
  if i==6:
   for k in range(9):cube('Heat sink fin',(-.024+k*.006,0,.017),(.002,.035,.012),silver,e)
 if i==9:
  for x in (-.018,.018):cyl('Optical barrel',(x,0,.018),.012,.027,black,e);cyl('Optical glass',(x,0,.032),.009,.002,blue,e)
 if i==11:
  for k in range(5):cyl('Louver shield tier',(0,0,.012+k*.012),.045,.005,white,e)
 if i==12:
  # Open collector, rather than a sealed solid cylinder.
  bpy.ops.mesh.primitive_cone_add(vertices=64,radius1=.012,radius2=.05,depth=.04,location=(0,0,.025));o=bpy.context.object;o.name='Rain collector';o.data.polygons[-1].use_smooth=False
  # Remove horizontal cap polygons to expose the funnel opening.
  import bmesh
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if abs(f.normal.z)>.99],context='FACES');bm.to_mesh(o.data);bm.free()
  o.data.materials.append(silver);o.parent=e;move(o,mods);sol=o.modifiers.new('Collector wall','SOLIDIFY');sol.thickness=.001
 if i==13:cyl('Diffuser',(0,0,.012),.018,.015,white,e)
 if i in (14,15,16):
  for k in range(3):
   cube('Probe head',((k-1)*.027,0,.014),(.018,.024,.024),black,e)
   for y in (-.006,.006):cyl('Probe electrode',((k-1)*.027,y,-.065),.002,.13,silver,e)
 if i==18:cube('MicroSD socket',(0,0,.008),(.016,.018,.003),silver,e);cube('MicroSD card',(.004,.005,.009),(.011,.015,.001),black,e)
 if i==19:cyl('RTC coin cell',(0,0,.008),.011,.004,silver,e)
 target=Vector((((i-1)%5-2)*.29,-.05+((i-1)//5)*.25,.38+((i-1)//5)*.21))
 manifest.append({'id':i,'name':name,'conceptual':True,'external_accessory':external,'home':list(home),'exploded':list(target)})
 for frame,loc in [(1,home),(384,home),(720,target),(1824,target),(2064,home),(2160,home)]:e.location=loc;e.keyframe_insert(data_path='location',frame=frame)
# Preserve world transforms when adding semantic exterior assemblies.
groups={}
for o in device:
 n=o.name
 if n.startswith('Leg'):g=n.split('_')[0]
 elif n.startswith(('Solar','Rim','Skirt','Plateau','Antenna')):g='Canopy'
 elif n.startswith(('Mast','GNSS','Dome')):g='Crown'
 elif n.startswith('Plate_'):g=n
 elif n.startswith(('Camera','Lens')):g='Camera'
 elif n=='Body_Core':g='Core'
 else:g='Chassis'
 groups.setdefault(g,[]).append(o)
for g,objects in groups.items():
 e=empty('Assembly_'+g,rig)
 for o in objects:
  world=o.matrix_world.copy();o.parent=e;o.matrix_world=world
 delta=Vector((0,0,0))
 if g=='Canopy':delta.z=.95
 elif g=='Crown':delta.z=1.3
 elif g.startswith('Plate_'):delta={'Plate_Front':Vector((0,-.65,0)),'Plate_Back':Vector((0,.7,0)),'Plate_Left':Vector((-.75,0,0)),'Plate_Right':Vector((.75,0,0))}[g]
 elif g=='Camera':delta=Vector((.3,-.9,.1))
 # The original core is a solid placeholder: substitute a thin service shell.
 if g=='Core':
  for o in objects:
   o.hide_render=True
  # New open chassis rails occupy only the perimeter; no opaque core over electronics.
  for x in (-.14,.14):cube('Internal chassis rail',(x,.12,.56),(.012,.012,.44),silver)
 for frame,v in [(1,Vector()),(384,Vector()),(720,delta),(1824,delta),(2064,Vector()),(2160,Vector())]:e.location=v;e.keyframe_insert(data_path='location',frame=frame)
# Hide external accessories until the service layout is introduced.
for i,e in enumerate(module_roots,1):
 if i in (11,12,13,14,15,16):
  for o in e.children:
   for f,value in [(1,True),(383,True),(384,False),(2063,False),(2064,True)]:o.hide_render=value;o.keyframe_insert(data_path='hide_render',frame=f)
# Isolate each component during its dedicated shot, retaining the shared rig.
for o in device:
 if o.name=='Body_Core':continue
 for f,value in [(1,False),(864,False),(865,True),(1824,True),(1825,False)]:o.hide_render=value;o.keyframe_insert(data_path='hide_render',frame=f)
for i,e in enumerate(module_roots):
 for o in e.children:
  for f,value in [(864,False),(865,True),(1824,True),(1825,False)]:o.hide_render=value;o.keyframe_insert(data_path='hide_render',frame=f)
  for f,value in [(865+i*48,False),(912+i*48,False)]:o.hide_render=value;o.keyframe_insert(data_path='hide_render',frame=f)
  if i<19:o.hide_render=True;o.keyframe_insert(data_path='hide_render',frame=913+i*48)
# Rescale the original studio independently of device hierarchy.
for o in list(s.objects):
 if o.type=='LIGHT':o.location*=.2;o.data.energy*=.04;o.data.size*=.2;move(o,studio)
 elif o.name=='Studio_Backdrop':o.scale=(.2,)*3;move(o,studio)
def camera(name,pos,target,start,end,endpos=None):
 bpy.ops.object.camera_add(location=pos);c=bpy.context.object;c.name=name;c.data.lens=55;c.data.clip_end=100;move(c,cams)
 for f,p in [(start,pos),(end,endpos or pos)]:
  c.location=p;c.rotation_euler=(Vector(target)-Vector(p)).to_track_quat('-Z','Y').to_euler();c.keyframe_insert(data_path='location',frame=f);c.keyframe_insert(data_path='rotation_euler',frame=f)
 marker=s.timeline_markers.new(name,frame=start);marker.camera=c;return c
camera('01_Hero',(1.65,-3.2,1.08),(0,0,.58),1,192,(1.45,-3.1,1.12))
for k,(n,p) in enumerate([('Front',(1.35,-3, .7)),('Left',(-3,-1.4,.8)),('Right',(3,1.4,.8)),('Top',(1.6,-2,3.8))]):camera(n,p,(0,0,.6),193+k*48,240+k*48)
camera('Explode',(2.9,-4.8,2.8),(0,.15,1),385,720,(3.1,-5,3))
camera('Exploded_Right',(3.1,-5,3),(0,.15,1),721,792)
camera('Exploded_Left',(-3.1,-5,3),(0,.15,1),793,864)
for i,e in enumerate(module_roots):
 target=Vector(manifest[i]['exploded']);camera(f'Module_{i+1:02d}',target+Vector((.19,-.3,.19)),target,865+i*48,912+i*48,target+Vector((.17,-.29,.17)))
camera('Reassembly',(3.1,-5,3),(0,.15,1),1825,2064,(1.8,-3.6,1.6))
camera('Final_Hero',(1.65,-3.2,1.08),(0,0,.58),2065,2160)
s.render.engine='CYCLES';s.cycles.samples=128;s.cycles.use_denoising=True
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
s.render.resolution_x=3840;s.render.resolution_y=2160;s.render.resolution_percentage=100;s.render.fps=24;s.frame_start=1;s.frame_end=2160
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.color_depth='16'
s.render.filepath=str(P/'frames'/'frame_');s.frame_set(1)
for image in bpy.data.images:
 if image.source=='FILE':
  try:
   image.filepath=str(P/'textures'/'solar_panel.png');image.reload();image.pack()
  except RuntimeError:pass
(P/'parts.json').write_text(json.dumps({'source_commit':'25c63adaf47091932ba094a80841d7b18ef39894','source_sha256':hashlib.sha256((P/'source_v2.blend').read_bytes()).hexdigest(),'modules':manifest},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(P/'TERRA_Exploded_Production.blend'))
import runpy
runpy.run_path(str(P/'frame_cameras.py'))
if '--render' in sys.argv:bpy.ops.render.render(animation=True)
print('TERRA_PRODUCTION_READY')
