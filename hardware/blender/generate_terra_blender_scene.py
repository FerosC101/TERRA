"""
STEP 2: TERRA Autonomous Field Explorer — Full Scene, Environment & Animation Builder (Blender 5.3 `bpy`)
Follows the two-stage workflow requested by the Team Lead:
  1. First, `generate_isolated_terra_device.py` generates the standalone isolated TERRA device alone
     (`hardware/blender/TERRA_Device_Isolated.blend` & `TERRA_Device_Isolated.glb`).
  2. Next, this script (`generate_terra_blender_scene.py`) opens `TERRA_Device_Isolated.blend`,
     adds the field soil mound (`SM_TERRA_FieldSoil_Mound`), 3-point studio lighting, camera rig,
     and 5-act exploded animation timeline, and saves both in `hardware/blender/` and `hardware/`:
       - `hardware/blender/TERRA_Field_Explorer.blend` & `hardware/TERRA_Field_Explorer.blend`
       - `hardware/blender/TERRA_Field_Explorer.glb` & `hardware/TERRA_Field_Explorer.glb`
       - `hardware/Blender_TERRA_Hero_Render.png` & `hardware/Blender_TERRA_Inside_Cutaway.png`
"""

import math
import os
import shutil
import bpy
from mathutils import Euler

BLENDER_DIR = os.path.dirname(os.path.abspath(__file__))
HARDWARE_DIR = os.path.dirname(BLENDER_DIR)

ISOLATED_BLEND_PATH = os.path.join(BLENDER_DIR, "TERRA_Device_Isolated.blend")
SCENE_BLEND_IN_FOLDER = os.path.join(BLENDER_DIR, "TERRA_Field_Explorer.blend")
SCENE_GLB_IN_FOLDER = os.path.join(BLENDER_DIR, "TERRA_Field_Explorer.glb")

ROOT_BLEND_PATH = os.path.join(HARDWARE_DIR, "TERRA_Field_Explorer.blend")
ROOT_GLB_PATH = os.path.join(HARDWARE_DIR, "TERRA_Field_Explorer.glb")
HERO_RENDER_PATH = os.path.join(HARDWARE_DIR, "Blender_TERRA_Hero_Render.png")
INSIDE_RENDER_PATH = os.path.join(HARDWARE_DIR, "Blender_TERRA_Inside_Cutaway.png")


def link_to_col(obj: bpy.types.Object, col: bpy.types.Collection) -> None:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


def main() -> None:
    if not os.path.exists(ISOLATED_BLEND_PATH):
        raise FileNotFoundError(
            f"Isolated device file not found at {ISOLATED_BLEND_PATH}. "
            "Run generate_isolated_terra_device.py first!"
        )

    # 1. Load the standalone isolated TERRA device created in Step 1
    bpy.ops.wm.open_mainfile(filepath=ISOLATED_BLEND_PATH)
    scene = bpy.context.scene
    scene.render.film_transparent = False
    scene.frame_start = 1
    scene.frame_end = 420

    root_col = bpy.data.collections.get("COL_TERRA_FieldExplorer")
    base_col = bpy.data.collections.get("COL_Base_And_Legs")

    col_lights = bpy.data.collections.new("COL_Lights")
    col_cams = bpy.data.collections.new("COL_Cameras")
    if root_col:
        root_col.children.link(col_lights)
        root_col.children.link(col_cams)

    # 2. Add Field Soil Mound (`SM_TERRA_FieldSoil_Mound`) underneath the isolated device
    soil_mat = bpy.data.materials.new(name="MAT_Soil_FieldMound")
    soil_mat.use_nodes = True
    bsdf = soil_mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.16, 0.11, 0.07, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.92

    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=3.8, depth=0.65, location=(0, 0, -2.18))
    soil_mound = bpy.context.active_object
    soil_mound.name = "SM_TERRA_FieldSoil_Mound"
    soil_mound.data.materials.append(soil_mat)
    if base_col:
        link_to_col(soil_mound, base_col)

    # 3. Add Studio World, Camera Rig & 3-Point Lighting
    if scene.world is None:
        scene.world = bpy.data.worlds.new("WLD_TERRA_Studio")
    scene.world.use_nodes = True
    bg_node = scene.world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs[0].default_value = (0.03, 0.08, 0.14, 1.0)
        bg_node.inputs[1].default_value = 1.25

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0.0, 0.0, 0.10))
    cam_target = bpy.context.active_object
    cam_target.name = "EMPTY_CamTarget_TERRA"
    link_to_col(cam_target, col_cams)

    bpy.ops.object.camera_add(location=(2.65, -10.4, 0.55))
    cam = bpy.context.active_object
    cam.name = "CAM_TERRA_Hero"
    cam.data.lens = 32.0
    track = cam.constraints.new(type="TRACK_TO")
    track.target = cam_target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam
    link_to_col(cam, col_cams)

    bpy.ops.object.light_add(type="SUN", location=(5.0, -6.0, 8.5))
    key_light = bpy.context.active_object
    key_light.name = "LGT_Key_Main"
    key_light.data.energy = 4.2
    key_light.rotation_euler = Euler((math.radians(48), math.radians(15), math.radians(28)), "XYZ")
    link_to_col(key_light, col_lights)

    bpy.ops.object.light_add(type="AREA", location=(3.5, 5.2, 2.2))
    rim_light = bpy.context.active_object
    rim_light.name = "LGT_Rim_GoldenSun"
    rim_light.data.energy = 520.0
    rim_light.data.color = (1.0, 0.68, 0.28)
    rim_light.data.size = 4.5
    link_to_col(rim_light, col_lights)

    bpy.ops.object.light_add(type="POINT", location=(0.0, -3.2, -1.0))
    emerald_fill = bpy.context.active_object
    emerald_fill.name = "LGT_Accent_Emerald"
    emerald_fill.data.energy = 95.0
    emerald_fill.data.color = (0.06, 0.73, 0.51)
    link_to_col(emerald_fill, col_lights)

    # 4. Animate 5-Act Exploded Timeline on the Device Pivots
    crown = bpy.data.objects["EMPTY_Crown_Solar_Pivot"]
    base = bpy.data.objects["EMPTY_Base_And_Legs_Pivot"]
    plate_n = bpy.data.objects["SM_TERRA_ArmorPlate_North"]
    plate_e = bpy.data.objects["SM_TERRA_ArmorPlate_East"]
    plate_w = bpy.data.objects["SM_TERRA_ArmorPlate_West"]
    oct_core = bpy.data.objects["SM_TERRA_Hull_OctCore"]
    tier1 = bpy.data.objects["SM_TERRA_Tier1_SensorPCB"]
    tier2 = bpy.data.objects["SM_TERRA_Tier2_EdgeAI_MCU"]
    tier3 = bpy.data.objects["SM_TERRA_Tier3_LoRaBus"]
    tier4 = bpy.data.objects["SM_TERRA_Tier4_LiFePO4_Pack"]

    keyframes = [
        (1,   0.0,  0.0),
        (75,  0.95, -0.75),
        (165, 0.55, -0.35),
        (255, 0.95, -0.85),
        (335, 0.95, -0.45),
        (405, 0.0,  0.0),
    ]
    for frame, z_explode, y_plate in keyframes:
        crown.location = (0.0, 0.0, z_explode)
        crown.keyframe_insert(data_path="location", frame=frame)
        base.location = (0.0, 0.0, -z_explode * 0.55)
        base.keyframe_insert(data_path="location", frame=frame)
        plate_n.location = (0.0, -0.94 + y_plate, 0.06)
        plate_n.keyframe_insert(data_path="location", frame=frame)

    # 5. Render Frame 1 (Hero) and Frame 75 (Inside TERRA Cutaway)
    scene.frame_set(1)
    scene.render.filepath = HERO_RENDER_PATH
    bpy.ops.render.render(write_still=True)

    scene.frame_set(75)
    soil_mound.hide_render = True
    for p_obj in (plate_n, plate_e, plate_w):
        p_obj.hide_render = True
        for ch in p_obj.children:
            ch.hide_render = True
    wf_mod = oct_core.modifiers.new(name="Wireframe_Cutaway", type="WIREFRAME")
    wf_mod.thickness = 0.018
    tier1.location.z = 1.25
    tier2.location.z = 0.55
    tier3.location.z = -0.10
    tier4.location.z = -0.82

    scene.render.filepath = INSIDE_RENDER_PATH
    bpy.ops.render.render(write_still=True)

    # Restore clean Frame 1 state and save both in `hardware/blender/` and `hardware/`
    soil_mound.hide_render = False
    for p_obj in (plate_n, plate_e, plate_w):
        p_obj.hide_render = False
        for ch in p_obj.children:
            ch.hide_render = False
    oct_core.modifiers.remove(wf_mod)
    tier1.location.z = 0.82
    tier2.location.z = 0.34
    tier3.location.z = -0.15
    tier4.location.z = -0.68
    scene.frame_set(1)

    bpy.ops.wm.save_as_mainfile(filepath=SCENE_BLEND_IN_FOLDER)
    shutil.copy2(SCENE_BLEND_IN_FOLDER, ROOT_BLEND_PATH)
    print("Saved Full Scene .blend in blender/ and hardware/:", SCENE_BLEND_IN_FOLDER)

    try:
        bpy.ops.export_scene.gltf(filepath=SCENE_GLB_IN_FOLDER, export_format="GLB")
        shutil.copy2(SCENE_GLB_IN_FOLDER, ROOT_GLB_PATH)
        print("Exported Full Scene .glb in blender/ and hardware/:", SCENE_GLB_IN_FOLDER)
    except Exception as exc:
        print("GLB export note:", exc)


if __name__ == "__main__":
    main()
