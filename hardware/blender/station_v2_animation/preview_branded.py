import bpy
from pathlib import Path
s=bpy.context.scene;p=Path(bpy.data.filepath).parent
s.cycles.device='CPU';s.cycles.samples=16;s.render.threads_mode='FIXED';s.render.threads=6;s.render.resolution_percentage=35
for f,n in [(1,'Branded_Hero'),(865,'Detailed_GNSS'),(1105,'Detailed_AI')]:
 s.frame_set(f);s.render.filepath=str(p/'preview'/f'{n}.png');bpy.ops.render.render(write_still=True)
