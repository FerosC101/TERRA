"""Resume-safe Cycles master render, then encode with Blender's FFmpeg."""
import bpy,os,time,json,shutil
from pathlib import Path
s=bpy.context.scene;p=Path(bpy.data.filepath).parent;frames=p/'frames_branded';frames.mkdir(exist_ok=True)
cache=p/'optix_cache';cache.mkdir(exist_ok=True);os.environ['OPTIX_CACHE_PATH']=str(cache)
pref=bpy.context.preferences.addons['cycles'].preferences
pref.compute_device_type='OPTIX';pref.get_devices()
for device in pref.devices:device.use=device.type!='CPU'
s.cycles.device='GPU'
if shutil.disk_usage(p).free<3*1024**3:raise RuntimeError('Insufficient free disk space to begin rendering.')
started=time.time();completed=0
s.frame_set(1);bpy.context.view_layer.update()
# Bake the static PCB drilling once; only rigid transforms change during the film.
deps=bpy.context.evaluated_depsgraph_get()
for board in list(bpy.data.collections['02_Twenty_Hardware_Modules'].objects):
 if board.type=='MESH' and board.name.startswith('PCB_') and board.modifiers:
  board.data=bpy.data.meshes.new_from_object(board.evaluated_get(deps));board.modifiers.clear()
s.render.use_persistent_data=True
s.render.resolution_percentage=100;s.cycles.samples=128;s.cycles.use_denoising=True
s.render.image_settings.file_format='PNG';s.render.image_settings.color_depth='16'
for f in range(1,2161):
 dest=frames/f'frame_{f:04d}.png'
 if dest.exists() and dest.stat().st_size>1024:continue
 if shutil.disk_usage(p).free<2*1024**3:raise RuntimeError('Render paused before exhausting disk space. Resume after freeing space.')
 s.frame_set(f);s.render.filepath=str(dest);bpy.ops.render.render(write_still=True)
 completed+=1
 (p/'render_progress.json').write_text(json.dumps({'last_frame':f,'total_frames':2160,'new_frames':completed,'elapsed_seconds':time.time()-started,'seconds_per_frame':(time.time()-started)/completed,'status':'rendering'},indent=2))
video=bpy.data.scenes.new('Master encode');video.render.resolution_x=3840;video.render.resolution_y=2160;video.render.resolution_percentage=100;video.render.fps=24;video.frame_start=1;video.frame_end=2160
ed=video.sequence_editor_create();strip=ed.strips.new_image('Cycles master',str(frames/'frame_0001.png'),channel=1,frame_start=1)
for f in range(2,2161):strip.elements.append(f'frame_{f:04d}.png')
video.render.image_settings.media_type='VIDEO';video.render.ffmpeg.format='MPEG4';video.render.ffmpeg.codec='H264';video.render.ffmpeg.constant_rate_factor='HIGH';video.render.filepath=str(p/'TERRA_90s_4K.mp4')
bpy.ops.render.render(animation=True,scene=video.name)
(p/'render_progress.json').write_text(json.dumps({'last_frame':2160,'total_frames':2160,'status':'encoded','video':str(p/'TERRA_90s_4K.mp4')},indent=2))
