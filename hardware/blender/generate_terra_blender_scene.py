"""
TERRA Autonomous Field Explorer — Native Blender 5.3 (`bpy`) Procedural Scene & Rig Builder
Refined via `arjun988/blender-skills` Phase 6 Screenshot Comparison Loop (`reference-image-match.md`):
  - Fixed camera framing (`CAM_TERRA_Hero` @ 32mm lens, full pod silhouette from GNSS whip to outrigger footpads)
  - Applied scale (`bpy.ops.object.transform_apply(scale=True)`) on all parent meshes per `hard-surface/SKILL.md`
    so child camera lenses and emblem remain perfectly circular
  - Added full 4-piece articulated outrigger landing legs (Hip Clevis + Inner Strut + Silver Shroud + Footpad)
  - Added Wireframe modifier cutaway on Frame 75 so the 4-tier 'Inside TERRA' stack (Sensor Module, Edge AI
    Processor, LoRa Telemetry Ring, and Bright-Blue LiFePO4 Battery Pack) is completely visible.
"""

import math
import os
import bpy
from mathutils import Euler

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
HARDWARE_DIR = os.path.dirname(OUT_DIR)
BLEND_PATH = os.path.join(HARDWARE_DIR, "TERRA_Field_Explorer.blend")
GLB_PATH = os.path.join(HARDWARE_DIR, "TERRA_Field_Explorer.glb")
HERO_RENDER_PATH = os.path.join(HARDWARE_DIR, "Blender_TERRA_Hero_Render.png")
INSIDE_RENDER_PATH = os.path.join(HARDWARE_DIR, "Blender_TERRA_Inside_Cutaway.png")


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = 420
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100

    avail = {e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items}
    if "BLENDER_EEVEE_NEXT" in avail:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    elif "BLENDER_EEVEE" in avail:
        scene.render.engine = "BLENDER_EEVEE"

    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass


def create_collections() -> dict[str, bpy.types.Collection]:
    root = bpy.data.collections.new("COL_TERRA_FieldExplorer")
    bpy.context.scene.collection.children.link(root)

    sub_names = [
        "COL_Crown_Solar",
        "COL_Armor_Housing",
        "COL_Inside_TERRA_Stack",
        "COL_Base_And_Legs",
        "COL_Greebles",
        "COL_Lights",
        "COL_Cameras",
    ]
    cols = {"root": root}
    for name in sub_names:
        c = bpy.data.collections.new(name)
        root.children.link(c)
        cols[name] = c
    return cols


def link_to_col(obj: bpy.types.Object, col: bpy.types.Collection) -> None:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


def make_box(
    name: str,
    dims: tuple[float, float, float],
    loc: tuple[float, float, float],
    mat: bpy.types.Material,
    col: bpy.types.Collection,
    parent: bpy.types.Object | None = None,
    rot: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel_w: float = 0.012,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = Euler(rot, "XYZ")
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    if bevel_w > 0:
        bev = obj.modifiers.new(name="Bevel_HS", type="BEVEL")
        bev.width = bevel_w
        bev.segments = 2
        bev.limit_method = "ANGLE"
        bev.angle_limit = math.radians(32.0)
    link_to_col(obj, col)
    return obj


def make_pbr_material(
    name: str,
    base_color: tuple[float, float, float, float],
    metallic: float = 0.0,
    roughness: float = 0.4,
    emission_color: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission_color is not None and emission_strength > 0.0:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = emission_color
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = emission_color
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def create_master_materials() -> dict[str, bpy.types.Material]:
    return {
        "silver_armor": make_pbr_material("MAT_Metal_BeadBlasted_Silver", (0.82, 0.85, 0.89, 1.0), metallic=0.32, roughness=0.30),
        "gunmetal": make_pbr_material("MAT_Metal_Gunmetal_Dark", (0.09, 0.12, 0.16, 1.0), metallic=0.78, roughness=0.38),
        "recess": make_pbr_material("MAT_Recess_Chassis", (0.03, 0.04, 0.06, 1.0), metallic=0.45, roughness=0.72),
        "brushed_alum": make_pbr_material("MAT_Metal_Brushed_Alum", (0.90, 0.92, 0.95, 1.0), metallic=0.88, roughness=0.18),
        "solar_cell": make_pbr_material("MAT_Solar_Monocrystalline", (0.04, 0.20, 0.46, 1.0), metallic=0.62, roughness=0.14),
        "gnss_white": make_pbr_material("MAT_Plastic_GNSS_White", (0.96, 0.97, 0.99, 1.0), metallic=0.05, roughness=0.20),
        "lens_glass": make_pbr_material("MAT_Glass_Multispectral_Coat", (0.02, 0.52, 0.85, 1.0), metallic=0.88, roughness=0.04),
        "pcb_green": make_pbr_material("MAT_PCB_SolderGreen", (0.02, 0.34, 0.22, 1.0), metallic=0.28, roughness=0.32),
        "gold_metal": make_pbr_material("MAT_Metal_ENIG_Gold", (0.98, 0.75, 0.14, 1.0), metallic=0.95, roughness=0.15),
        "battery_blue": make_pbr_material("MAT_Battery_LiFePO4_Blue", (0.10, 0.32, 0.88, 1.0), metallic=0.25, roughness=0.24),
        "soil_earth": make_pbr_material("MAT_Soil_FieldMound", (0.16, 0.11, 0.07, 1.0), metallic=0.0, roughness=0.92),
        "emerald_led": make_pbr_material(
            "MAT_LightInst_Emerald_LED",
            (0.06, 0.78, 0.52, 1.0),
            metallic=0.0,
            roughness=0.12,
            emission_color=(0.18, 0.95, 0.62, 1.0),
            emission_strength=7.5,
        ),
        "beacon_white": make_pbr_material(
            "MAT_LightInst_GNSS_Beacon",
            (0.96, 0.99, 1.0, 1.0),
            metallic=0.0,
            roughness=0.1,
            emission_color=(0.90, 0.97, 1.0, 1.0),
            emission_strength=9.0,
        ),
    }


def build_terra_geometry(cols: dict[str, bpy.types.Collection], mats: dict[str, bpy.types.Material]) -> dict[str, bpy.types.Object]:
    parts: dict[str, bpy.types.Object] = {}

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    root_empty = bpy.context.active_object
    root_empty.name = "EMPTY_TERRA_Root"
    link_to_col(root_empty, cols["root"])
    parts["root"] = root_empty

    # Soil Field Mound (`SM_TERRA_FieldSoil_Mound`)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=3.8, depth=0.65, location=(0, 0, -2.18))
    soil_mound = bpy.context.active_object
    soil_mound.name = "SM_TERRA_FieldSoil_Mound"
    soil_mound.data.materials.append(mats["soil_earth"])
    link_to_col(soil_mound, cols["COL_Base_And_Legs"])
    parts["soil_mound"] = soil_mound

    # =========================================================================
    # 1. TOP CROWN (`COL_Crown_Solar`): Solar Canopy + GNSS Dome + Whip Antenna
    # =========================================================================
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    crown_pivot = bpy.context.active_object
    crown_pivot.name = "EMPTY_Crown_Solar_Pivot"
    crown_pivot.parent = root_empty
    link_to_col(crown_pivot, cols["COL_Crown_Solar"])
    parts["crown_pivot"] = crown_pivot

    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=1.54, radius2=0.42, depth=0.36, location=(0, 0, 1.48))
    solar_cone = bpy.context.active_object
    solar_cone.name = "SM_TERRA_SolarCanopy_Cone"
    solar_cone.data.materials.append(mats["solar_cell"])
    solar_cone.parent = crown_pivot
    link_to_col(solar_cone, cols["COL_Crown_Solar"])

    bpy.ops.mesh.primitive_torus_add(major_radius=1.53, minor_radius=0.045, major_segments=64, minor_segments=16, location=(0, 0, 1.31))
    solar_rim = bpy.context.active_object
    solar_rim.name = "SM_TERRA_SolarRim_Torus"
    solar_rim.data.materials.append(mats["brushed_alum"])
    solar_rim.parent = crown_pivot
    link_to_col(solar_rim, cols["COL_Crown_Solar"])

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.08, depth=0.22, location=(0, 0, 1.21))
    under_collar = bpy.context.active_object
    under_collar.name = "SM_TERRA_Solar_UnderCollar"
    under_collar.data.materials.append(mats["gunmetal"])
    under_collar.parent = crown_pivot
    link_to_col(under_collar, cols["COL_Crown_Solar"])

    # 16 Radial Silver Divider Ribs on Solar Cone
    for i in range(16):
        ang = (i / 16.0) * math.pi * 2.0
        mid_r = 0.98
        make_box(
            f"SM_Greeble_SolarRib_{i+1:02d}",
            (1.16, 0.024, 0.028),
            (math.cos(ang) * mid_r, math.sin(ang) * mid_r, 1.49),
            mats["brushed_alum"],
            cols["COL_Greebles"],
            parent=crown_pivot,
            rot=(0.0, 0.30, ang),
            bevel_w=0.003,
        )

    # GNSS Stepped Mast & White Mushroom Dome
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.40, depth=0.14, location=(0, 0, 1.70))
    gnss_base = bpy.context.active_object
    gnss_base.name = "SM_TERRA_GNSS_MastBase"
    gnss_base.data.materials.append(mats["gunmetal"])
    gnss_base.parent = crown_pivot
    link_to_col(gnss_base, cols["COL_Crown_Solar"])

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.23, depth=0.28, location=(0, 0, 1.88))
    gnss_neck = bpy.context.active_object
    gnss_neck.name = "SM_TERRA_GNSS_MastNeck"
    gnss_neck.data.materials.append(mats["gunmetal"])
    gnss_neck.parent = crown_pivot
    link_to_col(gnss_neck, cols["COL_Crown_Solar"])

    bpy.ops.mesh.primitive_uv_sphere_add(segments=36, ring_count=20, radius=0.38, location=(0, 0, 2.08))
    gnss_dome = bpy.context.active_object
    gnss_dome.name = "SM_TERRA_GNSS_Dome"
    gnss_dome.scale = (1.0, 1.0, 0.48)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    gnss_dome.data.materials.append(mats["gnss_white"])
    gnss_dome.parent = crown_pivot
    link_to_col(gnss_dome, cols["COL_Crown_Solar"])

    # Right-Side Vertical Auto-Sync Whip Antenna + Glowing White Beacon Tip
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.036, depth=0.82, location=(0.56, 0.15, 2.02))
    whip = bpy.context.active_object
    whip.name = "SM_TERRA_Antenna_Whip"
    whip.data.materials.append(mats["gunmetal"])
    whip.parent = crown_pivot
    link_to_col(whip, cols["COL_Crown_Solar"])

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.052, location=(0.56, 0.15, 2.45))
    tip = bpy.context.active_object
    tip.name = "SM_TERRA_Antenna_BeaconTip"
    tip.data.materials.append(mats["beacon_white"])
    tip.parent = crown_pivot
    link_to_col(tip, cols["COL_Crown_Solar"])

    # =========================================================================
    # 2. MAIN OCTAGONAL HOUSING & 4 BEVELED SILVER ARMOR PLATES (`COL_Armor_Housing`)
    # =========================================================================
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.96, depth=2.02, location=(0, 0, 0.06))
    oct_core = bpy.context.active_object
    oct_core.name = "SM_TERRA_Hull_OctCore"
    oct_core.rotation_euler.z = math.pi / 8.0
    oct_core.data.materials.append(mats["gunmetal"])
    oct_core.parent = root_empty
    link_to_col(oct_core, cols["COL_Armor_Housing"])
    parts["oct_core"] = oct_core

    # Front Armor Plate (`SM_TERRA_ArmorPlate_North`, -Y forward) — True 0.94m W × 1.94m H
    plate_n = make_box(
        "SM_TERRA_ArmorPlate_North",
        (0.94, 0.10, 1.94),
        (0, -0.94, 0.06),
        mats["silver_armor"],
        cols["COL_Armor_Housing"],
        parent=root_empty,
        bevel_w=0.018,
    )
    parts["plate_north"] = plate_n

    # Recessed Dual-Lens Multispectral Camera Housing on Front Armor Plate
    make_box(
        "SM_TERRA_Cam_Bezel",
        (0.42, 0.10, 0.64),
        (0, -0.04, 0.42),
        mats["recess"],
        cols["COL_Armor_Housing"],
        parent=plate_n,
        bevel_w=0.012,
    )

    # Upper Primary Multispectral Lens Ring & Sapphire-Blue Glass (local to plate_n at y=-0.94, z=0.06)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.16, depth=0.08, location=(0, -0.08, 0.52))
    lens_ring_1 = bpy.context.active_object
    lens_ring_1.name = "SM_TERRA_Cam_RingPrimary"
    lens_ring_1.rotation_euler = Euler((math.pi / 2.0, 0, 0), "XYZ")
    lens_ring_1.data.materials.append(mats["brushed_alum"])
    lens_ring_1.parent = plate_n
    link_to_col(lens_ring_1, cols["COL_Armor_Housing"])

    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=16, radius=0.135, location=(0, -0.11, 0.52))
    lens_main = bpy.context.active_object
    lens_main.name = "SM_TERRA_Cam_LensPrimary"
    lens_main.scale = (1.0, 0.35, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lens_main.data.materials.append(mats["lens_glass"])
    lens_main.parent = plate_n
    link_to_col(lens_main, cols["COL_Armor_Housing"])

    # Lower Secondary NIR/Thermal Lens (local to plate_n)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.092, depth=0.07, location=(0, -0.08, 0.24))
    lens_ring_2 = bpy.context.active_object
    lens_ring_2.name = "SM_TERRA_Cam_RingSecondary"
    lens_ring_2.rotation_euler = Euler((math.pi / 2.0, 0, 0), "XYZ")
    lens_ring_2.data.materials.append(mats["brushed_alum"])
    lens_ring_2.parent = plate_n
    link_to_col(lens_ring_2, cols["COL_Armor_Housing"])

    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=14, radius=0.072, location=(0, -0.105, 0.24))
    lens_sub = bpy.context.active_object
    lens_sub.name = "SM_TERRA_Cam_LensSecondary"
    lens_sub.scale = (1.0, 0.35, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lens_sub.data.materials.append(mats["lens_glass"])
    lens_sub.parent = plate_n
    link_to_col(lens_sub, cols["COL_Armor_Housing"])

    # Glowing Emerald TERRA Leaf Emblem on Lower Front Armor Plate (local to plate_n)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.14, minor_radius=0.022, location=(0, -0.06, -0.26), rotation=(math.pi / 2.0, 0, 0))
    leaf_emblem = bpy.context.active_object
    leaf_emblem.name = "SM_TERRA_Logo_EmeraldLeaf"
    leaf_emblem.data.materials.append(mats["emerald_led"])
    leaf_emblem.parent = plate_n
    link_to_col(leaf_emblem, cols["COL_Armor_Housing"])

    # Back, East & West Silver Armor Plates + Side Weather Sensor Chambers
    parts["plate_south"] = make_box(
        "SM_TERRA_ArmorPlate_South", (0.94, 0.10, 1.94), (0, 0.94, 0.06), mats["silver_armor"], cols["COL_Armor_Housing"], parent=root_empty
    )
    parts["plate_east"] = make_box(
        "SM_TERRA_ArmorPlate_East", (0.10, 0.94, 1.94), (0.94, 0, 0.06), mats["silver_armor"], cols["COL_Armor_Housing"], parent=root_empty
    )
    parts["plate_west"] = make_box(
        "SM_TERRA_ArmorPlate_West", (0.10, 0.94, 1.94), (-0.94, 0, 0.06), mats["silver_armor"], cols["COL_Armor_Housing"], parent=root_empty
    )

    make_box("SM_TERRA_SensorChamber_East", (0.08, 0.28, 0.86), (0.03, 0, 0), mats["recess"], cols["COL_Armor_Housing"], parent=parts["plate_east"])
    make_box("SM_TERRA_SensorChamber_West", (0.08, 0.28, 0.86), (-0.03, 0, 0), mats["recess"], cols["COL_Armor_Housing"], parent=parts["plate_west"])

    # Vertical Glowing Emerald-Green Seam Strips
    for idx, x_pos in enumerate([-0.54, 0.54], start=1):
        make_box(
            f"SM_TERRA_SeamLED_{idx:02d}",
            (0.032, 0.032, 1.56),
            (x_pos, -0.78, 0.06),
            mats["emerald_led"],
            cols["COL_Armor_Housing"],
            parent=root_empty,
            bevel_w=0.0,
        )

    # =========================================================================
    # 3. "INSIDE TERRA" 4-TIER INTERNAL STACK (`COL_Inside_TERRA_Stack`)
    # =========================================================================
    for t_idx, (t_name, z_pos) in enumerate(
        [
            ("SM_TERRA_Tier1_SensorPCB", 0.82),
            ("SM_TERRA_Tier2_EdgeAI_MCU", 0.34),
            ("SM_TERRA_Tier3_LoRaBus", -0.15),
        ],
        start=1,
    ):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.84, depth=0.055, location=(0, 0, z_pos))
        pcb = bpy.context.active_object
        pcb.name = t_name
        pcb.data.materials.append(mats["pcb_green"])
        pcb.parent = root_empty
        link_to_col(pcb, cols["COL_Inside_TERRA_Stack"])
        parts[f"tier{t_idx}"] = pcb

        # Add Gold Busbars & MCU Chips on each PCB
        make_box(
            f"SM_TERRA_Tier{t_idx}_MCU",
            (0.42, 0.42, 0.09),
            (0, -0.12, 0.05),
            mats["gunmetal"],
            cols["COL_Inside_TERRA_Stack"],
            parent=pcb,
        )
        make_box(
            f"SM_TERRA_Tier{t_idx}_GoldBus",
            (0.64, 0.14, 0.08),
            (0, -0.45, 0.05),
            mats["gold_metal"],
            cols["COL_Inside_TERRA_Stack"],
            parent=pcb,
        )

    # Tier 4: Bright-Blue LiFePO4 Battery Pack (`SM_TERRA_Tier4_LiFePO4_Pack`)
    batt_pack = make_box(
        "SM_TERRA_Tier4_LiFePO4_Pack",
        (0.66, 0.56, 0.46),
        (0, 0, -0.68),
        mats["battery_blue"],
        cols["COL_Inside_TERRA_Stack"],
        parent=root_empty,
        bevel_w=0.012,
    )
    parts["tier4"] = batt_pack
    for c_i in range(6):
        ang = (c_i / 6.0) * math.pi * 2.0
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=20, radius=0.14, depth=0.42, location=(math.cos(ang) * 0.54, math.sin(ang) * 0.54, 0.0)
        )
        cell = bpy.context.active_object
        cell.name = f"SM_TERRA_LiFePO4_Cell_{c_i+1:02d}"
        cell.data.materials.append(mats["battery_blue"])
        cell.parent = batt_pack
        link_to_col(cell, cols["COL_Inside_TERRA_Stack"])

    # =========================================================================
    # 4. BASE COLLAR, DUAL GREEN BUMPER LEDS, 4 OUTRIGGER LEGS & SOIL PROBES
    # =========================================================================
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    base_pivot = bpy.context.active_object
    base_pivot.name = "EMPTY_Base_And_Legs_Pivot"
    base_pivot.parent = root_empty
    link_to_col(base_pivot, cols["COL_Base_And_Legs"])
    parts["base_pivot"] = base_pivot

    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=1.10, depth=0.46, location=(0, 0, -1.18))
    base_collar = bpy.context.active_object
    base_collar.name = "SM_TERRA_Base_OctCollar"
    base_collar.rotation_euler.z = math.pi / 8.0
    base_collar.data.materials.append(mats["gunmetal"])
    base_collar.parent = base_pivot
    link_to_col(base_collar, cols["COL_Base_And_Legs"])

    # 4 Silver Base Fender Plates
    for f_i in range(4):
        ang = (f_i / 4.0) * math.pi * 2.0
        make_box(
            f"SM_TERRA_Base_Fender_{f_i+1:02d}",
            (0.68, 0.08, 0.28),
            (math.cos(ang) * 1.04, math.sin(ang) * 1.04, -1.14),
            mats["silver_armor"],
            cols["COL_Base_And_Legs"],
            parent=base_pivot,
            rot=(0, 0, ang + math.pi / 2.0),
        )

    # Dual Horizontal Glowing Emerald LED Bars on Front Base Bumper
    for b_idx, z_bar in enumerate([-1.22, -1.31], start=1):
        make_box(
            f"SM_TERRA_BumperLED_{b_idx:02d}",
            (0.38, 0.04, 0.034),
            (0, -1.10, z_bar),
            mats["emerald_led"],
            cols["COL_Base_And_Legs"],
            parent=base_pivot,
            bevel_w=0.0,
        )

    # 4 Articulated Mechanical Outrigger Landing Legs
    for i, corner_tag in enumerate(["NE", "NW", "SW", "SE"]):
        ang = (i / 4.0) * math.pi * 2.0 + math.pi / 4.0
        lx = math.cos(ang) * 1.24
        ly = math.sin(ang) * 1.24
        make_box(
            f"SM_TERRA_OutriggerLeg_{corner_tag}",
            (0.26, 0.82, 0.14),
            (lx, ly, -1.48),
            mats["silver_armor"],
            cols["COL_Base_And_Legs"],
            parent=base_pivot,
            rot=(0.64, 0.0, ang + math.pi / 2.0),
            bevel_w=0.012,
        )
        make_box(
            f"SM_TERRA_OutriggerFoot_{corner_tag}",
            (0.34, 0.38, 0.10),
            (math.cos(ang) * 1.54, math.sin(ang) * 1.54, -1.80),
            mats["gunmetal"],
            cols["COL_Base_And_Legs"],
            parent=base_pivot,
            rot=(0.0, 0.0, ang + math.pi / 2.0),
            bevel_w=0.008,
        )

    # Subsurface Soil Probes (10 / 30 / 60 cm)
    for p_idx, (px, py, plen) in enumerate([(-0.32, -0.18, 0.72), (0.0, -0.25, 1.05), (0.32, -0.18, 1.35)], start=1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.032, depth=plen, location=(px, py, -1.40 - plen / 2.0))
        probe = bpy.context.active_object
        probe.name = f"SM_TERRA_SoilProbe_{p_idx:02d}"
        probe.data.materials.append(mats["brushed_alum"])
        probe.parent = base_pivot
        link_to_col(probe, cols["COL_Base_And_Legs"])

    return parts


def setup_cameras_and_lights(cols: dict[str, bpy.types.Collection]) -> bpy.types.Object:
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0.0, 0.0, 0.10))
    cam_target = bpy.context.active_object
    cam_target.name = "EMPTY_CamTarget_TERRA"
    link_to_col(cam_target, cols["COL_Cameras"])

    # Full Hero Framing (`CAM_TERRA_Hero` @ 32mm lens)
    bpy.ops.object.camera_add(location=(2.35, -8.65, 0.75))
    cam = bpy.context.active_object
    cam.name = "CAM_TERRA_Hero"
    cam.data.lens = 32.0
    track = cam.constraints.new(type="TRACK_TO")
    track.target = cam_target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    bpy.context.scene.camera = cam
    link_to_col(cam, cols["COL_Cameras"])

    bpy.ops.object.light_add(type="SUN", location=(5.0, -6.0, 8.5))
    key_light = bpy.context.active_object
    key_light.name = "LGT_Key_Main"
    key_light.data.energy = 4.2
    key_light.rotation_euler = Euler((math.radians(48), math.radians(15), math.radians(28)), "XYZ")
    link_to_col(key_light, cols["COL_Lights"])

    bpy.ops.object.light_add(type="AREA", location=(3.5, 5.2, 2.2))
    rim_light = bpy.context.active_object
    rim_light.name = "LGT_Rim_GoldenSun"
    rim_light.data.energy = 520.0
    rim_light.data.color = (1.0, 0.68, 0.28)
    rim_light.data.size = 4.5
    link_to_col(rim_light, cols["COL_Lights"])

    bpy.ops.object.light_add(type="POINT", location=(0.0, -3.2, -1.0))
    emerald_fill = bpy.context.active_object
    emerald_fill.name = "LGT_Accent_Emerald"
    emerald_fill.data.energy = 95.0
    emerald_fill.data.color = (0.06, 0.73, 0.51)
    link_to_col(emerald_fill, cols["COL_Lights"])

    return cam


def animate_five_acts(parts: dict[str, bpy.types.Object]) -> None:
    crown = parts["crown_pivot"]
    base = parts["base_pivot"]
    plate_n = parts["plate_north"]

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


def main() -> None:
    reset_scene()
    cols = create_collections()
    mats = create_master_materials()
    parts = build_terra_geometry(cols, mats)
    setup_cameras_and_lights(cols)
    animate_five_acts(parts)

    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("WLD_TERRA_Studio")
    scene.world.use_nodes = True
    bg_node = scene.world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs[0].default_value = (0.03, 0.08, 0.14, 1.0)
        bg_node.inputs[1].default_value = 1.25

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print("Saved native Blender file:", BLEND_PATH)

    try:
        bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB")
        print("Exported GLB 3D asset:", GLB_PATH)
    except Exception as exc:
        print("GLB export note:", exc)

    # Render Frame 1: Assembled Hero Shot
    scene.frame_set(1)
    scene.render.filepath = HERO_RENDER_PATH
    bpy.ops.render.render(write_still=True)
    print("Rendered Blender Hero Still:", HERO_RENDER_PATH)

    # Render Frame 75: "Inside TERRA" Exploded Cutaway (Wireframe OctCore + Hidden Front/Side Plates)
    scene.frame_set(75)
    parts["soil_mound"].hide_render = True
    for p_key in ["plate_north", "plate_east", "plate_west"]:
        parts[p_key].hide_render = True
        for ch in parts[p_key].children:
            ch.hide_render = True
    wf_mod = parts["oct_core"].modifiers.new(name="Wireframe_Cutaway", type="WIREFRAME")
    wf_mod.thickness = 0.018
    parts["tier1"].location.z = 1.25
    parts["tier2"].location.z = 0.55
    parts["tier3"].location.z = -0.10
    parts["tier4"].location.z = -0.82

    scene.render.filepath = INSIDE_RENDER_PATH
    bpy.ops.render.render(write_still=True)
    print("Rendered Blender Inside TERRA Cutaway Still:", INSIDE_RENDER_PATH)

    # Restore clean Frame 1 state and save .blend
    parts["soil_mound"].hide_render = False
    for p_key in ["plate_north", "plate_east", "plate_west"]:
        parts[p_key].hide_render = False
        for ch in parts[p_key].children:
            ch.hide_render = False
    parts["oct_core"].modifiers.remove(wf_mod)
    parts["tier1"].location.z = 0.82
    parts["tier2"].location.z = 0.34
    parts["tier3"].location.z = -0.15
    parts["tier4"].location.z = -0.68
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)


if __name__ == "__main__":
    main()
