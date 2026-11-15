import bpy,json
from pathlib import Path
s=bpy.context.scene;p=Path(bpy.data.filepath).parent
roots=[o for o in bpy.data.collections['02_Twenty_Hardware_Modules'].objects if o.type=='EMPTY']
samples=[]
for f in (1,760,865,913,1105,1825,2160):
 s.frame_set(f);bpy.context.view_layer.update();visible={e.name:sum(not o.hide_render for o in e.children if not o.name.startswith('Drill cutter')) for e in roots}
 samples.append({'frame':f,'visible_modules':{k:v for k,v in visible.items() if v},'logo_visible':not bpy.data.objects['TERRA front armor wordmark'].hide_render})
data={'modules':len(roots),'samples':samples,'packed_images':[i.name for i in bpy.data.images if i.packed_file]}
(p/'detailed_verification.json').write_text(json.dumps(data,indent=2));print(json.dumps(data,indent=2))
