"""
TERRA Field Explorer station, modelled to match `reference.png` in this folder.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P hardware/blender/station_v2/build_station.py

Writes, next to this script:
  TERRA_Station.blend   editable scene (device, studio backdrop, lights, camera)
  TERRA_Station.glb     device only, real-world scale (~1.2 m tall), for the web viewer
  render.png            studio render framed like the reference photo
  textures/*.png        generated textures (solar panel), packed into the .glb

How the numbers were found: every dimension was measured in pixels on the 1024 x 683
reference (zoomed crops with a 25 px grid) and converted at 1 unit = 100 px, correcting
for depth (parts nearer the camera sit lower in the frame). Colours were sampled from the
photo. Device axes: front plate faces -Y; the whole device is turned FRONT_TURN_DEG so it
sits like the photo. The device is scaled by DEVICE_SCALE on export (6.1 units -> 1.22 m).
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_BLEND = os.path.join(HERE, "TERRA_Station.blend")
OUT_GLB = os.path.join(HERE, "TERRA_Station.glb")
OUT_RENDER = os.path.join(HERE, "render.png")
TEX_DIR = os.path.join(HERE, "textures")
DEVICE_SCALE = 0.2
FRONT_TURN_DEG = 25

# Measured layout (units). Z is height above the ground under the feet.
BASE_A, BASE_B = 1.15, 0.86          # base: apothem of the long faces, half-length of each long face
LOWER_A, LOWER_B = 1.0, 0.76         # lower housing, same shape, smaller
FRONT_APOTHEM, FRONT_W = 1.11, 1.42  # front and back plates (outer surface, width)
SIDE_APOTHEM, SIDE_W = 0.94, 1.6     # left and right plates
PLATE_T = 0.13
LEG_LIFT = 0.3                       # the legs are 0.3 shorter than the depth-corrected estimate; the overlay showed it

# ----------------------------------------------------------------------------- scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE"
    s.render.resolution_x, s.render.resolution_y = 1024, 683
    s.view_settings.view_transform = "Standard"
    s.eevee.taa_render_samples = 128
    if hasattr(s.eevee, "use_raytracing"):
        s.eevee.use_raytracing = True


# ----------------------------------------------------------------------------- materials


def srgb(hex_color):
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def material(name, hex_color, metallic=0.0, roughness=0.5, emission=None, strength=0.0, coat=0.0, image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*srgb(hex_color), 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.06
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*srgb(emission), 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    if image:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def save_image(name, rgb):
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1))], axis=2)
    img.pixels.foreach_set(px.astype(np.float32).ravel())
    img.filepath_raw = os.path.join(TEX_DIR, f"{name}.png")
    img.file_format = "PNG"
    img.save()
    return img


def solar_panel_texture(size=512, cols=4, rows=5):
    """One trapezoid panel, mapped 0..1: navy cells with fine busbars, light gaps and a pale frame."""
    rng = np.random.default_rng(3)
    v, u = np.mgrid[0:size, 0:size] / size
    rgb = np.ones((size, size, 3)) * np.array(srgb("#4A5287"))
    cu, cv = u * cols, v * rows
    cell = (np.floor(cu) + np.floor(cv) * cols).astype(int)
    rgb *= (1 + rng.normal(0, 0.06, cols * rows + cols))[cell][..., None]
    busbar = np.abs((cv * 6) - np.round(cv * 6)) < 0.05
    rgb[busbar] = rgb[busbar] * 0.6 + np.array(srgb("#5A6290")) * 0.4
    gap = (np.abs(cu - np.round(cu)) < 0.035) | (np.abs(cv - np.round(cv)) < 0.03)
    rgb[gap] = srgb("#D2D5E0")
    frame = (u < 0.025) | (u > 0.975) | (v < 0.02) | (v > 0.98)
    rgb[frame] = srgb("#D4D5D8")
    return save_image("solar_panel", rgb)


# ----------------------------------------------------------------------------- geometry helpers

ROOT = None


def link(obj, mat=None, bevel=0.0, segments=3, smooth=True):
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
    if smooth and hasattr(obj.data, "polygons"):
        for p in obj.data.polygons:
            p.use_smooth = True
        if hasattr(obj.data, "set_sharp_from_angle"):
            obj.data.set_sharp_from_angle(angle=math.radians(40))
    obj.parent = ROOT
    return obj


def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new(name, me)


def prism(name, outline, z0, z1):
    """Vertical prism from a 2D outline (counter-clockwise, XY)."""
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in outline]
    top = [bm.verts.new((x, y, z1)) for x, y in outline]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)


def octagon(a, b):
    """Irregular octagon: long faces at distance a with half-length b; short faces on the diagonals."""
    return [(b, -a), (a, -b), (a, b), (b, a), (-b, a), (-a, b), (-a, -b), (-b, -a)]


def plate(name, outline_uv, apothem, thickness, angle_deg, z_base):
    """Flat panel from a (u, v) outline; outer face at `apothem`, facing outward at angle_deg."""
    bm = bmesh.new()
    outer = [bm.verts.new((u, -apothem, z_base + v)) for u, v in outline_uv]
    inner = [bm.verts.new((u, -(apothem - thickness), z_base + v)) for u, v in outline_uv]
    bm.faces.new(outer)
    bm.faces.new(list(reversed(inner)))
    n = len(outline_uv)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((outer[i], outer[j], inner[j], inner[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Euler((0, 0, math.radians(angle_deg + 90))).to_matrix())
    return new_obj(name, bm)


def lathe(name, profile, segments=96):
    """Surface of revolution from (r, z) points."""
    bm = bmesh.new()
    rings = []
    for k in range(segments):
        a = 2 * math.pi * k / segments
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for k in range(segments):
        a, b = rings[k], rings[(k + 1) % segments]
        for i in range(len(profile) - 1):
            try:
                bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)


def rounded_profile(r_in, r_out, z0, z1, rad, steps=6):
    """Closed (r, z) loop of a rounded rectangle, for lathe()."""
    pts = []
    corners = [(r_out - rad, z0 + rad, -90), (r_out - rad, z1 - rad, 0), (r_in + rad, z1 - rad, 90), (r_in + rad, z0 + rad, 180)]
    for cx, cz, start in corners:
        for s in range(steps + 1):
            t = math.radians(start + 90 * s / steps)
            pts.append((cx + rad * math.cos(t), cz + rad * math.sin(t)))
    pts.append(pts[0])
    return pts


def cyl(name, r, z0, z1, verts=48, r_top=None, loc=(0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r_top is None else r_top, depth=z1 - z0,
                                    location=(loc[0], loc[1], (z0 + z1) / 2))
    o = bpy.context.active_object
    o.name = name
    bpy.context.scene.collection.objects.unlink(o)
    return o


def box(name, size, loc, rot_z_deg=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=(0, 0, math.radians(rot_z_deg)))
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.scene.collection.objects.unlink(o)
    return o


def polar(angle_deg, r, z):
    a = math.radians(angle_deg)
    return Vector((r * math.cos(a), r * math.sin(a), z))


def tangent(angle_deg):
    a = math.radians(angle_deg)
    return Vector((-math.sin(a), math.cos(a), 0))


def on_face(angle_deg, apothem, u, z, out=0.0):
    """Point on a flat face whose outward normal is at angle_deg; u runs along the face."""
    return polar(angle_deg, apothem + out, z) + tangent(angle_deg) * u


def face_box(name, size_uz, depth, angle_deg, apothem, u, z):
    """Box lying on a face: width along the face, height, and depth outward from the face."""
    return box(name, (size_uz[0], depth, size_uz[1]), tuple(on_face(angle_deg, apothem, u, z, depth / 2)), angle_deg + 90)


def face_cyl(name, r, length, angle_deg, apothem, u, z, verts=32):
    """Cylinder sticking straight out of a face."""
    o = cyl(name, r, -length / 2, length / 2, verts=verts)
    o.rotation_euler = Euler((math.radians(90), 0, math.radians(angle_deg + 90)))
    o.location = on_face(angle_deg, apothem, u, z, length / 2)
    return o


def axis_cyl(name, r, half_len, centre, axis, verts=32):
    """Cylinder centred on `centre` along `axis`."""
    o = cyl(name, r, -half_len, half_len, verts=verts)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis)
    o.location = centre
    return o


def beam(name, p0, p1, width, height, side_axis):
    """Box from p0 to p1: `width` along side_axis (horizontal), `height` across."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized()
    side = side_axis.normalized()
    up = d.cross(side).normalized()
    side = up.cross(d).normalized()
    o = box(name, ((p1 - p0).length, width, height), (p0 + p1) / 2)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Matrix((d, side, up)).transposed().to_quaternion()
    return o


# ----------------------------------------------------------------------------- the device


def build_device():
    global ROOT
    ROOT = bpy.data.objects.new("TERRA_Station", None)
    bpy.context.scene.collection.objects.link(ROOT)

    M = {
        # colours sampled from the reference photo
        "white": material("Armor_White", "#D9D9D6", 0.0, 0.5),
        "core": material("Core_Black", "#141518", 0.2, 0.6),
        "rail": material("Rail_Dark", "#25272C", 0.4, 0.45),
        "band": material("Band_Warm_Metal", "#8A8279", 0.85, 0.36),
        "base": material("Base_Gunmetal", "#45413A", 0.8, 0.42),
        "lower": material("Lower_Housing", "#4C4C4B", 0.6, 0.45),
        "silver": material("Bumper_Silver", "#B0B1B4", 1.0, 0.26),
        "display": material("Display_Black", "#252526", 0.3, 0.35),
        "slot": material("Port_Slot", "#9C9EA2", 0.8, 0.35),
        "skirt": material("Skirt_Dark", "#232323", 0.6, 0.45),
        "skirt_panel": material("Skirt_Panel", "#9E9B96", 0.7, 0.38),
        "rim": material("Rim_Light", "#D5D6D8", 0.2, 0.3),
        "port_white": material("Port_White", "#E2E2E0", 0.0, 0.35),
        "plateau": material("Plateau_Grey", "#C9CACC", 0.3, 0.35),
        "rib": material("Panel_Rib", "#D9DADC", 0.4, 0.3),
        "mast": material("Mast_Black", "#1B1F28", 0.3, 0.28, coat=0.5),
        "stem": material("Mast_Stem", "#B9BDC2", 1.0, 0.22),
        "dome": material("GNSS_Dome", "#EAEAE8", 0.0, 0.3, coat=0.3),
        "dome_under": material("GNSS_Underside", "#2D3033", 0.2, 0.5),
        "bezel": material("Camera_Bezel", "#7F8281", 0.6, 0.4),
        "bezel_in": material("Bezel_Inner", "#3B3D40", 0.5, 0.4),
        "lens_ring": material("Lens_Ring", "#0C0D0F", 0.3, 0.25, coat=0.6),
        "lens_metal": material("Lens_Metal", "#1E2124", 0.9, 0.28),
        "glass": material("Lens_Glass", "#0A1020", 0.3, 0.04, coat=1.0),
        "lens_tint": material("Lens_Tint", "#3B2F55", 0.8, 0.12),
        "led": material("LED_Green", "#5BE07A", 0.0, 0.3, emission="#3FE86A", strength=2.6),
        "leg": material("Leg_Gunmetal", "#5E6164", 0.85, 0.38),
        "leg_plate": material("Leg_Plate", "#6E7175", 0.9, 0.34),
        "foot": material("Foot_Dark", "#343131", 0.4, 0.6),
        "bolt": material("Bolt_Silver", "#B5B7BA", 1.0, 0.25),
    }

    front = -90

    # ---------------- base: irregular octagon band, top lip, silver corner bumpers
    link(prism("Base_Band", octagon(BASE_A, BASE_B), 1.29, 1.84), M["base"], bevel=0.03)
    link(prism("Base_TopLip", octagon(BASE_A + 0.02, BASE_B + 0.02), 1.82, 1.88), M["band"], bevel=0.015)
    for k, (x, y) in enumerate(octagon(BASE_A + 0.01, BASE_B + 0.01)):
        ang = math.degrees(math.atan2(y, x))
        link(box(f"Bumper_{k}", (0.2, 0.34, 0.62), (x, y, 1.57), ang), M["silver"], bevel=0.04)
    link(face_box("Display", (0.65, 0.28), 0.04, front, BASE_A, 0.17, 1.44), M["display"], bevel=0.05, segments=4)
    for k in range(3):
        link(face_box(f"Display_Port_{k}", (0.07, 0.035), 0.02, front, BASE_A + 0.04, 0.0 + 0.17 * k, 1.44), M["slot"], bevel=0.012)
    for k in range(4):
        link(face_box(f"Base_Vent_{k}", (0.32, 0.04), 0.02, 180, BASE_A, -0.25, 1.47 + k * 0.08), M["core"])

    # ---------------- lower housing with LEDs and ports
    link(prism("Lower_Housing", octagon(LOWER_A, LOWER_B), 0.8, 1.3), M["lower"], bevel=0.07, segments=4)
    for z in (1.05, 0.96):
        link(face_box(f"Base_LED_{z}", (0.42, 0.035), 0.03, front, LOWER_A, 0.15, z), M["led"], bevel=0.012)
    link(face_cyl("Port_White_Ring", 0.11, 0.1, front, LOWER_A, -0.36, 0.96), M["port_white"], bevel=0.02)
    link(face_cyl("Port_White_Core", 0.06, 0.18, front, LOWER_A, -0.36, 0.96), M["core"])
    link(face_cyl("Port_Black_R", 0.1, 0.12, front, LOWER_A, 0.6, 1.0), M["mast"], bevel=0.015)
    link(face_cyl("Port_Black_R_Core", 0.05, 0.16, front, LOWER_A, 0.6, 1.0), M["lens_metal"])
    diag = LOWER_A * 0.93
    link(face_cyl("Port_Black_L", 0.09, 0.1, -135, diag, 0.0, 1.0), M["mast"], bevel=0.015)
    link(face_cyl("Side_Connector", 0.08, 0.36, -45, diag, 0.0, 1.0), M["mast"], bevel=0.01)
    for k in range(3):
        link(face_cyl(f"Side_Connector_Rib_{k}", 0.095, 0.035, -45, diag + 0.12 + k * 0.08, 0.0, 1.0), M["mast"])

    # ---------------- body core, top band, collar
    # the core sits inside every plate (side plates are only 0.94 out), dark channels fill the corners
    link(cyl("Body_Core", 0.8, 1.84, 4.42), M["core"])
    link(cyl("Top_Band", 0.99, 4.12, 4.38), M["band"], bevel=0.02)
    link(cyl("Collar", 0.92, 4.36, 4.44), M["skirt"])

    # front and back plates: flat, rounded, with a step on the upper-left edge (front only)
    front_outline = [(-0.71, 0), (0.71, 0), (0.71, 2.74), (-0.59, 2.74), (-0.59, 1.28), (-0.71, 1.1)]
    link(plate("Plate_Front", front_outline, FRONT_APOTHEM, PLATE_T, front, 1.85), M["white"], bevel=0.12, segments=6)
    link(plate("Plate_Back", [(-0.6, 0), (0.6, 0), (0.6, 2.74), (-0.6, 2.74)], FRONT_APOTHEM, PLATE_T, 90, 1.85), M["white"], bevel=0.12, segments=6)
    # side plates, chamfered on the lower corner nearest the front
    # the side plates reach further toward the front than the back, leaving a narrow channel
    left_outline = [(-0.98, 0), (0.8, 0), (0.98, 0.18), (0.98, 2.1), (-0.98, 2.1)]
    right_outline = [(-0.98, 0.18), (-0.8, 0), (0.98, 0), (0.98, 2.1), (-0.98, 2.1)]
    link(plate("Plate_Left", left_outline, SIDE_APOTHEM, PLATE_T, 180, 2.05), M["white"], bevel=0.1, segments=6)
    link(plate("Plate_Right", right_outline, SIDE_APOTHEM, PLATE_T, 0, 2.05), M["white"], bevel=0.1, segments=6)
    for ang, u in ((180, 0.66), (0, -0.66)):
        link(face_cyl(f"Screw_{ang}", 0.028, 0.02, ang, SIDE_APOTHEM, u, 2.2, verts=16), M["bolt"])
        link(face_cyl(f"Screw_top_{ang}", 0.024, 0.02, ang, SIDE_APOTHEM, -u * 0.9, 4.0, verts=16), M["core"])
    # vent housings under the side plates
    for ang in (180, 0):
        link(face_box(f"Vent_Housing_{ang}", (1.4, 0.22), 0.1, ang, SIDE_APOTHEM - 0.1, 0.0, 1.95), M["band"], bevel=0.02)
        for k in range(3):
            link(face_box(f"Vent_Slot_{ang}_{k}", (0.5, 0.035), 0.02, ang, SIDE_APOTHEM, -0.3 if ang == 180 else 0.3, 1.89 + k * 0.06), M["core"])

    # dark channels between the plates, with a rail and green LEDs
    for ang in (-131, -49, 49, 131):
        link(face_box(f"Channel_Fill_{ang}", (0.62, 2.5), 0.05, ang, 1.0, 0.0, 3.1), M["core"])
        link(face_box(f"Rail_{ang}", (0.3, 2.36), 0.05, ang, 1.06, 0.0, 3.1), M["rail"], bevel=0.02)
        if ang != -49:
            for z0, z1 in ((3.96, 4.21), (2.54, 2.93)):
                link(face_box(f"LED_Frame_{ang}_{z0}", (0.16, z1 - z0 + 0.14), 0.03, ang, 1.11, 0.0, (z0 + z1) / 2), M["rail"], bevel=0.03)
                link(face_box(f"LED_{ang}_{z0}", (0.05, z1 - z0), 0.03, ang, 1.14, 0.0, (z0 + z1) / 2), M["led"], bevel=0.012)

    # ---------------- camera module: chamfered bezel, two lenses
    bz, bu = 3.89, 0.05
    bez = [(-0.31, -0.45), (-0.21, -0.55), (0.21, -0.55), (0.31, -0.45), (0.31, 0.45), (0.21, 0.55), (-0.21, 0.55), (-0.31, 0.45)]
    link(plate("Camera_Bezel", [(u + bu, v) for u, v in bez], FRONT_APOTHEM + 0.06, 0.08, front, bz), M["bezel"], bevel=0.02)
    link(plate("Camera_Bezel_Inner", [(u * 0.86 + bu, v * 0.9) for u, v in bez], FRONT_APOTHEM + 0.07, 0.02, front, bz), M["bezel_in"], bevel=0.01)
    for name, z, rr in (("Lens_Main", 4.09, 0.23), ("Lens_Aux", 3.57, 0.155)):
        link(face_cyl(f"{name}_Ring", rr, 0.1, front, FRONT_APOTHEM + 0.07, bu, z, verts=64), M["lens_ring"], bevel=0.02)
        link(face_cyl(f"{name}_Metal", rr * 0.8, 0.12, front, FRONT_APOTHEM + 0.07, bu, z, verts=64), M["lens_metal"], bevel=0.01)
        link(face_cyl(f"{name}_Glass", rr * 0.72, 0.14, front, FRONT_APOTHEM + 0.07, bu, z, verts=64), M["glass"], bevel=0.035, segments=5)
        link(face_cyl(f"{name}_Tint", rr * 0.36, 0.155, front, FRONT_APOTHEM + 0.07, bu - rr * 0.12, z + rr * 0.1, verts=48), M["lens_tint"], bevel=0.02)
        link(face_cyl(f"{name}_Pupil", rr * 0.16, 0.16, front, FRONT_APOTHEM + 0.07, bu - rr * 0.12, z + rr * 0.1, verts=32), M["core"], bevel=0.01)

    # ---------------- canopy: underside skirt with panels, white rim, 12 solar facets, plateau
    facets = 12
    link(lathe("Skirt", [(0.9, 4.4), (1.12, 4.42), (1.3, 4.5), (1.38, 4.7), (1.4, 4.76), (0.9, 4.76), (0.9, 4.4)], segments=facets * 6), M["skirt"])
    for k in range(facets):
        ang = (k + 0.5) * 360 / facets
        p = box(f"Skirt_Panel_{k}", (0.02, 0.48, 0.17), tuple(polar(ang, 1.345, 4.6)), 0)
        p.rotation_euler = Euler((0, math.radians(-22), math.radians(ang)), "XYZ")
        link(p, M["skirt_panel"], bevel=0.01)
    link(lathe("Rim_Groove", [(1.36, 4.72), (1.45, 4.72), (1.45, 4.75)], segments=96), M["core"])
    link(lathe("Rim", rounded_profile(1.36, 1.49, 4.74, 4.86, 0.045), segments=128), M["rim"])
    M["solar"] = material("Solar_Cells", "#FFFFFF", 0.4, 0.18, image=solar_panel_texture(), coat=1.0)
    r_out, z_out, r_in, z_in = 1.43, 4.85, 0.56, 5.21
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for k in range(facets):
        a0, a1 = 2 * math.pi * k / facets, 2 * math.pi * (k + 1) / facets
        q = [bm.verts.new((r_out * math.cos(a0), r_out * math.sin(a0), z_out)),
             bm.verts.new((r_out * math.cos(a1), r_out * math.sin(a1), z_out)),
             bm.verts.new((r_in * math.cos(a1), r_in * math.sin(a1), z_in)),
             bm.verts.new((r_in * math.cos(a0), r_in * math.sin(a0), z_in))]
        f = bm.faces.new(q)
        for loop, (uu, vv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = (uu, vv)
    link(new_obj("Solar_Facets", bm), M["solar"], smooth=False)
    for k in range(facets):
        a = 360 * k / facets
        link(beam(f"Solar_Rib_{k}", polar(a, r_out, z_out + 0.015), polar(a, r_in, z_in + 0.015), 0.035, 0.025, tangent(a)), M["rib"])
    link(lathe("Plateau", [(0.56, 5.21), (0.56, 5.23), (0.29, 5.23)], segments=64), M["plateau"])

    # ---------------- GNSS mast and mushroom dome
    link(cyl("Mast_Flange", 0.31, 5.22, 5.3), M["mast"], bevel=0.01)
    link(cyl("Mast_Lower", 0.27, 5.3, 5.36), M["mast"], bevel=0.015)
    link(cyl("Mast_Groove", 0.25, 5.36, 5.39), M["core"])
    link(cyl("Mast_Upper", 0.27, 5.39, 5.52), M["mast"], bevel=0.015)
    link(cyl("Mast_Stem", 0.15, 5.52, 5.66), M["stem"])
    for k in range(6):
        a = 360 * k / 6
        link(box(f"Mast_Stem_Rib_{k}", (0.03, 0.03, 0.14), tuple(polar(a, 0.15, 5.59)), a), M["mast"])
    link(cyl("Dome_Underside", 0.37, 5.655, 5.67), M["dome_under"])
    cap = [(0.0, 5.67), (0.37, 5.67), (0.375, 5.7)]
    for s in range(1, 13):
        t = math.radians(90 * s / 12)
        cap.append((0.375 * math.cos(t), 5.7 + 0.18 * math.sin(t) ** 0.7))
    link(lathe("GNSS_Dome", cap, segments=64), M["dome"])

    # ---------------- whip antenna, standing on the canopy right of the mast
    ant = polar(-40, 0.75, 0)
    link(cyl("Antenna_Base", 0.075, 5.06, 5.26, loc=(ant.x, ant.y)), M["mast"], bevel=0.01)
    link(cyl("Antenna_Whip", 0.013, 5.24, 6.02, verts=12, loc=(ant.x, ant.y)), M["mast"])

    # ---------------- four legs on the diagonal faces
    # leg angles measured from the feet in the photo; the front-left leg sits a little further round
    for i, ang in enumerate((-142, -45, 45, 135)):
        t = tangent(ang)
        hip = polar(ang, 1.5, 1.55)
        knee = polar(ang, 1.66, 1.12)
        ankle = polar(ang, 2.12, 0.74)
        link(box(f"Leg{i}_Hip", (0.36, 0.5, 0.56), tuple(polar(ang, 1.42, 1.56)), ang), M["leg"], bevel=0.05)
        link(face_cyl(f"Leg{i}_Hip_Bolt", 0.06, 0.04, ang, 1.6, 0.0, 1.6, verts=24), M["bolt"])
        link(beam(f"Leg{i}_Upper", hip, knee, 0.4, 0.34, t), M["leg"], bevel=0.05)
        for s in (-1, 1):
            link(axis_cyl(f"Leg{i}_Knee_{s}", 0.14, 0.04, knee + t * 0.22 * s, t), M["foot"], bevel=0.015)
            link(axis_cyl(f"Leg{i}_Knee_Bolt_{s}", 0.045, 0.02, knee + t * 0.26 * s, t, verts=20), M["leg_plate"])
        link(beam(f"Leg{i}_Lower", knee, ankle, 0.42, 0.36, t), M["leg"], bevel=0.06)
        d = (ankle - knee).normalized()
        up = d.cross(t).normalized()
        if up.dot(polar(ang, 1, 0) + Vector((0, 0, 1))) < 0:
            up = -up
        p0, p1 = knee + d * 0.12 + up * 0.15, knee + d * 0.85 + up * 0.15
        link(beam(f"Leg{i}_Lower_Armor", p0, p1, 0.3, 0.07, t), M["leg_plate"], bevel=0.025)
        link(beam(f"Leg{i}_Lower_Edge", p0 + up * 0.04, p1 + up * 0.04, 0.38, 0.015, t), M["leg_plate"], bevel=0.006)
        for s in (-1, 1):
            link(axis_cyl(f"Leg{i}_Ankle_{s}", 0.12, 0.04, ankle + t * 0.22 * s, t, verts=24), M["foot"], bevel=0.012)
        foot_c = polar(ang, 2.22, 0.47)
        foot = box(f"Leg{i}_Foot", (0.7, 0.52, 0.28), tuple(foot_c), 0)
        foot.rotation_euler = Euler((0, math.radians(12), math.radians(ang)), "XYZ")
        link(foot, M["foot"], bevel=0.08, segments=3)
        cap = box(f"Leg{i}_Foot_Cap", (0.44, 0.38, 0.07), tuple(foot_c + Vector((0, 0, 0.16)) - polar(ang, 0.06, 0)), 0)
        cap.rotation_euler = Euler((0, math.radians(12), math.radians(ang)), "XYZ")
        link(cap, M["leg"], bevel=0.02)
        for k in range(4):
            link(box(f"Leg{i}_Tread_{k}", (0.07, 0.5, 0.05), tuple(polar(ang, 1.96 + k * 0.17, 0.33)), ang), M["foot"], bevel=0.015)

    ROOT.rotation_euler = Euler((0, 0, math.radians(FRONT_TURN_DEG)))
    ROOT.location.z = -LEG_LIFT   # feet rest on the ground; everything above keeps its measured height
    return ROOT


# ----------------------------------------------------------------------------- studio


def build_studio():
    bm = bmesh.new()
    profile = [(y, 0.0) for y in (-60, -15, 8)]
    for k in range(1, 13):
        t = math.radians(90 * k / 12)
        profile.append((8 + 10 * math.sin(t), 10 - 10 * math.cos(t)))
    profile.append((18, 50))
    rows = [[bm.verts.new((x, y, z)) for (y, z) in profile] for x in (-80, 80)]
    for i in range(len(profile) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    cyc = new_obj("Studio_Backdrop", bm)
    bpy.context.scene.collection.objects.link(cyc)
    cyc.data.materials.append(material("Backdrop", "#D4D4D3", 0.0, 0.95))
    for p in cyc.data.polygons:
        p.use_smooth = True

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb("#D4D4D3"), 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
    bpy.context.scene.world = world

    def area(name, loc, size, power):
        bpy.ops.object.light_add(type="AREA", location=loc)
        light = bpy.context.active_object
        light.name = name
        light.data.size = size
        light.data.energy = power
        light.rotation_euler = (Vector((0, 0, 2.8)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

    area("Key", (-7, -15, 12), 16, 3600)
    area("Fill", (13, -11, 6), 16, 1500)
    area("Top", (0, -1, 18), 14, 1300)
    area("Back", (5, 12, 10), 8, 400)

    # 85 mm, 10 deg above the horizon, aimed at the device centre
    cam_dist, elev = 23.6, math.radians(5.5)
    target = Vector((0, 0, 2.91 - LEG_LIFT))
    bpy.ops.object.camera_add(location=target + Vector((0, -cam_dist * math.cos(elev), cam_dist * math.sin(elev))))
    cam = bpy.context.active_object
    cam.data.lens = 85
    cam.data.sensor_width = 36
    cam.data.sensor_fit = "HORIZONTAL"
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam


def export_glb(root):
    root.scale = (DEVICE_SCALE,) * 3
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    root.scale = (1, 1, 1)


if __name__ == "__main__":
    reset()
    root = build_device()
    build_studio()
    bpy.context.view_layer.update()
    bpy.context.scene.render.filepath = OUT_RENDER
    bpy.ops.render.render(write_still=True)
    # silhouette pass for comparing against the photo: device only, transparent background
    if os.environ.get("TERRA_MASK"):
        sc = bpy.context.scene
        bpy.data.objects["Studio_Backdrop"].hide_render = True
        sc.render.film_transparent = True
        sc.render.filepath = os.path.join(HERE, "render_mask.png")
        sc.render.image_settings.color_mode = "RGBA"
        bpy.ops.render.render(write_still=True)
        bpy.data.objects["Studio_Backdrop"].hide_render = False
        sc.render.film_transparent = False
    export_glb(root)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print("TERRA_STATION_DONE")
