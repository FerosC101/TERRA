import bpy
from pathlib import Path
p=Path(__file__).resolve().parent;s=bpy.context.scene
s.render.resolution_x=384;s.render.resolution_y=216;s.render.resolution_percentage=100;s.render.fps=24;s.frame_start=1;s.frame_end=2
ed=s.sequence_editor_create();st=ed.strips.new_image('Smoke',str(p/'preview'/'Branded_Hero.png'),channel=1,frame_start=1);st.frame_final_duration=2
s.render.image_settings.media_type='VIDEO';s.render.ffmpeg.format='MPEG4';s.render.ffmpeg.codec='H264';s.render.filepath=str(p/'encode_smoke.mp4')
bpy.ops.render.render(animation=True)
assert (p/'encode_smoke.mp4').stat().st_size>1024
