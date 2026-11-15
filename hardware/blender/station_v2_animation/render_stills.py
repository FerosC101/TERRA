"""Run on the production blend. Set TERRA_STILL_PERCENT for preview size."""
import bpy,os
from pathlib import Path
from mathutils import Vector
s=bpy.context.scene;p=Path(bpy.data.filepath).parent
s.render.resolution_percentage=int(os.environ.get('TERRA_STILL_PERCENT','100'))
s.cycles.samples=128
def render(name):
 s.render.filepath=str(p/'stills'/f'{name}.png');bpy.ops.render.render(write_still=True)
for f,n in [(1,'Hero'),(193,'Front'),(241,'Left'),(289,'Right'),(337,'Top'),(760,'Exploded_Right'),(820,'Exploded_Left')]:s.frame_set(f);render(n)
for i in range(20):s.frame_set(865+i*48);render(f'Module_{i+1:02d}')
