import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  batteryFrontTexture, batterySideTexture, brushedTexture, chipTexture, pcbTexture, rubberPadTexture,
} from "./stationTextures";

/**
 * Exploded view of the TERRA station (public/models/terra-station.glb).
 *
 * The layout follows the product's exploded-view render: the GNSS dome, mast, solar cap and
 * skirt ring stack upward; the side plates (with dark inner liners) fly out left and right;
 * the camera module sits beside the core; the battery packs and wiring hang between the core
 * and the base; the legs spread out around the base with their assembly pins.
 *
 * The GLB only has the outer shell, so the internal parts of that render (circuit boards,
 * batteries, wiring, camera housing, liners, access covers and pins) are built here. They sit
 * inside the closed device and only appear while it is exploded.
 *
 * All positions are in the station root's local units (the device is ~5.8 units tall).
 */

/** Screen-aligned axes of the reference view, in the root's local space. */
const R = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2); // to the viewer's right
const T = new THREE.Vector3(-Math.SQRT1_2, 0, Math.SQRT1_2); // toward the viewer
/** Camera direction of the reference view: about 25° above the horizon. */
export const EXPLODE_VIEW_LOCAL = new THREE.Vector3(-0.64, 0.42, 0.64).normalize();

type Part = {
  objects: THREE.Object3D[];
  offset: THREE.Vector3;
  order: number;
  /** Only shown while exploded (internal parts hidden inside the closed device). */
  inside?: boolean;
};

const frame = (r: number, u: number, t: number) => R.clone().multiplyScalar(r).add(new THREE.Vector3(0, u, 0)).add(T.clone().multiplyScalar(t));
const toFrame = (v: THREE.Vector3) => ({ r: v.dot(R), t: v.dot(T) });

const STAGGER = 0.06;
const MAX_ORDER = 7;
const SPAN = 1 - MAX_ORDER * STAGGER;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function boxOf(objects: THREE.Object3D[]) {
  const box = new THREE.Box3();
  for (const o of objects) {
    o.updateMatrix();
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      // matrix from this mesh up to `o`'s parent (the station root)
      const mx = new THREE.Matrix4();
      for (let n: THREE.Object3D | null = c; n && n !== o.parent; n = n.parent) { n.updateMatrix(); mx.premultiply(n.matrix); }
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(mx));
    });
  }
  return box;
}

/* ------------------------------------------------------------- built parts */

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
let mat: ReturnType<typeof makeMaterials>;
function makeMaterials() {
  const brushed = brushedTexture(176);
  const brushedDark = brushedTexture(92);
  const pad = rubberPadTexture();
  return {
    chip: std({ color: 0x16191b, roughness: 0.45 }),
    gold: std({ color: 0xd4ae55, roughness: 0.28, metalness: 0.95 }),
    silver: std({ color: 0xcfd3d7, roughness: 0.26, metalness: 0.9 }),
    tin: std({ color: 0xb9bec3, roughness: 0.35, metalness: 0.85 }),
    capBody: std({ color: 0x23272b, roughness: 0.5 }),
    connector: std({ color: 0xf1efe8, roughness: 0.55 }),
    batteryTop: std({ color: 0x1d2228, roughness: 0.6 }),
    terminalRed: std({ color: 0xb53a2f, roughness: 0.45 }),
    rubber: std({ color: 0x18191b, roughness: 0.92 }),
    liner: std({ color: 0x1c1d20, roughness: 0.78, metalness: 0.05 }),
    linerPad: std({ map: pad, bumpMap: pad, bumpScale: 2.5, roughness: 0.85 }),
    brushed: std({ map: brushed, roughnessMap: brushed, roughness: 0.55, metalness: 0.85, color: 0xffffff }),
    brushedDark: std({ map: brushedDark, roughnessMap: brushedDark, roughness: 0.6, metalness: 0.85, color: 0xffffff }),
    dome: std({ color: 0xe1e5e8, roughness: 0.14, metalness: 0.75 }),
    housing: std({ color: 0xeeeeea, roughness: 0.42 }),
    seam: std({ color: 0xa9aca8, roughness: 0.5 }),
    wireRed: std({ color: 0xc23b2e, roughness: 0.38, transparent: true }),
    wireBlack: std({ color: 0x17181a, roughness: 0.38, transparent: true }),
    tie: std({ color: 0x0e0f10, roughness: 0.6, transparent: true }),
    dash: new THREE.LineDashedMaterial({ color: 0x8e9892, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0 }),
  };
}

function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}
function rbox(w: number, h: number, d: number, radius: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), m);
  mesh.position.set(x, y, z);
  return mesh;
}

const CHIP_NAMES = ["ESP32-S3", "STM32L476", "SX1262", "BH1750", "SHT35"];

/** A circuit board facing +Z: textured solder mask, labelled ICs with legs, capacitors, a header and a connector. */
function pcb(w: number, h: number, seed = 1) {
  const g = new THREE.Group();
  const board = std({ map: pcbTexture(seed, w / h), roughness: 0.48, metalness: 0.15 });
  const edge = std({ color: 0x15502b, roughness: 0.6 });
  g.add(box(w, h, 0.03, [edge, edge, edge, edge, board, edge]));
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };

  // ICs with gull-wing legs
  const ics = Math.max(1, Math.round((w * h) / 0.35));
  for (let i = 0; i < ics; i++) {
    const s = Math.min(w, h) * (0.22 + rnd() * 0.12);
    const x = (rnd() - 0.5) * (w - s - 0.12), y = (rnd() - 0.5) * (h - s - 0.2);
    const top = std({ map: chipTexture(CHIP_NAMES[(seed + i) % CHIP_NAMES.length]), roughness: 0.4 });
    g.add(box(s, s, 0.04, [mat.chip, mat.chip, mat.chip, mat.chip, top, mat.chip], x, y, 0.035));
    const legs = Math.max(4, Math.floor(s / 0.035));
    for (let k = 0; k < legs; k++) {
      const o = -s / 2 + (k + 0.5) * (s / legs);
      g.add(box(0.012, 0.03, 0.012, mat.tin, x + o, y + s / 2 + 0.012, 0.022), box(0.012, 0.03, 0.012, mat.tin, x + o, y - s / 2 - 0.012, 0.022));
      g.add(box(0.03, 0.012, 0.012, mat.tin, x + s / 2 + 0.012, y + o, 0.022), box(0.03, 0.012, 0.012, mat.tin, x - s / 2 - 0.012, y + o, 0.022));
    }
  }
  // Electrolytic capacitors
  for (let i = 0; i < Math.max(1, Math.round(w * 2)); i++) {
    const cx = (rnd() - 0.5) * (w - 0.12), cy = (rnd() - 0.5) * (h - 0.12), rr = 0.035 + rnd() * 0.02, hh = 0.08 + rnd() * 0.06;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, hh, 18).rotateX(Math.PI / 2).translate(cx, cy, 0.015 + hh / 2), mat.capBody));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.92, rr * 0.92, 0.006, 18).rotateX(Math.PI / 2).translate(cx, cy, 0.016 + hh), mat.tin));
  }
  // SMD passives
  for (let i = 0; i < Math.round(w * h * 30); i++) {
    g.add(box(0.03, 0.016, 0.012, rnd() > 0.5 ? mat.chip : std({ color: 0x8a7a5c, roughness: 0.5 }), (rnd() - 0.5) * (w - 0.08), (rnd() - 0.5) * (h - 0.08), 0.021));
  }
  // Pin header and a white connector
  const pins = Math.max(3, Math.floor((w - 0.2) / 0.05));
  g.add(box(pins * 0.05, 0.05, 0.03, mat.chip, 0, h / 2 - 0.06, 0.03));
  for (let i = 0; i < pins; i++) g.add(box(0.014, 0.014, 0.09, mat.gold, -((pins - 1) * 0.05) / 2 + i * 0.05, h / 2 - 0.06, 0.07));
  g.add(rbox(0.16, 0.08, 0.06, 0.01, mat.connector, -w / 2 + 0.14, -h / 2 + 0.08, 0.045));
  return g;
}

function batteryPack() {
  const g = new THREE.Group();
  const side = std({ map: batterySideTexture(), roughness: 0.52 });
  const front = std({ map: batteryFrontTexture(), roughness: 0.5 });
  g.add(rbox(0.5, 0.6, 0.4, 0.035, [side, side, mat.batteryTop, side, front, side]));
  g.add(rbox(0.5, 0.06, 0.4, 0.02, mat.batteryTop, 0, 0.31, 0));
  for (const [x, m] of [[-0.14, mat.terminalRed], [0.14, mat.chip]] as const) {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 18).translate(x, 0.36, 0), m));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12).translate(x, 0.4, 0), mat.tin));
  }
  return g;
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
const slab = (w: number, h: number, r: number, depth: number, bevel = 0.012) =>
  new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 8 });

/** Brushed-aluminium access cover on a darker frame, with four screws; faces +Z. */
function accessCover(w: number, h: number) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(slab(w, h, 0.08, 0.03), mat.brushedDark));
  const face = new THREE.Mesh(slab(w - 0.1, h - 0.1, 0.05, 0.03, 0.008), mat.brushed);
  face.position.z = 0.03;
  g.add(face);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 14).rotateX(Math.PI / 2).translate(sx * (w / 2 - 0.09), sy * (h / 2 - 0.09), 0.075), mat.silver));
  }
  return g;
}

/** Rubber gasket that seals an access cover, facing +Z. */
function gasket(w: number, h: number) {
  const shape = roundedRect(w, h, 0.09);
  shape.holes.push(roundedRect(w - 0.12, h - 0.12, 0.05) as unknown as THREE.Path);
  return new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }), mat.rubber);
}

/** Dark moulded inner liner of a side plate: bevelled panel, raised textured pad, fixing bosses; faces +Z. */
function linerPanel(w: number, h: number) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(slab(w, h, 0.1, 0.05, 0.018), mat.liner));
  const padGeo = slab(w * 0.72, h * 0.62, 0.06, 0.02, 0.01);
  const uv = padGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 2.2);
  const p = new THREE.Mesh(padGeo, mat.linerPad);
  p.position.z = 0.05;
  g.add(p);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 16).rotateX(Math.PI / 2).translate(sx * (w / 2 - 0.12), sy * (h / 2 - 0.12), 0.07), mat.liner));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.052, 10).rotateX(Math.PI / 2).translate(sx * (w / 2 - 0.12), sy * (h / 2 - 0.12), 0.075), mat.chip));
  }
  return g;
}

function pin() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 12).translate(0, -0.425, 0), mat.silver));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.08, 6).translate(0, 0.04, 0), mat.chip));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 12).rotateX(Math.PI).translate(0, -0.895, 0), mat.silver));
  for (let i = 0; i < 6; i++) g.add(new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.006, 6, 14).rotateX(Math.PI / 2).translate(0, -0.55 - i * 0.04, 0), mat.tin));
  return g;
}

/** Turn a +Z-facing object so it faces `dir` (horizontal). */
function face(o: THREE.Object3D, dir: THREE.Vector3) {
  o.rotation.y = Math.atan2(dir.x, dir.z);
  return o;
}

function tube(points: THREE.Vector3[], m: THREE.Material, radius = 0.028) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, radius, 10), m);
}

/* ------------------------------------------------------------------- build */

export type Explode = {
  /** Move toward exploded (true) or assembled (false). */
  setTarget: (exploded: boolean) => void;
  /** Advance the animation; returns true while moving. */
  update: (dt: number) => boolean;
  /** Jump straight to a state (reduced motion). */
  snap: (exploded: boolean) => void;
  /** World-space box of the fully exploded station. */
  explodedBox: () => THREE.Box3;
  /** World direction to look from in the exploded view. */
  viewDirection: () => THREE.Vector3;
  dispose: () => void;
};

export function createExplode(scene: THREE.Object3D): Explode | null {
  const root = scene.getObjectByName("TERRA_Station");
  if (!root) return null;

  const materials = new Map<string, THREE.Material>();
  const byPrefix = (re: RegExp) => root.children.filter((c) => re.test(c.name));
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m && !Array.isArray(m)) materials.set(m.name, m);
  });
  mat ??= makeMaterials();
  const black = materials.get("Core_Black") ?? mat.chip;

  const parts: Part[] = [];
  const built: THREE.Object3D[] = [];
  const add = (o: THREE.Object3D) => { root.add(o); built.push(o); return o; };
  const centreFrame = (objects: THREE.Object3D[]) => {
    const c = boxOf(objects).getCenter(new THREE.Vector3());
    return { c, ...toFrame(c) };
  };
  /** Offset that moves a group's centre to an absolute place in the reference frame. */
  const toTarget = (objects: THREE.Object3D[], r: number, y: number, t: number) => {
    const { c, r: r0, t: t0 } = centreFrame(objects);
    return frame(r - r0, y - c.y, t - t0);
  };
  const lift = (u: number) => new THREE.Vector3(0, u, 0);

  /* Vertical stack */
  parts.push({ objects: byPrefix(/^(GNSS_Dome|Dome_Underside)/), offset: lift(2.45), order: 0 });
  parts.push({ objects: byPrefix(/^Mast_/), offset: lift(2.3), order: 0 });
  parts.push({ objects: byPrefix(/^(Solar_|Rim|Plateau|Antenna_)/), offset: lift(2.0), order: 1 });
  parts.push({ objects: byPrefix(/^(Skirt|Collar)/), offset: lift(1.6), order: 2 });
  const core = byPrefix(/^(Body_Core|Top_Band|Rail|Channel_Fill|LED_|Vent_Housing|Vent_Slot)/);
  const coreLift = lift(1.4);
  parts.push({ objects: core, offset: coreLift, order: 3 });

  /* Light sensor dome on the solar cap (BH1750 pyranometer) */
  const sensor = new THREE.Group();
  sensor.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.dome));
  sensor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.05, 24).translate(0, -0.02, 0), black));
  sensor.position.copy(frame(-0.42, 0, 0)).setY(5.25);
  add(sensor);
  parts.push({ objects: [sensor], offset: toTarget([sensor], 1.7, 6.55, 0.15), order: 1 });

  /* Side plates, each with its screws, and dark inner liners */
  const plate = (name: string, screws: RegExp | null) => [...byPrefix(new RegExp(`^${name}$`)), ...(screws ? byPrefix(screws) : [])];
  const liner = (src: THREE.Object3D, shrinkY: number) => {
    const b = boxOf([src]);
    const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const outward = new THREE.Vector3(c.x, 0, c.z).normalize();
    const width = Math.abs(outward.x) > 0.5 ? size.z : size.x;
    const panel = linerPanel(width * 0.86, size.y * shrinkY);
    face(panel, outward);
    panel.position.copy(c).sub(outward.clone().multiplyScalar(0.12));
    return add(panel);
  };
  const left = plate("Plate_Left", /^(Screw_180|Screw_top_180)$/);
  const front = plate("Plate_Front", null);
  const right = plate("Plate_Right", /^(Screw_0|Screw_top_0)$/);
  const back = plate("Plate_Back", null);
  parts.push({ objects: left, offset: toTarget(left, -2.85, 4.55, 0.3), order: 3 });
  parts.push({ objects: front, offset: toTarget(front, 2.7, 4.85, 0), order: 3 });
  parts.push({ objects: right, offset: toTarget(right, 0.25, 4.45, -2.5), order: 3 });
  parts.push({ objects: back, offset: toTarget(back, -0.25, 4.45, -2.5), order: 3 });
  if (left[0]) { const l = liner(left[0], 0.78); parts.push({ objects: [l], offset: toTarget([l], -1.9, 4.85, 0.25), order: 4, inside: true }); }
  if (front[0]) { const l = liner(front[0], 0.62); parts.push({ objects: [l], offset: toTarget([l], 2.15, 5.05, 0.25), order: 4, inside: true }); }

  /* Camera module: bezel and lenses, with a housing and board behind them */
  const camera = byPrefix(/^(Camera_|Lens_)/);
  const camOffset = toTarget(camera, 1.55, 4.25, 0.65);
  parts.push({ objects: camera, offset: camOffset, order: 4 });
  const camC = boxOf(camera).getCenter(new THREE.Vector3());
  const housing = add(rbox(0.74, 1.3, 0.36, 0.06, mat.housing, camC.x, camC.y, camC.z - 0.21));
  const seam = add(rbox(0.75, 0.025, 0.37, 0.01, mat.seam, camC.x, camC.y - 0.42, camC.z - 0.21));
  const camBoard = add(pcb(0.6, 1.0, 4));
  camBoard.position.set(camC.x, camC.y - 0.05, camC.z - 0.42);
  parts.push({ objects: [housing, seam, camBoard], offset: camOffset.clone(), order: 4, inside: true });

  /* Circuit boards on the core, behind the plates */
  const boardFront = add(pcb(0.9, 1.45, 1));
  boardFront.position.set(0, 3.3, 0.83);
  const boardLeft = add(pcb(0.85, 1.25, 2));
  boardLeft.rotation.y = -Math.PI / 2;
  boardLeft.position.set(-0.83, 3.05, 0);
  const cage = new THREE.Group();
  for (const y of [1.95, 4.3]) cage.add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.045, 12, 64).rotateX(Math.PI / 2).translate(0, y, 0), mat.brushed));
  cage.add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 8, 64).rotateX(Math.PI / 2).translate(0, 3.12, 0), mat.brushedDark));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    cage.add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 2.35, 10).translate(Math.cos(a) * 0.9, 3.12, Math.sin(a) * 0.9), mat.brushedDark));
  }
  add(cage);
  parts.push({ objects: [boardFront, boardLeft, cage], offset: coreLift.clone(), order: 3, inside: true });

  /* Small sensor boards under the camera */
  const small1 = add(pcb(0.36, 0.26, 7)); small1.position.set(0.2, 2.4, 0.3);
  const small2 = add(pcb(0.3, 0.22, 9)); small2.position.set(0.35, 2.2, 0.1);
  face(small1, T); face(small2, T);
  parts.push({ objects: [small1], offset: toTarget([small1], 1.45, 2.65, 0.7), order: 5, inside: true });
  parts.push({ objects: [small2], offset: toTarget([small2], 1.78, 2.42, 0.55), order: 5, inside: true });

  /* Battery packs between the core and the base */
  const packs = [batteryPack(), batteryPack()];
  packs.forEach((p, i) => {
    face(p, T);
    p.position.copy(frame(-0.27 + i * 0.54, 0, 0)).setY(2.45);
    add(p);
  });
  const batteryOffset = toTarget(packs, -0.6, 2.8, 0.75);
  parts.push({ objects: packs, offset: batteryOffset, order: 5, inside: true });

  /* Base access covers and a gasket */
  const coverL = add(face(accessCover(0.95, 0.85), frame(-0.35, 0, 0.94).normalize()));
  coverL.position.copy(frame(-0.3, 0, 0.2)).setY(1.15);
  const gasketL = add(face(gasket(0.72, 0.78), frame(-0.35, 0, 0.94).normalize()));
  gasketL.position.copy(frame(-0.3, 0, 0.1)).setY(1.15);
  const coverR = add(face(accessCover(0.85, 0.72), frame(0.4, 0, 0.92).normalize()));
  coverR.position.copy(frame(0.3, 0, 0.2)).setY(1.15);
  parts.push({ objects: [coverL], offset: toTarget([coverL], -2.8, 2.3, 0.25), order: 6, inside: true });
  parts.push({ objects: [gasketL], offset: toTarget([gasketL], -2.0, 2.45, 0.3), order: 6, inside: true });
  parts.push({ objects: [coverR], offset: toTarget([coverR], 2.6, 2.75, 0.15), order: 6, inside: true });

  /* Radial vent grille on top of the base, revealed when the core lifts */
  const grille = new THREE.Group();
  grille.add(new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.03, 48), mat.chip));
  grille.add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 10, 64).rotateX(Math.PI / 2), mat.brushed));
  grille.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 32), mat.brushedDark));
  for (let i = 0; i < 28; i++) {
    const slat = box(0.66, 0.035, 0.035, mat.brushedDark, 0.62, 0.03, 0);
    const holder = new THREE.Group();
    holder.rotation.y = (i / 28) * Math.PI * 2;
    slat.rotation.x = 0.5;
    holder.add(slat);
    grille.add(holder);
  }
  grille.position.y = 1.9;
  add(grille);
  parts.push({ objects: [grille], offset: new THREE.Vector3(), order: 3, inside: true });

  /* Bumpers, legs and assembly pins spread out around the base */
  const radial = (objects: THREE.Object3D[]) => { const c = boxOf(objects).getCenter(new THREE.Vector3()); return new THREE.Vector3(c.x, 0, c.z).normalize(); };
  byPrefix(/^Bumper_/).forEach((b) => parts.push({ objects: [b], offset: radial([b]).multiplyScalar(0.85).add(lift(-0.05)), order: 7 }));
  for (let i = 0; i < 4; i++) {
    const leg = byPrefix(new RegExp(`^Leg${i}_`));
    if (!leg.length) continue;
    const dir = radial(leg);
    parts.push({ objects: leg, offset: dir.clone().multiplyScalar(0.9).add(lift(-0.05)), order: 7 });
    const hip = boxOf(byPrefix(new RegExp(`^Leg${i}_Hip$`))).getCenter(new THREE.Vector3());
    const p = add(pin());
    p.position.copy(hip).sub(dir.clone().multiplyScalar(0.25));
    p.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().multiplyScalar(0.85).add(lift(-0.5)).normalize());
    parts.push({ objects: [p], offset: dir.clone().multiplyScalar(0.45).add(lift(-0.2)), order: 7, inside: true });
  }

  /* Wiring from the battery packs and camera into the core (drawn in the exploded layout) */
  const batteryBox = boxOf(packs).translate(batteryOffset);
  const coreBottom = boxOf(core).translate(coreLift).min.y;
  const wires: THREE.Object3D[] = [];
  const coreEntry = (r: number, t: number) => frame(r, 0, t).setY(coreBottom + 0.02);
  const bundle = (from: THREE.Vector3, to: THREE.Vector3, sag: THREE.Vector3, colours: THREE.Material[]) => {
    const across = frame(1, 0, 0).multiplyScalar(0.06);
    colours.forEach((m, k) => {
      const o = across.clone().multiplyScalar(k - (colours.length - 1) / 2);
      const pts = [0, 0.25, 0.5, 0.75, 1].map((f) => from.clone().lerp(to, f).add(o).addScaledVector(sag, Math.sin(Math.PI * f) * (1 + k * 0.12)));
      wires.push(tube(pts, m, 0.026));
    });
    // zip tie around the bundle
    const mid = from.clone().lerp(to, 0.5).add(sag);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 20), mat.tie);
    tie.position.copy(mid);
    tie.lookAt(mid.clone().add(to.clone().sub(from)));
    wires.push(tie);
  };
  packs.forEach((_, i) => {
    const top = frame(-0.6 - 0.27 + i * 0.54, 0, 0.75).setY(batteryBox.max.y + 0.06);
    bundle(top, coreEntry(-0.2 + i * 0.3, 0.6), frame(0.15 + i * 0.1, 0.18, 0.2), [mat.wireRed, mat.wireBlack]);
  });
  const camBox = boxOf(camera).translate(camOffset);
  const camBack = camBox.getCenter(new THREE.Vector3()).add(frame(-0.42, -0.5, -0.25));
  const coreSide = frame(0.62, 0, 0.45).setY(coreBottom + 0.55);
  bundle(camBack, coreSide, frame(0, -0.3, 0.1), [mat.wireRed, mat.wireBlack, mat.wireRed]);
  bundle(camBack.clone().add(lift(-0.25)), coreEntry(0.45, 0.4), frame(-0.1, -0.35, 0.15), [mat.wireBlack, mat.wireRed]);
  wires.forEach(add);

  /* Dashed guide lines dropping from the side parts to the base, as in technical exploded views */
  const guides: THREE.Line[] = [];
  const guide = (objects: THREE.Object3D[], offset: THREE.Vector3, topPad = 0.3) => {
    const b = boxOf(objects).translate(offset);
    const c = b.getCenter(new THREE.Vector3());
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.x, b.max.y + topPad, c.z), new THREE.Vector3(c.x, 1.0, c.z)]);
    const line = new THREE.Line(g, mat.dash);
    line.computeLineDistances();
    guides.push(line);
    add(line);
  };
  const partOf = (o: THREE.Object3D) => parts.find((p) => p.objects.includes(o))!;
  if (left[0]) guide(left, partOf(left[0]).offset);
  if (front[0]) guide(front, partOf(front[0]).offset);
  guide(camera, camOffset, 0.2);
  guide([coverL], partOf(coverL).offset, 0.2);
  guide([coverR], partOf(coverR).offset, 0.2);

  /* Remember resting positions */
  const rest = new Map<THREE.Object3D, THREE.Vector3>();
  parts.forEach((p) => p.objects.forEach((o) => rest.set(o, o.position.clone())));

  let t = 0; // global progress 0..1
  let target = 0;
  const DURATION = 1.7; // seconds for the whole sequence
  // Built-part materials are shared module-wide and reused if the viewer mounts again.

  const apply = () => {
    parts.forEach((p) => {
      const k = ease(clamp01((t - p.order * STAGGER) / SPAN));
      p.objects.forEach((o) => {
        o.position.copy(rest.get(o)!).addScaledVector(p.offset, k);
        if (p.inside) o.visible = k > 0.002;
      });
    });
    const late = clamp01((t - 0.72) / 0.28);
    mat.wireRed.opacity = mat.wireBlack.opacity = mat.tie.opacity = late;
    wires.forEach((w) => { w.visible = late > 0.01; });
    mat.dash.opacity = late * 0.75;
    guides.forEach((g) => { g.visible = late > 0.01; });
  };
  apply();

  return {
    setTarget: (exploded) => { target = exploded ? 1 : 0; },
    snap: (exploded) => { t = target = exploded ? 1 : 0; apply(); },
    update: (dt) => {
      if (t === target) return false;
      const step = dt / DURATION;
      t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
      apply();
      return true;
    },
    explodedBox: () => {
      const saved = t;
      t = 1; apply();
      scene.updateMatrixWorld(true);
      const b = new THREE.Box3();
      root.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) b.expandByObject(o); });
      t = saved; apply();
      scene.updateMatrixWorld(true);
      return b;
    },
    viewDirection: () => EXPLODE_VIEW_LOCAL.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize(),
    dispose: () => {
      built.forEach((o) => o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh || (c as THREE.Line).isLine) (m.geometry as THREE.BufferGeometry).dispose(); }));
    },
  };
}
