"""TERRA promotional film: procedural Blender scenes.

Usage:
  Blender -b -P film.py -- <scene> <out_dir> [start end] [--preview]

Scenes: landscape (0-10.3 s: dawn aerial + data layers), lfm (Living Field Model),
rotation (crop rotation plots), golden (golden-hour flight), brand (logo reveal).
Everything is built from code; all visuals are conceptual (no real data is depicted).
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SCENE = ARGS[0] if ARGS else "landscape"
OUT = ARGS[1] if len(ARGS) > 1 else "/tmp/film"
PREVIEW = "--preview" in ARGS
NUMS = [a for a in ARGS[2:] if a.lstrip("-").isdigit()]
FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(7)

# ----------------------------------------------------------------- utilities

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def setup_render(frames):
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    sc.render.resolution_percentage = 50 if PREVIEW else 100
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = frames
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.filepath = os.path.join(OUT, "f_")
    sc.render.use_motion_blur = not PREVIEW
    ee = sc.eevee
    for k, v in (("taa_render_samples", 16 if PREVIEW else 48), ("use_raytracing", True), ("volumetric_end", 3000.0),
                 ("volumetric_tile_size", "8"), ("use_shadows", True), ("shadow_ray_count", 2), ("shadow_step_count", 8),
                 ("use_volumetric_shadows", True), ("fast_gi_method", "GLOBAL_ILLUMINATION")):
        try:
            setattr(ee, k, v)
        except Exception:
            pass
    vs = sc.view_settings
    try:
        vs.view_transform = "AgX"
        vs.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            vs.look = "Medium High Contrast"
        except Exception:
            pass
    return sc

def sock(node, name, kind=None, out=False):
    """Socket by name (and type, for Mix nodes whose sockets share names)."""
    coll = node.outputs if out else node.inputs
    for s in coll:
        if s.name == name and (kind is None or s.type == kind) and s.enabled:
            return s
    for s in coll:
        if s.name == name and (kind is None or s.type == kind):
            return s
    raise KeyError(f"{node.bl_idname}.{name}")

class NB:
    """Tiny node-building helper."""
    def __init__(self, tree):
        self.t, self.n, self.l = tree, tree.nodes, tree.links
    def add(self, kind, **props):
        node = self.n.new(kind)
        for k, v in props.items():
            if k.startswith("in_"):
                key = k[3:]
                (node.inputs[int(key)] if key.isdigit() else node.inputs[key.replace("__", " ")]).default_value = v
            else:
                setattr(node, k, v)
        return node
    def link(self, a, b):
        self.l.new(a, b)
    def math(self, op, a, b=None, clamp=False):
        m = self.add("ShaderNodeMath", operation=op, use_clamp=clamp)
        self._feed(m.inputs[0], a)
        if b is not None:
            self._feed(m.inputs[1], b)
        return m.outputs[0]
    def vmath(self, op, a, b=None):
        m = self.add("ShaderNodeVectorMath", operation=op)
        self._feed(m.inputs[0], a)
        if b is not None:
            self._feed(m.inputs[1], b)
        return m.outputs[1] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else m.outputs[0]
    def _feed(self, s, v):
        if hasattr(v, "is_output"):
            self.link(v, s)
        else:
            s.default_value = v
    def mix_col(self, fac, a, b):
        m = self.add("ShaderNodeMix", data_type="RGBA")
        self._feed(sock(m, "Factor", "VALUE"), fac)
        self._feed(sock(m, "A", "RGBA"), a)
        self._feed(sock(m, "B", "RGBA"), b)
        return sock(m, "Result", "RGBA", out=True)
    def ramp(self, inp, stops, interp="LINEAR"):
        r = self.add("ShaderNodeValToRGB")
        r.color_ramp.interpolation = interp
        els = r.color_ramp.elements
        while len(els) < len(stops):
            els.new(0.5)
        for e, (pos, col) in zip(els, stops):
            e.position = pos
            e.color = (*col, 1) if len(col) == 3 else col
        self._feed(r.inputs[0], inp)
        return r.outputs[0]

def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes.clear()
    return m, NB(m.node_tree)

def principled(name, color, rough=0.6, metal=0.0, translucent=0.0, emission=None, estr=0.0):
    m, nb = new_mat(name)
    out = nb.add("ShaderNodeOutputMaterial")
    p = nb.add("ShaderNodeBsdfPrincipled")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emission:
        p.inputs["Emission Color"].default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = estr
    shader = p.outputs[0]
    if translucent > 0:
        tr = nb.add("ShaderNodeBsdfTranslucent")
        tr.inputs["Color"].default_value = (*color, 1)
        mix = nb.add("ShaderNodeMixShader")
        mix.inputs[0].default_value = translucent
        nb.link(shader, mix.inputs[1]); nb.link(tr.outputs[0], mix.inputs[2])
        shader = mix.outputs[0]
    nb.link(shader, out.inputs["Surface"])
    return m

def mesh_obj(name, bm, mats=()):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob

def hide(ob):
    ob.hide_render = True
    ob.hide_viewport = True

def key(obj, path, frame, value, idx=-1):
    if idx >= 0:
        getattr(obj, path)[idx] = value
    else:
        setattr(obj, path, value)
    obj.keyframe_insert(data_path=path, frame=frame, index=idx)

def ease_all(obj, interp="BEZIER", easing="EASE_IN_OUT"):
    ad = getattr(obj, "animation_data", None)
    if not ad or not ad.action:
        return
    curves = []
    act = ad.action
    if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
        curves = list(act.fcurves)
    else:  # Blender 5 layered actions
        for layer in getattr(act, "layers", []):
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            kp.easing = easing
            kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"

def sec(t):
    return int(round(t * FPS)) + 1

# --------------------------------------------------------------- plant meshes

def leaf_strip(bm, base, direction, length, width, lift, droop, segs=5, twist=0.0):
    d = Vector((direction.x, direction.y, 0)).normalized()
    side = Vector((-d.y, d.x, 0))
    rows = []
    for i in range(segs + 1):
        s = i / segs
        c = base + d * (length * s) + Vector((0, 0, lift * math.sin(s * math.pi * 0.7) - droop * s * s))
        w = width * math.sin(math.pi * min(1.0, 0.15 + s * 0.95)) * (1 - 0.6 * s)
        sd = side * w + Vector((0, 0, twist * s * w))
        rows.append((bm.verts.new(c - sd), bm.verts.new(c + sd)))
    for i in range(segs):
        bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))

def make_corn(name, leaf_mat, stalk_mat, tassel_mat, height=2.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=5, radius1=0.018, radius2=0.008, depth=height,
                          matrix=Matrix.Translation((0, 0, height / 2)))
    for f in bm.faces:
        f.material_index = 1
    n = 9
    for i in range(n):
        h = 0.25 + i * (height * 0.72) / n
        a = i * 2.39996 + random.uniform(-0.2, 0.2)
        ln = 0.95 - abs(i - n * 0.45) * 0.08
        before = len(bm.faces)
        leaf_strip(bm, Vector((0, 0, h)), Vector((math.cos(a), math.sin(a), 0)), ln, 0.06, 0.32, 0.55, segs=5, twist=0.3)
        for f in bm.faces[before:] if hasattr(bm.faces, "__getitem__") else []:
            f.material_index = 0
    bm.faces.ensure_lookup_table()
    # tassel
    t0 = len(bm.faces)
    for j in range(5):
        a = j * 1.256
        leaf_strip(bm, Vector((0, 0, height * 0.98)), Vector((math.cos(a), math.sin(a), 0)), 0.22, 0.012, 0.18, 0.1, segs=3)
    bm.faces.ensure_lookup_table()
    for f in bm.faces[t0:]:
        f.material_index = 2
    return mesh_obj(name, bm, (leaf_mat, stalk_mat, tassel_mat))

def blob_plant(name, mats, count, radius, h0, h1, leaf_size, flat=0.25, seed=1):
    """Bushy plant from small flattened leaflets (mungbean, peanut, sweet potato)."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=4, radius1=0.01, radius2=0.004, depth=h1 * 0.8,
                          matrix=Matrix.Translation((0, 0, h1 * 0.4)))
    for f in bm.faces:
        f.material_index = 1
    for i in range(count):
        r = radius * math.sqrt(rnd.random())
        a = rnd.random() * math.tau
        z = h0 + (h1 - h0) * (1 - (r / radius) ** 2) * rnd.uniform(0.6, 1.0)
        mtx = (Matrix.Translation((r * math.cos(a), r * math.sin(a), z)) @
               Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(rnd.uniform(-0.6, 0.3), 4, "Y") @
               Matrix.Diagonal((leaf_size * rnd.uniform(0.8, 1.2), leaf_size * 0.62, leaf_size * flat, 1)))
        res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0, matrix=mtx)
        for v in res["verts"]:
            for f in v.link_faces:
                f.material_index = 0
    return mesh_obj(name, bm, mats)

def make_tree(name, leaf_mat, trunk_mat, seed=3):
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.35, radius2=0.2, depth=4,
                          matrix=Matrix.Translation((0, 0, 2)))
    for f in bm.faces:
        f.material_index = 1
    for i in range(4):
        c = Vector((rnd.uniform(-1.4, 1.4), rnd.uniform(-1.4, 1.4), 5.2 + rnd.uniform(-0.6, 1.4)))
        res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=rnd.uniform(2.0, 2.8),
                                         matrix=Matrix.Translation(c) @ Matrix.Diagonal((1, 1, 0.85, 1)))
        for v in res["verts"]:
            v.co += Vector((rnd.uniform(-.25, .25), rnd.uniform(-.25, .25), rnd.uniform(-.25, .25)))
            for f in v.link_faces:
                f.material_index = 0
    return mesh_obj(name, bm, (leaf_mat, trunk_mat))

def crop_library():
    leaf = principled("CornLeaf", (0.24, 0.46, 0.10), rough=0.5, translucent=0.3)
    stalk = principled("CornStalk", (0.32, 0.45, 0.12), rough=0.6)
    tassel = principled("Tassel", (0.62, 0.52, 0.26), rough=0.7)
    mung = principled("MungLeaf", (0.19, 0.42, 0.10), rough=0.55, translucent=0.2)
    pea = principled("PeanutLeaf", (0.30, 0.47, 0.13), rough=0.55, translucent=0.2)
    sweet = principled("SweetLeaf", (0.14, 0.30, 0.09), rough=0.5, translucent=0.2)
    purple = principled("SweetStem", (0.30, 0.12, 0.18), rough=0.6)
    lib = {
        "corn": make_corn("corn", leaf, stalk, tassel),
        "mungbean": blob_plant("mungbean", (mung, stalk), 46, 0.26, 0.18, 0.55, 0.075, seed=11),
        "peanut": blob_plant("peanut", (pea, stalk), 70, 0.24, 0.06, 0.30, 0.045, seed=12),
        "sweetpotato": blob_plant("sweetpotato", (sweet, purple), 40, 0.38, 0.03, 0.18, 0.085, flat=0.18, seed=13),
    }
    for ob in lib.values():
        hide(ob)
    return lib

# ------------------------------------------------------------ geometry nodes

def gn_instancer(name, host, inst_obj, size, spacing, jitter=0.12, scale=(0.85, 1.15), wind=0.06, grow=None,
                 offset=(0, 0, 0)):
    """Grid of instances (crop rows) on `host`, with random jitter/rotation and wind sway.
    `grow`: list of (frame, value) keyframes for instance scale (time-lapse growth)."""
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nb = NB(ng)
    gin = nb.add("NodeGroupInput"); gout = nb.add("NodeGroupOutput")
    sx, sy = size
    grid = nb.add("GeometryNodeMeshGrid", in_Size__X=sx, in_Size__Y=sy,
                  in_Vertices__X=max(2, int(sx / spacing[0])), in_Vertices__Y=max(2, int(sy / spacing[1])))
    pts = nb.add("GeometryNodeMeshToPoints")
    nb.link(grid.outputs["Mesh"], pts.inputs["Mesh"])
    # jitter
    rj = nb.add("FunctionNodeRandomValue", data_type="FLOAT_VECTOR")
    rj.inputs["Min"].default_value = (-jitter, -jitter, 0)
    rj.inputs["Max"].default_value = (jitter, jitter, 0)
    setp = nb.add("GeometryNodeSetPosition")
    nb.link(pts.outputs["Points"], setp.inputs["Geometry"])
    nb.link(sock(rj, "Value", "VECTOR", out=True), setp.inputs["Offset"])
    oi = nb.add("GeometryNodeObjectInfo", transform_space="ORIGINAL")
    oi.inputs["Object"].default_value = inst_obj
    iop = nb.add("GeometryNodeInstanceOnPoints")
    nb.link(setp.outputs["Geometry"], iop.inputs["Points"])
    nb.link(oi.outputs["Geometry"], iop.inputs["Instance"])
    rr = nb.add("FunctionNodeRandomValue", data_type="FLOAT_VECTOR")
    rr.inputs["Min"].default_value = (-0.08, -0.08, 0)
    rr.inputs["Max"].default_value = (0.08, 0.08, math.tau)
    rr.inputs["Seed"].default_value = 3
    nb.link(sock(rr, "Value", "VECTOR", out=True), iop.inputs["Rotation"])
    rs = nb.add("FunctionNodeRandomValue", data_type="FLOAT")
    sock(rs, "Min", "VALUE").default_value = scale[0]
    sock(rs, "Max", "VALUE").default_value = scale[1]
    rs.inputs["Seed"].default_value = 5
    sv = sock(rs, "Value", "VALUE", out=True)
    geo = iop.outputs["Instances"]
    if grow:
        val = nb.add("ShaderNodeValue")
        for f, v in grow:
            val.outputs[0].default_value = v
            val.outputs[0].keyframe_insert("default_value", frame=f)
        sv = nb.math("MULTIPLY", sv, val.outputs[0])
    nb.link(sv, iop.inputs["Scale"])
    if wind > 0:
        t = nb.add("GeometryNodeInputSceneTime")
        pos = nb.add("GeometryNodeInputPosition")
        p = nb.vmath("SCALE", pos.outputs[0], None)
        p.node.inputs[3].default_value = 0.08
        noise = nb.add("ShaderNodeTexNoise", noise_dimensions="4D")
        noise.inputs["Scale"].default_value = 1.0
        nb.link(p, noise.inputs["Vector"])
        w = nb.math("MULTIPLY", t.outputs["Seconds"], 0.45)
        nb.link(w, noise.inputs["W"])
        cen = nb.vmath("SUBTRACT", noise.outputs["Color"], (0.5, 0.5, 0.5))
        amp = nb.vmath("MULTIPLY", cen, (wind, wind, 0))
        rot = nb.add("GeometryNodeRotateInstances")
        nb.link(geo, rot.inputs["Instances"])
        nb.link(amp, rot.inputs["Rotation"])
        try:
            rot.inputs["Local Space"].default_value = True
        except Exception:
            pass
        geo = rot.outputs["Instances"]
    tr = nb.add("GeometryNodeTransform")
    tr.inputs["Translation"].default_value = offset
    nb.link(geo, tr.inputs["Geometry"])
    nb.link(tr.outputs["Geometry"], gout.inputs[0])
    mod = host.modifiers.new(name, "NODES")
    mod.node_group = ng
    return mod

def gn_scatter(name, host, inst_obj, density, seed=1, scale=(0.7, 1.3), mask_attr=None):
    """Random scatter on a mesh's faces (trees)."""
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nb = NB(ng)
    gin = nb.add("NodeGroupInput"); gout = nb.add("NodeGroupOutput")
    dist = nb.add("GeometryNodeDistributePointsOnFaces")
    dist.inputs["Density"].default_value = density
    dist.inputs["Seed"].default_value = seed
    nb.link(gin.outputs[0], dist.inputs["Mesh"])
    if mask_attr:
        na = nb.add("GeometryNodeInputNamedAttribute", data_type="FLOAT")
        na.inputs["Name"].default_value = mask_attr
        nb.link(sock(na, "Attribute", "VALUE", out=True), dist.inputs["Selection"])
    oi = nb.add("GeometryNodeObjectInfo", transform_space="ORIGINAL")
    oi.inputs["Object"].default_value = inst_obj
    iop = nb.add("GeometryNodeInstanceOnPoints")
    nb.link(dist.outputs["Points"], iop.inputs["Points"])
    nb.link(oi.outputs["Geometry"], iop.inputs["Instance"])
    rr = nb.add("FunctionNodeRandomValue", data_type="FLOAT_VECTOR")
    rr.inputs["Max"].default_value = (0, 0, math.tau)
    nb.link(sock(rr, "Value", "VECTOR", out=True), iop.inputs["Rotation"])
    rs = nb.add("FunctionNodeRandomValue", data_type="FLOAT")
    sock(rs, "Min", "VALUE").default_value = scale[0]
    sock(rs, "Max", "VALUE").default_value = scale[1]
    nb.link(sock(rs, "Value", "VALUE", out=True), iop.inputs["Scale"])
    join = nb.add("GeometryNodeJoinGeometry")
    nb.link(iop.outputs["Instances"], join.inputs[0])
    nb.link(gin.outputs[0], join.inputs[0])
    nb.link(join.outputs[0], gout.inputs[0])
    mod = host.modifiers.new(name, "NODES")
    mod.node_group = ng
    return mod

# ------------------------------------------------------------------ the world

def sky_world(horizon, zenith, ground, sun_dir, sun_col, sun_glow=0.0, strength=1.0):
    w = bpy.data.worlds.new("Sky")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear(); nb = NB(nt)
    out = nb.add("ShaderNodeOutputWorld")
    tc = nb.add("ShaderNodeTexCoord")
    d = nb.vmath("NORMALIZE", tc.outputs["Generated"])
    sep = nb.add("ShaderNodeSeparateXYZ"); nb.link(d, sep.inputs[0])
    z = sep.outputs["Z"]
    up = nb.math("POWER", nb.math("MAXIMUM", z, 0.0), 0.55)
    col = nb.mix_col(up, (*horizon, 1), (*zenith, 1))
    below = nb.math("LESS_THAN", z, 0.0)
    col = nb.mix_col(below, col, (*ground, 1))
    if sun_glow > 0:
        dd = nb.math("MAXIMUM", nb.vmath("DOT_PRODUCT", d, tuple(Vector(sun_dir).normalized())), 0.0)
        glow = nb.math("ADD", nb.math("MULTIPLY", nb.math("POWER", dd, 8.0), 0.35 * sun_glow),
                       nb.math("MULTIPLY", nb.math("POWER", dd, 700.0), 12.0 * sun_glow))
        g = nb.mix_col(1.0, (0, 0, 0, 1), (*sun_col, 1))
        mulc = nb.add("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
        sock(mulc, "Factor", "VALUE").default_value = 1
        nb.link(g, sock(mulc, "A", "RGBA"))
        nb.link(glow, sock(mulc, "B", "RGBA"))
        addc = nb.add("ShaderNodeMix", data_type="RGBA", blend_type="ADD")
        sock(addc, "Factor", "VALUE").default_value = 1
        nb.link(col, sock(addc, "A", "RGBA"))
        nb.link(sock(mulc, "Result", "RGBA", out=True), sock(addc, "B", "RGBA"))
        col = sock(addc, "Result", "RGBA", out=True)
    bg = nb.add("ShaderNodeBackground", in_Strength=strength)
    nb.link(col, bg.inputs["Color"])
    nb.link(bg.outputs[0], out.inputs["Surface"])
    return w

def add_sun(direction, color, strength, angle=2.0):
    """`direction` points from the ground toward the sun."""
    ld = bpy.data.lights.new("Sun", "SUN")
    ld.energy = strength
    ld.color = color
    ld.angle = math.radians(angle)
    ob = bpy.data.objects.new("Sun", ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = Vector(direction).to_track_quat("Z", "Y").to_euler()
    return ob

HAZE_STRENGTH = [0.65]

def haze(nb, col_socket, haze_col, k):
    """Kept for compatibility: albedo is left as is; see haze_shader."""
    return col_socket

def haze_shader(nb, shader_socket, haze_col, k):
    """Aerial perspective: blend the lit surface toward glowing haze with camera distance."""
    cam = nb.add("ShaderNodeCameraData")
    f = nb.math("SUBTRACT", 1.0, nb.math("EXPONENT", nb.math("MULTIPLY", cam.outputs["View Distance"], -k)))
    em = nb.add("ShaderNodeEmission", in_Strength=HAZE_STRENGTH[0])
    em.inputs["Color"].default_value = (*haze_col, 1)
    mx = nb.add("ShaderNodeMixShader")
    nb.link(f, mx.inputs[0]); nb.link(shader_socket, mx.inputs[1]); nb.link(em.outputs[0], mx.inputs[2])
    return mx.outputs[0]

def terrain(size=5000, subdiv=420, flat_r=420, ramp_r=1100, amp=26, haze_col=(0.75, 0.78, 0.8), haze_k=0.00018,
            palette="dawn"):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=subdiv, y_subdivisions=subdiv, size=size)
    ob = bpy.context.active_object; ob.name = "Terrain"
    vg = ob.vertex_groups.new(name="relief")
    for v in ob.data.vertices:
        r = Vector((v.co.x, v.co.y)).length
        w = 0.0 if r < flat_r else min(1.0, (r - flat_r) / (ramp_r - flat_r)) ** 1.5
        vg.add([v.index], w, "REPLACE")
    tex = bpy.data.textures.new("relief", "CLOUDS"); tex.noise_scale = 520; tex.noise_depth = 3
    d = ob.modifiers.new("relief", "DISPLACE"); d.texture = tex; d.strength = amp; d.vertex_group = "relief"; d.mid_level = 0.45
    tex2 = bpy.data.textures.new("ripple", "CLOUDS"); tex2.noise_scale = 90
    d2 = ob.modifiers.new("ripple", "DISPLACE"); d2.texture = tex2; d2.strength = 3.5; d2.vertex_group = "relief"
    # tree mask attribute: hedgerow-ish random clumps away from the hero field
    from mathutils import noise as mnoise
    attr = ob.data.attributes.new("treemask", "FLOAT", "POINT")
    for i, v in enumerate(ob.data.vertices):
        r = Vector((v.co.x, v.co.y)).length
        n = mnoise.noise(Vector((v.co.x / 380, v.co.y / 380, 0.3)))
        attr.data[i].value = 1.0 if (r > 300 and n > 0.36) else 0.0
    bpy.ops.object.shade_smooth()

    m, nb = new_mat("Fields")
    out = nb.add("ShaderNodeOutputMaterial"); bsdf = nb.add("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.85
    tc = nb.add("ShaderNodeTexCoord")
    co = tc.outputs["Object"]
    # parcels: brick texture gives rectangular, staggered fields; mortar = hedges and paths
    rot = nb.add("ShaderNodeMapping"); rot.inputs["Rotation"].default_value = (0, 0, math.radians(14))
    rot.inputs["Scale"].default_value = (1 / 85, 1 / 85, 1)
    nb.link(co, rot.inputs["Vector"])
    brick = nb.add("ShaderNodeTexBrick", offset=0.37, offset_frequency=1, squash=1.0, squash_frequency=2)
    brick.inputs["Color1"].default_value = (0, 0, 0, 1); brick.inputs["Color2"].default_value = (1, 1, 1, 1)
    brick.inputs["Mortar"].default_value = (0, 0, 0, 1)
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Mortar Size"].default_value = 0.012
    brick.inputs["Bias"].default_value = 0.0
    brick.inputs["Brick Width"].default_value = 1.7
    brick.inputs["Row Height"].default_value = 0.75
    nb.link(rot.outputs[0], brick.inputs["Vector"])
    cellv = nb.add("ShaderNodeRGBToBW"); nb.link(brick.outputs["Color"], cellv.inputs[0])
    cell_a = cellv.outputs[0]
    cell_b = nb.math("FRACT", nb.math("MULTIPLY", cell_a, 7.31))
    edge_mask = brick.outputs["Fac"]
    if palette == "golden":
        stops = [(0.0, (0.20, 0.30, 0.07)), (0.22, (0.32, 0.40, 0.10)), (0.42, (0.55, 0.45, 0.18)),
                 (0.6, (0.42, 0.30, 0.16)), (0.78, (0.26, 0.36, 0.09)), (0.9, (0.60, 0.52, 0.25))]
    else:
        stops = [(0.0, (0.10, 0.24, 0.05)), (0.2, (0.20, 0.36, 0.07)), (0.38, (0.34, 0.40, 0.12)),
                 (0.55, (0.28, 0.19, 0.11)), (0.7, (0.14, 0.29, 0.06)), (0.85, (0.44, 0.40, 0.18)), (0.95, (0.24, 0.30, 0.09))]
    base = nb.ramp(cell_a, stops, interp="CONSTANT")
    # crop rows: bands along X or Y depending on the parcel
    wx = nb.add("ShaderNodeTexWave", bands_direction="X"); wx.inputs["Scale"].default_value = 0.0105 * 85
    wy = nb.add("ShaderNodeTexWave", bands_direction="Y"); wy.inputs["Scale"].default_value = 0.0105 * 85
    wx.inputs["Distortion"].default_value = 0; wy.inputs["Distortion"].default_value = 0
    nb.link(rot.outputs[0], wx.inputs["Vector"]); nb.link(rot.outputs[0], wy.inputs["Vector"])
    pick = nb.math("GREATER_THAN", cell_b, 0.5)
    bands = nb.mix_col(pick, wx.outputs["Fac"], wy.outputs["Fac"])
    bandv = nb.add("ShaderNodeRGBToBW"); nb.link(bands, bandv.inputs[0])
    shade = nb.math("ADD", 0.82, nb.math("MULTIPLY", bandv.outputs[0], 0.22))
    col = nb.add("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    sock(col, "Factor", "VALUE").default_value = 1
    nb.link(base, sock(col, "A", "RGBA")); nb.link(shade, sock(col, "B", "RGBA"))
    colr = sock(col, "Result", "RGBA", out=True)
    # field noise
    nz = nb.add("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 0.04
    nb.link(co, nz.inputs["Vector"])
    nzc = nb.math("ADD", 0.85, nb.math("MULTIPLY", nz.outputs["Fac"], 0.3))
    col2 = nb.add("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    sock(col2, "Factor", "VALUE").default_value = 1
    nb.link(colr, sock(col2, "A", "RGBA")); nb.link(nzc, sock(col2, "B", "RGBA"))
    colr = sock(col2, "Result", "RGBA", out=True)
    # hedges / paths along parcel edges
    colr = nb.mix_col(edge_mask, colr, (0.07, 0.13, 0.05, 1))
    colr = haze(nb, colr, haze_col, haze_k)
    nb.link(colr, bsdf.inputs["Base Color"])
    nb.link(haze_shader(nb, bsdf.outputs[0], haze_col, haze_k), out.inputs["Surface"])
    ob.data.materials.append(m)
    return ob

def mountains(haze_col, k=0.00016, ring=2600):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=260, y_subdivisions=260, size=26000)
    ob = bpy.context.active_object; ob.name = "Mountains"
    vg = ob.vertex_groups.new(name="m")
    for v in ob.data.vertices:
        r = Vector((v.co.x, v.co.y)).length
        vg.add([v.index], max(0.0, min(1.0, (r - ring) / 2500)) ** 1.3, "REPLACE")
    ob.location.z = -6
    tex = bpy.data.textures.new("mt", "CLOUDS"); tex.noise_scale = 2600; tex.noise_depth = 6; tex.noise_type = "HARD_NOISE"
    d = ob.modifiers.new("mt", "DISPLACE"); d.texture = tex; d.strength = 950; d.vertex_group = "m"; d.mid_level = 0.25
    bpy.ops.object.shade_smooth()
    m, nb = new_mat("Mountains")
    out = nb.add("ShaderNodeOutputMaterial"); bsdf = nb.add("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Base Color"].default_value = (0.05, 0.09, 0.06, 1)
    nb.link(haze_shader(nb, bsdf.outputs[0], haze_col, k), out.inputs["Surface"])
    ob.data.materials.append(m)
    return ob

def mist_volume(z=8, height=40, density=0.0016, size=3200):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 300, z + height / 2))
    ob = bpy.context.active_object; ob.name = "Mist"
    ob.scale = (size, size, height)
    m, nb = new_mat("Mist")
    out = nb.add("ShaderNodeOutputMaterial")
    vol = nb.add("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (0.95, 0.93, 0.9, 1)
    tc = nb.add("ShaderNodeTexCoord")
    nz = nb.add("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 3.0; nz.inputs["Detail"].default_value = 2
    nb.link(tc.outputs["Generated"], nz.inputs["Vector"])
    sep = nb.add("ShaderNodeSeparateXYZ"); nb.link(tc.outputs["Generated"], sep.inputs[0])
    fall = nb.math("SUBTRACT", 1.0, sep.outputs["Z"])
    dens = nb.math("MULTIPLY", nb.math("MULTIPLY", nb.math("POWER", nz.outputs["Fac"], 3.0), fall), density * 6)
    nb.link(dens, vol.inputs["Density"])
    nb.link(vol.outputs[0], out.inputs["Volume"])
    ob.data.materials.append(m)
    return ob

def camera_rig(lens=28):
    cd = bpy.data.cameras.new("Cam"); cd.lens = lens; cd.clip_end = 40000; cd.clip_start = 0.5
    cam = bpy.data.objects.new("Cam", cd); bpy.context.scene.collection.objects.link(cam)
    tgt = bpy.data.objects.new("Target", None); bpy.context.scene.collection.objects.link(tgt)
    c = cam.constraints.new("TRACK_TO"); c.target = tgt; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
    bpy.context.scene.camera = cam
    return cam, tgt

def fly(cam, tgt, keys):
    """keys: list of (seconds, cam_pos, target_pos)."""
    for t, p, q in keys:
        cam.location = p; cam.keyframe_insert("location", frame=sec(t))
        tgt.location = q; tgt.keyframe_insert("location", frame=sec(t))
    ease_all(cam); ease_all(tgt)

# ------------------------------------------------------------- data layers

def data_layer(name, z, size, cell, palette, opacity, wipe, speed=0.06, streaks=False, grid=True):
    """Transparent geospatial layer: pixelated animated field + faint grid, revealed by a wipe."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 60, z))
    ob = bpy.context.active_object; ob.name = name; ob.scale = (size[0], size[1], 1)
    m, nb = new_mat(name)
    try:
        m.surface_render_method = "BLENDED"
    except Exception:
        m.blend_method = "BLEND"
    out = nb.add("ShaderNodeOutputMaterial")
    tc = nb.add("ShaderNodeTexCoord")
    gen = tc.outputs["Generated"]
    world = nb.vmath("MULTIPLY", gen, (size[0], size[1], 1))
    snapped = nb.vmath("SNAP", world, (cell, cell, cell))
    tm = nb.add("ShaderNodeValue")
    for f in (1, sec(12)):
        tm.outputs[0].default_value = (f - 1) / FPS * speed
        tm.outputs[0].keyframe_insert("default_value", frame=f)
    nz = nb.add("ShaderNodeTexNoise", noise_dimensions="4D")
    nz.inputs["Scale"].default_value = 0.006 if not streaks else 0.004
    nz.inputs["Detail"].default_value = 3
    src = snapped
    if streaks:  # rain bands drifting across the field
        drift = nb.vmath("ADD", snapped, (0, 0, 0))
        offs = nb.add("ShaderNodeCombineXYZ")
        nb.link(nb.math("MULTIPLY", tm.outputs[0], 2400.0), offs.inputs["X"])
        drift = nb.vmath("ADD", snapped, offs.outputs[0])
        src = nb.vmath("MULTIPLY", drift, (1.0, 2.6, 1.0))
    nb.link(src, nz.inputs["Vector"])
    nb.link(tm.outputs[0], nz.inputs["W"])
    colr = nb.ramp(nz.outputs["Fac"], palette)
    # intensity also drives alpha so low values fade out
    bw = nb.add("ShaderNodeRGBToBW"); nb.link(colr, bw.inputs[0])
    patch = nb.add("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
    nb.link(nz.outputs["Fac"], patch.inputs["Value"])
    patch.inputs["From Min"].default_value = 0.42; patch.inputs["From Max"].default_value = 0.68
    a = nb.math("MULTIPLY", patch.outputs["Result"], opacity)
    # grid lines at cell edges
    if grid:
        fr = nb.vmath("FRACTION", nb.vmath("DIVIDE", world, (cell * 4, cell * 4, 1)))
        sx = nb.add("ShaderNodeSeparateXYZ"); nb.link(fr, sx.inputs[0])
        lx = nb.math("LESS_THAN", sx.outputs["X"], 0.012)
        ly = nb.math("LESS_THAN", sx.outputs["Y"], 0.012)
        g = nb.math("MAXIMUM", lx, ly)
        colr = nb.mix_col(nb.math("MULTIPLY", g, 0.5), colr, (0.95, 0.97, 0.95, 1))
        a = nb.math("MAXIMUM", a, nb.math("MULTIPLY", g, 0.12))
    # soft rectangle edges
    sg = nb.add("ShaderNodeSeparateXYZ"); nb.link(gen, sg.inputs[0])
    ex = nb.math("MINIMUM", sg.outputs["X"], nb.math("SUBTRACT", 1.0, sg.outputs["X"]))
    ey = nb.math("MINIMUM", sg.outputs["Y"], nb.math("SUBTRACT", 1.0, sg.outputs["Y"]))
    edge = nb.math("MINIMUM", nb.math("MULTIPLY", ex, 14.0), nb.math("MULTIPLY", ey, 14.0), clamp=True)
    # border outline
    border = nb.math("LESS_THAN", nb.math("MINIMUM", ex, ey), 0.0025)
    colr = nb.mix_col(border, colr, (0.96, 0.97, 0.94, 1))
    a = nb.math("MAXIMUM", nb.math("MULTIPLY", a, edge), nb.math("MULTIPLY", border, 0.85))
    # wipe reveal along X
    wv = nb.add("ShaderNodeValue")
    for f, v in wipe:
        wv.outputs[0].default_value = v
        wv.outputs[0].keyframe_insert("default_value", frame=f)
    rv = nb.math("SUBTRACT", wv.outputs[0], sg.outputs["X"])
    reveal = nb.math("MULTIPLY", rv, 18.0, clamp=True)
    lead = nb.math("MULTIPLY", nb.math("SUBTRACT", 1.0, nb.math("MULTIPLY", nb.math("ABSOLUTE", rv), 30.0), clamp=True), 1.0)
    a = nb.math("MULTIPLY", a, reveal)
    em = nb.add("ShaderNodeEmission", in_Strength=1.6)
    nb.link(colr, em.inputs["Color"])
    leadc = nb.mix_col(nb.math("MULTIPLY", lead, 0.9), colr, (1, 1, 1, 1))
    nb.link(leadc, em.inputs["Color"])
    a = nb.math("MAXIMUM", a, nb.math("MULTIPLY", lead, nb.math("MULTIPLY", wv.outputs[0], 0.0) if False else 0.0))
    tr = nb.add("ShaderNodeBsdfTransparent")
    mix = nb.add("ShaderNodeMixShader")
    nb.link(a, mix.inputs[0]); nb.link(tr.outputs[0], mix.inputs[1]); nb.link(em.outputs[0], mix.inputs[2])
    nb.link(mix.outputs[0], out.inputs["Surface"])
    ob.data.materials.append(m)
    ob.visible_shadow = False
    return ob

# ================================================================ scenes

def scene_landscape(frames, golden=False):
    sc = setup_render(frames)
    if golden:
        sun_dir = (-0.78, 0.52, 0.13); sun_col = (1.0, 0.58, 0.30); horizon = (1.0, 0.68, 0.42); zen = (0.30, 0.40, 0.62)
        hz = (0.98, 0.72, 0.52)
    else:
        sun_dir = (0.70, 0.62, 0.16); sun_col = (1.0, 0.80, 0.60); horizon = (1.0, 0.80, 0.62); zen = (0.26, 0.44, 0.80)
        hz = (0.84, 0.80, 0.78)
    HAZE_STRENGTH[0] = 0.62
    sky_world(horizon, zen, tuple(c * 0.92 for c in horizon), sun_dir, sun_col, sun_glow=1.0, strength=0.65)
    add_sun(sun_dir, sun_col, 6.0 if not golden else 7.5, angle=1.2)
    ter = terrain(size=9000, subdiv=520, haze_col=hz, haze_k=0.00008, palette="golden" if golden else "dawn")
    mountains(hz, k=0.00016, ring=5200)
    lib = crop_library()
    tleaf = principled("TreeLeaf", (0.11, 0.22, 0.07), rough=0.7, translucent=0.1)
    trunk = principled("Trunk", (0.12, 0.08, 0.05), rough=0.8)
    tree = make_tree("tree", tleaf, trunk); hide(tree)
    trees_host = ter
    gn_scatter("Trees", trees_host, tree, 0.0022, scale=(1.3, 2.3), mask_attr="treemask")
    # hero corn field in rows around the origin
    soil = principled("Soil", (0.20, 0.13, 0.08), rough=0.95)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 60, 0.05))
    field = bpy.context.active_object; field.name = "HeroField"; field.scale = (190, 150, 1)
    field.data.materials.append(soil)
    host = bpy.data.objects.new("CornHost", bpy.data.meshes.new("h")); sc.collection.objects.link(host)
    host.location = (0, 60, 0.05)
    gn_instancer("Corn", host, lib["corn"], (186, 146), (0.8, 0.45), jitter=0.1, wind=0.07)
    if golden:
        host2 = bpy.data.objects.new("CornNear", bpy.data.meshes.new("h2")); sc.collection.objects.link(host2)
        host2.location = (0, 180, 0.05)
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 180, 0.04))
        f2 = bpy.context.active_object; f2.scale = (60, 240, 1); f2.data.materials.append(soil)
        gn_instancer("CornNear", host2, lib["corn"], (58, 236), (0.75, 0.32), jitter=0.08, wind=0.09)
    cam, tgt = camera_rig(lens=26)
    if golden:
        mist_volume(z=0, height=18, density=0.0006, size=2600)
        fly(cam, tgt, [(0.0, (0, -40, 13), (0, 260, 2)), (4.9, (0, 55, 15), (0, 380, 4))])
    else:
        mist_volume(z=2, height=34, density=0.0016)
        fly(cam, tgt, [(0.0, (-320, -2700, 1050), (260, 1100, 0)),
                       (3.9, (0, -105, 24), (0, 70, 1)),
                       (10.3, (-430, -330, 230), (0, 60, 52))])
        # data layers (S2): wipes in sequence after 3.9 s
        pal_rain = [(0.0, (0.16, 0.32, 0.62)), (0.5, (0.30, 0.52, 0.85)), (1.0, (0.60, 0.78, 0.98))]
        pal_moist = [(0.0, (0.05, 0.25, 0.45)), (0.5, (0.12, 0.55, 0.70)), (1.0, (0.55, 0.88, 0.92))]
        pal_veg = [(0.0, (0.30, 0.38, 0.12)), (0.45, (0.30, 0.62, 0.20)), (1.0, (0.62, 0.86, 0.40))]
        pal_temp = [(0.0, (0.55, 0.35, 0.20)), (0.5, (0.86, 0.55, 0.28)), (1.0, (0.98, 0.84, 0.58))]
        W = (320, 240)
        for i, (nm, z, cell, pal, op, streak) in enumerate([
                ("Temperature", 16, 20, pal_temp, 0.62, False), ("Vegetation", 44, 6, pal_veg, 0.72, False),
                ("Moisture", 72, 14, pal_moist, 0.66, False), ("Rainfall", 100, 26, pal_rain, 0.6, True)]):
            t0 = 4.4 + (3 - i) * 0.75  # rain first, temperature last
            data_layer(nm, z, W, cell, pal, op, [(1, -0.1), (sec(t0), -0.1), (sec(t0 + 1.1), 1.12)], streaks=streak)
        # corner guides that tie the stack to the field below
        gm, gnb = new_mat("Guide")
        try:
            gm.surface_render_method = "BLENDED"
        except Exception:
            pass
        go = gnb.add("ShaderNodeOutputMaterial"); ge = gnb.add("ShaderNodeEmission", in_Strength=2.0)
        ge.inputs["Color"].default_value = (0.92, 0.96, 0.92, 1)
        gv = gnb.add("ShaderNodeValue")
        for f, v in ((1, 0.0), (sec(4.2), 0.0), (sec(4.8), 0.75)):
            gv.outputs[0].default_value = v; gv.outputs[0].keyframe_insert("default_value", frame=f)
        gt = gnb.add("ShaderNodeBsdfTransparent"); gmx = gnb.add("ShaderNodeMixShader")
        gnb.link(gv.outputs[0], gmx.inputs[0]); gnb.link(gt.outputs[0], gmx.inputs[1]); gnb.link(ge.outputs[0], gmx.inputs[2])
        gnb.link(gmx.outputs[0], go.inputs["Surface"])
        for cx in (-W[0] / 2, W[0] / 2):
            for cy in (-W[1] / 2, W[1] / 2):
                bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.35, depth=100, location=(cx, 60 + cy, 50))
                pin = bpy.context.active_object; pin.data.materials.append(gm); pin.visible_shadow = False
    return sc

def scene_lfm(frames):
    sc = setup_render(frames)
    sky_world((0.06, 0.13, 0.09), (0.02, 0.045, 0.03), (0.012, 0.025, 0.018), (0, 0, 1), (1, 1, 1), 0.0, strength=1.4)
    add_sun((-0.45, -0.55, 0.7), (1.0, 0.94, 0.86), 3.2, angle=6)
    add_sun((0.4, 0.8, 0.35), (0.72, 0.86, 1.0), 1.6, angle=10)
    lib = crop_library()
    W, D, T = 34, 24, 1.6
    layers = [  # top to bottom
        ("CLIMATE MEMORY", (0.93, 0.90, 0.82), 0.35, "glass"),
        ("VEGETATION MEMORY", (0.26, 0.50, 0.16), 0.0, "veg"),
        ("ROTATION MEMORY", (0.42, 0.38, 0.18), 0.0, "rot"),
        ("SOIL MEMORY", (0.40, 0.26, 0.15), 0.0, "soil"),
        ("WATER MEMORY", (0.22, 0.42, 0.62), 0.3, "water"),
    ]
    font = None
    for fp in ("/System/Library/Fonts/Avenir Next.ttc", "/System/Library/Fonts/HelveticaNeue.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        try:
            font = bpy.data.fonts.load(fp); break
        except Exception:
            pass
    gap_final = 4.6
    n = len(layers)
    for i, (label, col, trans, kind) in enumerate(layers):
        z0 = (n - 1 - i) * T            # assembled
        z1 = (n - 1 - i) * (T + gap_final)  # separated
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, z0))
        slab = bpy.context.active_object; slab.name = label; slab.scale = (W, D, T * 0.96)
        bev = slab.modifiers.new("b", "BEVEL"); bev.width = 0.18; bev.segments = 3
        m, nb = new_mat(label)
        out = nb.add("ShaderNodeOutputMaterial"); p = nb.add("ShaderNodeBsdfPrincipled")
        p.inputs["Roughness"].default_value = 0.55
        tc = nb.add("ShaderNodeTexCoord")
        base = (*col, 1)
        if kind == "soil":
            wv = nb.add("ShaderNodeTexWave", bands_direction="Z"); wv.inputs["Scale"].default_value = 2.2
            wv.inputs["Distortion"].default_value = 6
            nb.link(tc.outputs["Generated"], wv.inputs["Vector"])
            c = nb.ramp(wv.outputs["Fac"], [(0, (0.22, 0.13, 0.07)), (0.5, (0.36, 0.23, 0.13)), (1, (0.45, 0.31, 0.18))])
            nb.link(c, p.inputs["Base Color"])
        elif kind == "rot":
            wv = nb.add("ShaderNodeTexWave", bands_direction="X", wave_profile="SAW"); wv.inputs["Scale"].default_value = 2.0
            wv.inputs["Distortion"].default_value = 0
            nb.link(tc.outputs["Generated"], wv.inputs["Vector"])
            c = nb.ramp(wv.outputs["Fac"], [(0, (0.18, 0.40, 0.10)), (0.25, (0.48, 0.55, 0.20)), (0.5, (0.42, 0.30, 0.16)),
                                            (0.75, (0.28, 0.42, 0.15))], interp="CONSTANT")
            nb.link(c, p.inputs["Base Color"])
        elif kind in ("glass", "water"):
            try:
                m.surface_render_method = "BLENDED"
            except Exception:
                pass
            nz = nb.add("ShaderNodeTexNoise", noise_dimensions="4D"); nz.inputs["Scale"].default_value = 3.0
            nb.link(tc.outputs["Generated"], nz.inputs["Vector"])
            tv = nb.add("ShaderNodeValue")
            for f in (1, frames[1]):
                tv.outputs[0].default_value = f / FPS * 0.25
                tv.outputs[0].keyframe_insert("default_value", frame=f)
            nb.link(tv.outputs[0], nz.inputs["W"])
            c = nb.ramp(nz.outputs["Fac"], [(0.3, tuple(x * 0.7 for x in col)), (0.7, tuple(min(1, x * 1.25) for x in col))])
            nb.link(c, p.inputs["Base Color"])
            p.inputs["Alpha"].default_value = 0.55
            p.inputs["Emission Color"].default_value = (*col, 1)
            nb.link(nb.math("MULTIPLY", nz.outputs["Fac"], 0.6), p.inputs["Emission Strength"])
        else:
            nz = nb.add("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 6
            nb.link(tc.outputs["Generated"], nz.inputs["Vector"])
            c = nb.ramp(nz.outputs["Fac"], [(0.3, tuple(x * 0.8 for x in col)), (0.7, tuple(min(1, x * 1.2) for x in col))])
            nb.link(c, p.inputs["Base Color"])
        nb.link(p.outputs[0], out.inputs["Surface"])
        slab.data.materials.append(m)
        # separation, top layer first
        t_sep = 0.7 + i * 0.32
        sep_keys = ((1, z0), (sec(t_sep), z0), (sec(t_sep + 1.3), z1))
        for f, z in sep_keys:
            slab.location.z = z; slab.keyframe_insert("location", frame=f, index=2)
        ease_all(slab)
        def follow(ob, dz):
            for f, z in sep_keys:
                ob.location.z = z + dz; ob.keyframe_insert("location", frame=f, index=2)
            ease_all(ob)
        if kind == "veg":
            host = bpy.data.objects.new("VegCrops", bpy.data.meshes.new("vc")); sc.collection.objects.link(host)
            follow(host, T * 0.48)
            gn_instancer("VegCrops", host, lib["corn"], (W - 1.5, D - 1.5), (0.9, 0.6), jitter=0.12, scale=(0.5, 0.65), wind=0.05,
                         offset=(0, 0, 0))
        if font:
            cu = bpy.data.curves.new(label, "FONT"); cu.body = label; cu.font = font; cu.size = 1.25; cu.align_x = "LEFT"
            cu.space_character = 1.12
            to = bpy.data.objects.new(label + "_t", cu); sc.collection.objects.link(to)
            to.location = (W / 2 + 1.6, -D / 2 + 2.0, 0)
            to.rotation_euler = (math.radians(78), 0, math.radians(40))
            follow(to, -0.45)
            tm, tnb = new_mat(label + "_tm")
            try:
                tm.surface_render_method = "BLENDED"
            except Exception:
                pass
            o = tnb.add("ShaderNodeOutputMaterial"); em = tnb.add("ShaderNodeEmission", in_Strength=2.2)
            em.inputs["Color"].default_value = (0.95, 0.96, 0.92, 1)
            trn = tnb.add("ShaderNodeBsdfTransparent"); mx = tnb.add("ShaderNodeMixShader")
            fv = tnb.add("ShaderNodeValue")
            for f, v in ((1, 0.0), (sec(t_sep + 0.9), 0.0), (sec(t_sep + 1.5), 1.0)):
                fv.outputs[0].default_value = v; fv.outputs[0].keyframe_insert("default_value", frame=f)
            tnb.link(fv.outputs[0], mx.inputs[0]); tnb.link(trn.outputs[0], mx.inputs[1]); tnb.link(em.outputs[0], mx.inputs[2])
            tnb.link(mx.outputs[0], o.inputs["Surface"])
            cu.materials.append(tm)
    # data connectors: thin vertical light threads with travelling pulses
    total_h = (n - 1) * (T + gap_final)
    for j in range(9):
        x = random.uniform(-W / 2 + 3, W / 2 - 3); y = random.uniform(-D / 2 + 3, D / 2 - 3)
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.06, depth=total_h, location=(x, y, total_h / 2))
        th = bpy.context.active_object
        m, nb = new_mat(f"thread{j}")
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            pass
        out = nb.add("ShaderNodeOutputMaterial"); tc = nb.add("ShaderNodeTexCoord")
        sep = nb.add("ShaderNodeSeparateXYZ"); nb.link(tc.outputs["Generated"], sep.inputs[0])
        tv = nb.add("ShaderNodeValue")
        for f in (1, frames[1]):
            tv.outputs[0].default_value = f / FPS * (0.35 + 0.1 * (j % 3)) * (1 if j % 2 else -1) + j * 0.17
            tv.outputs[0].keyframe_insert("default_value", frame=f)
        ph = nb.math("FRACT", nb.math("ADD", nb.math("MULTIPLY", sep.outputs["Z"], 2.0), tv.outputs[0]))
        pulse = nb.math("POWER", nb.math("SUBTRACT", 1.0, nb.math("ABSOLUTE", nb.math("SUBTRACT", ph, 0.5))), 18.0)
        on = nb.add("ShaderNodeValue")
        for f, v in ((1, 0.0), (sec(2.6), 0.0), (sec(3.2), 1.0)):
            on.outputs[0].default_value = v; on.outputs[0].keyframe_insert("default_value", frame=f)
        a = nb.math("MULTIPLY", nb.math("ADD", 0.18, nb.math("MULTIPLY", pulse, 3.0)), on.outputs[0])
        em = nb.add("ShaderNodeEmission", in_Strength=3.0); em.inputs["Color"].default_value = (0.75, 0.95, 0.70, 1)
        trn = nb.add("ShaderNodeBsdfTransparent"); mx = nb.add("ShaderNodeMixShader")
        nb.link(nb.math("MINIMUM", a, 1.0), mx.inputs[0]); nb.link(trn.outputs[0], mx.inputs[1]); nb.link(em.outputs[0], mx.inputs[2])
        nb.link(mx.outputs[0], out.inputs["Surface"])
        th.data.materials.append(m)
        th.visible_shadow = False
    cam, tgt = camera_rig(lens=42)
    # target sits left of the model so it frames right of centre, leaving room for the title
    fly(cam, tgt, [(0.0, (52, -60, 27), (-4, -4, 1)), (5.9, (68, -76, 52), (-4, -5, total_h * 0.44))])
    # slow orbit: rotate a parent instead of the path
    return sc

def scene_rotation(frames):
    sc = setup_render(frames)
    sun_dir = (0.5, 0.45, 0.45)
    sky_world((0.92, 0.88, 0.80), (0.40, 0.55, 0.78), (0.25, 0.27, 0.22), sun_dir, (1, 0.9, 0.78), 0.6, 0.9)
    add_sun(sun_dir, (1.0, 0.92, 0.8), 4.5, angle=2.0)
    terrain(size=3000, subdiv=260, flat_r=300, ramp_r=900, amp=18, haze_col=(0.82, 0.84, 0.85), haze_k=0.0006)
    mountains((0.82, 0.84, 0.85))
    lib = crop_library()
    soil = principled("TilledSoil", (0.24, 0.15, 0.09), rough=0.95)
    grass = principled("Path", (0.17, 0.27, 0.10), rough=0.9)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.03)); g = bpy.context.active_object; g.scale = (70, 70, 1)
    g.data.materials.append(grass)
    seqs = [("corn", "peanut", "sweetpotato"), ("mungbean", "corn", "peanut"),
            ("peanut", "sweetpotato", "corn"), ("sweetpotato", "corn", "mungbean")]
    spacing = {"corn": (0.75, 0.32), "mungbean": (0.5, 0.3), "peanut": (0.45, 0.25), "sweetpotato": (0.8, 0.45)}
    PW, PL = 9.0, 34.0
    season = 1.42  # seconds per season
    for i, seq in enumerate(seqs):
        x = -1.5 * (PW + 2) + i * (PW + 2)
        bpy.ops.mesh.primitive_plane_add(size=1, location=(x, 0, 0.06))
        p = bpy.context.active_object; p.scale = (PW, PL, 1); p.data.materials.append(soil)
        for s, crop in enumerate(seq):
            host = bpy.data.objects.new(f"P{i}S{s}", bpy.data.meshes.new(f"p{i}{s}")); sc.collection.objects.link(host)
            host.location = (x, 0, 0.06)
            t0 = 0.05 + s * season
            grow = [(1, 0.0), (sec(t0), 0.0), (sec(t0 + season * 0.62), 1.0)]
            if s < len(seq) - 1:
                grow += [(sec(t0 + season * 0.86), 1.0), (sec(t0 + season * 0.98), 0.0)]
            gn_instancer(f"P{i}S{s}", host, lib[crop], (PW - 0.6, PL - 0.6), spacing[crop], jitter=0.06, wind=0.06, grow=grow)
    cam, tgt = camera_rig(lens=30)
    fly(cam, tgt, [(0.0, (-30, -36, 15), (-6, 0, 0)), (4.4, (24, -30, 12), (8, 6, 0))])
    return sc

def scene_brand(frames):
    sc = setup_render(frames)
    sky_world((0.035, 0.09, 0.06), (0.01, 0.025, 0.018), (0.01, 0.02, 0.015), (0, 0, 1), (1, 1, 1), 0.0, 1.0)
    cd = bpy.data.cameras.new("Cam"); cd.type = "ORTHO"; cd.ortho_scale = 16
    cam = bpy.data.objects.new("Cam", cd); sc.collection.objects.link(cam); cam.location = (0, 0, 20); sc.camera = cam
    # vignette backdrop: radial gradient
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -2))
    bd = bpy.context.active_object
    m, nb = new_mat("Backdrop"); out = nb.add("ShaderNodeOutputMaterial")
    tc = nb.add("ShaderNodeTexCoord"); grad = nb.add("ShaderNodeTexGradient", gradient_type="SPHERICAL")
    v = nb.vmath("SUBTRACT", tc.outputs["Generated"], (0.5, 0.5, 0.5)); v2 = nb.vmath("MULTIPLY", v, (2.4, 2.4, 1))
    nb.link(v2, grad.inputs["Vector"])
    c = nb.ramp(grad.outputs["Fac"], [(0.0, (0.004, 0.010, 0.007)), (0.8, (0.016, 0.048, 0.030))])
    em = nb.add("ShaderNodeEmission", in_Strength=1.0); nb.link(c, em.inputs["Color"]); nb.link(em.outputs[0], out.inputs["Surface"])
    bd.data.materials.append(m)
    def glow_plane(name, size, color, keys, z=0.0, power=2.0, image=None):
        bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
        ob = bpy.context.active_object; ob.name = name
        mm, n2 = new_mat(name)
        try:
            mm.surface_render_method = "BLENDED"
        except Exception:
            pass
        o = n2.add("ShaderNodeOutputMaterial"); t = n2.add("ShaderNodeTexCoord")
        if image:
            it = n2.add("ShaderNodeTexImage"); it.image = bpy.data.images.load(image); it.interpolation = "Cubic"
            n2.link(t.outputs["UV"], it.inputs["Vector"])
            alpha = it.outputs["Alpha"]; colr = it.outputs["Color"]
        else:
            g = n2.add("ShaderNodeTexGradient", gradient_type="SPHERICAL")
            vv = n2.vmath("MULTIPLY", n2.vmath("SUBTRACT", t.outputs["Generated"], (0.5, 0.5, 0.5)), (2, 2, 1))
            n2.link(vv, g.inputs["Vector"])
            alpha = n2.math("POWER", g.outputs["Fac"], power); colr = (*color, 1)
        fv = n2.add("ShaderNodeValue")
        for f, val in keys:
            fv.outputs[0].default_value = val; fv.outputs[0].keyframe_insert("default_value", frame=f)
        a = n2.math("MULTIPLY", alpha, fv.outputs[0])
        e = n2.add("ShaderNodeEmission", in_Strength=1.0)
        if hasattr(colr, "is_output"):
            n2.link(colr, e.inputs["Color"])
        else:
            e.inputs["Color"].default_value = colr
        tr = n2.add("ShaderNodeBsdfTransparent"); mx = n2.add("ShaderNodeMixShader")
        n2.link(n2.math("MINIMUM", a, 1.0), mx.inputs[0]); n2.link(tr.outputs[0], mx.inputs[1]); n2.link(e.outputs[0], mx.inputs[2])
        n2.link(mx.outputs[0], o.inputs["Surface"])
        ob.data.materials.append(mm)
        return ob, n2, e
    # point of light, its halo, an expanding ring, then the mark
    dot, _, _ = glow_plane("Dot", 0.5, (1, 1, 0.97), [(1, 0), (sec(0.15), 0), (sec(0.45), 1.0), (sec(1.3), 1.0), (sec(1.8), 0.0)], z=0.3, power=6)
    halo, _, _ = glow_plane("Halo", 6, (0.75, 0.95, 0.80), [(1, 0), (sec(0.3), 0), (sec(0.7), 0.55), (sec(1.6), 0.18), (sec(3.9), 0.22)], z=0.1, power=3)
    for f, s in ((1, 0.2), (sec(0.45), 1.0), (sec(1.3), 1.6)):
        dot.scale = (s, s, 1); dot.keyframe_insert("scale", frame=f)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.012, major_segments=128, minor_segments=8, location=(0, 0, 0.2))
    ring = bpy.context.active_object
    rm, rnb = new_mat("Ring")
    try:
        rm.surface_render_method = "BLENDED"
    except Exception:
        pass
    ro = rnb.add("ShaderNodeOutputMaterial"); re = rnb.add("ShaderNodeEmission", in_Strength=3.0)
    re.inputs["Color"].default_value = (0.92, 0.98, 0.92, 1)
    rv = rnb.add("ShaderNodeValue")
    for f, val in ((1, 0), (sec(0.45), 0), (sec(0.7), 1), (sec(1.7), 0)):
        rv.outputs[0].default_value = val; rv.outputs[0].keyframe_insert("default_value", frame=f)
    rt = rnb.add("ShaderNodeBsdfTransparent"); rmx = rnb.add("ShaderNodeMixShader")
    rnb.link(rv.outputs[0], rmx.inputs[0]); rnb.link(rt.outputs[0], rmx.inputs[1]); rnb.link(re.outputs[0], rmx.inputs[2])
    rnb.link(rmx.outputs[0], ro.inputs["Surface"]); ring.data.materials.append(rm)
    for f, s in ((1, 0.05), (sec(0.45), 0.05), (sec(1.7), 4.2)):
        ring.scale = (s, s, 1); ring.keyframe_insert("scale", frame=f)
    ease_all(ring, easing="EASE_OUT")
    logo_png = os.path.join(HERE, "logo-mark.png")
    asp = 1215 / 862
    mark, mnb, memit = glow_plane("Mark", 1, (1, 1, 1), [(1, 0), (sec(0.95), 0), (sec(1.6), 1.0)], z=0.4, image=logo_png)
    mark.scale = (4.2 * asp, 4.2, 1); mark.location.y = 1.2
    for f, s in ((sec(0.95), 0.92), (sec(1.9), 1.0)):
        mark.scale = (4.2 * asp * s, 4.2 * s, 1); mark.keyframe_insert("scale", frame=f)
    ease_all(mark, easing="EASE_OUT")
    # light sweep across the mark
    t = mnb.add("ShaderNodeTexCoord"); sx = mnb.add("ShaderNodeSeparateXYZ"); mnb.link(t.outputs["UV"], sx.inputs[0])
    sw = mnb.add("ShaderNodeValue")
    for f, val in ((1, -0.4), (sec(2.15), -0.4), (sec(2.95), 1.4)):
        sw.outputs[0].default_value = val; sw.outputs[0].keyframe_insert("default_value", frame=f)
    diag = mnb.math("ADD", sx.outputs["X"], mnb.math("MULTIPLY", sx.outputs["Y"], 0.35))
    band = mnb.math("POWER", mnb.math("SUBTRACT", 1.0, mnb.math("MULTIPLY", mnb.math("ABSOLUTE", mnb.math("SUBTRACT", diag, sw.outputs[0])), 6.0), clamp=True), 2.0)
    mnb.link(mnb.math("ADD", 1.0, mnb.math("MULTIPLY", band, 2.2)), memit.inputs["Strength"])
    return sc

# ------------------------------------------------------------------- main

if __name__ == "__main__":
    reset()
    os.makedirs(OUT, exist_ok=True)
    if SCENE == "landscape":
        frames = (1, 309)
        build = lambda fr: scene_landscape(fr)
    elif SCENE == "golden":
        frames = (1, 147)
        build = lambda fr: scene_landscape(fr, golden=True)
    elif SCENE == "lfm":
        frames = (1, 177); build = scene_lfm
    elif SCENE == "rotation":
        frames = (1, 132); build = scene_rotation
    elif SCENE == "brand":
        frames = (1, 117); build = scene_brand
    else:
        raise SystemExit("unknown scene " + SCENE)
    if len(NUMS) >= 2:
        frames = (int(NUMS[0]), int(NUMS[1]))
    sc = build(frames)
    sc.frame_start, sc.frame_end = frames
    if "--save" in ARGS:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, SCENE + ".blend"))
    bpy.ops.render.render(animation=True)
