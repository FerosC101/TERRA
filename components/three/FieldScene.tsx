"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SourceTag } from "@/components/ui";
import { CROP_SHAPE, LAYOUT, RAIN_DAY_MM, canopyHeight, type SceneCallout } from "@/features/living-field-model/sceneCallouts";
import type { FieldSceneState } from "@/features/living-field-model/simulation";
import { createRng } from "@/lib/rng";
import { moistureColor } from "@/lib/mapColors";
import type { CropId, DimensionKey } from "@/types";

/**
 * Illustrative field scene: the plot in open farmland that runs to the horizon, its
 * front edge cut away to show the soil profile. The camera is locked to one framed
 * shot per tab and glides between them; every visual quantity eases toward the
 * current data, so date and scenario changes animate. Readouts pop up as cards
 * pinned to the scene.
 */

interface Shot { target: [number, number, number]; az: number; el: number; radius: number }
const SHOTS: Record<DimensionKey, Shot> = {
  water: { target: [0.2, -0.25, 1.0], az: 22, el: 19, radius: 2.9 },
  soil: { target: [LAYOUT.station.x + 0.8, -0.45, LAYOUT.plot.front], az: 10, el: 6, radius: 1.3 },
  vegetation: { target: [0.6, 0.6, -0.6], az: 26, el: 17, radius: 2.4 },
  climate: { target: [-0.5, 2, -3], az: 18, el: 7, radius: 4.4 },
  rotation: { target: [0, 0, -1.6], az: 0, el: 52, radius: 4.4 },
};
const FOV = 38;
/** Room kept free for the controls floating over the scene (only when it shows them) */
const INSET_ALL = { top: 64, bottom: 72, side: 10 };
const INSET_BARE = { top: 10, bottom: 10, side: 10 };
/** How far the land and the cut face run before the haze */
const REACH = 70;
/** Depth of the cut face below the root zone, so the view never shows its underside */
const BEDROCK = 7;

const C = {
  topDry: new T.Color("#a07f57"), topWet: new T.Color("#4a3826"),
  subDry: new T.Color("#b8946a"), subWet: new T.Color("#5e4733"),
  deep: new T.Color("#8f7a62"),
  grass: new T.Color("#86a65c"),
  waterTint: new T.Color("#4a95d6"),
  leafGood: new T.Color("#3f8f4a"), leafWeak: new T.Color("#b49b4c"), leafUnknown: new T.Color("#7f895b"),
  skyTop: new T.Color("#cfe2ea"), skyBottom: new T.Color("#eef2ee"),
  sunTop: new T.Color("#6fb0e3"), sunBottom: new T.Color("#e4eef0"),
  rainTop: new T.Color("#6f7d8a"), rainBottom: new T.Color("#c3cbd0"),
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function shotPose(shot: Shot, aspect: number) {
  const v = (FOV * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  const dist = shot.radius / Math.sin(Math.min(v, h) / 2);
  const az = (shot.az * Math.PI) / 180, el = (shot.el * Math.PI) / 180;
  const target = new T.Vector3(...shot.target);
  const pos = target.clone().add(new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist));
  return { pos, target };
}

/** Near-white speckled texture, tinted by the material colour */
function speckleTexture(kind: "rows" | "strata" | "grass", seed: number, rows = 8) {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const rnd = createRng(seed);
  g.fillStyle = "#f2f2f2";
  g.fillRect(0, 0, size, size);
  if (kind === "strata") {
    for (let y = 0; y < size; y += 6) {
      g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.05})`;
      g.fillRect(0, y, size, 3 + rnd() * 5);
    }
  } else if (kind === "rows") {
    for (let r = 0; r < rows; r++) {
      const y = ((r + 0.5) / rows) * size;
      g.fillStyle = "rgba(0,0,0,0.10)";
      g.fillRect(0, y - size / rows / 4, size, size / rows / 2);
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.fillRect(0, y + size / rows / 4 + 2, size, 5);
    }
  }
  const dots = kind === "grass" ? 14000 : 9000;
  for (let i = 0; i < dots; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.05 + rnd() * 0.15})` : `rgba(255,255,255,${0.1 + rnd() * 0.25})`;
    const s = kind === "grass" ? 1 + rnd() * 1.6 : 1 + rnd() * 2.6;
    g.fillRect(rnd() * size, rnd() * size, s, kind === "grass" ? s * 2.2 : s);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,236,170,1)");
  grad.addColorStop(0.35, "rgba(255,214,120,0.45)");
  grad.addColorStop(1, "rgba(255,214,120,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(c);
}

/** A long leaf lying along +x, bent upward then drooping, tapering to a tip */
function ribbonLeaf(len: number, width: number, droop: number) {
  const geo = new T.PlaneGeometry(len, width, 10, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(len / 2, 0, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / len;
    p.setZ(i, p.getZ(i) * (Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)) * 0.9 + 0.1));
    p.setY(i, len * (0.45 * t - droop * t * t));
  }
  geo.computeVertexNormals();
  return geo;
}

/** A broad, slightly cupped leaf lying flat */
function broadLeaf(r: number) {
  const geo = new T.CircleGeometry(r, 16);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, (x * x + z * z) * 0.9);
  }
  geo.computeVertexNormals();
  return geo;
}

export default function FieldScene({ state, dim, callouts, tall = false, controls = false }: {
  state: FieldSceneState;
  dim: DimensionKey;
  callouts: SceneCallout[];
  tall?: boolean;
  /** Whether tabs and a timeline float over the scene, so cards keep clear of them */
  controls?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ state, dim, callouts, controls });
  const cards = useRef(new Map<string, HTMLDivElement>());
  const dots = useRef(new Map<string, HTMLSpanElement>());
  const lines = useRef(new Map<string, SVGLineElement>());
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    latest.current = { state, dim, callouts, controls };
  }, [state, dim, callouts, controls]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      queueMicrotask(() => setFallback(true));
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.className = "absolute inset-0 h-full w-full";
    canvas.setAttribute("aria-hidden", "true");
    el.prepend(canvas);

    const disposables: { dispose: () => void }[] = [];
    const keep = <D extends { dispose: () => void }>(d: D) => (disposables.push(d), d);
    const std = (color: string | T.Color, extra: T.MeshStandardMaterialParameters = {}) =>
      keep(new T.MeshStandardMaterial({ color, roughness: 0.9, ...extra }));
    const add = (geo: T.BufferGeometry, m: T.Material | T.Material[], parent: T.Object3D, x = 0, y = 0, z = 0, shadow = true) => {
      keep(geo);
      const o = new T.Mesh(geo, m);
      o.position.set(x, y, z);
      o.castShadow = shadow;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    };

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(FOV, 1, 0.05, 160);
    const fog = new T.Fog(C.skyBottom.clone(), 14, REACH);
    scene.fog = fog;

    // Sky dome (unaffected by fog), its horizon matching the haze
    const skyU = { top: { value: C.skyTop.clone() }, bottom: { value: C.skyBottom.clone() } };
    const sky = new T.Mesh(keep(new T.SphereGeometry(120, 32, 16)), keep(new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false, uniforms: skyU,
      vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 0.5, h)), 1.0); }",
    })));
    scene.add(sky);

    const hemi = new T.HemisphereLight(0xffffff, 0x6b5a48, 1.6);
    const sun = new T.DirectionalLight(0xfff1d6, 2.6);
    sun.position.set(-5, 9, 4);
    sun.target.position.set(0, 0, -1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
    sun.shadow.bias = -0.0005;
    scene.add(hemi, sun, sun.target);

    const { plot, soilDepth: H, topsoil: TS } = LAYOUT;
    const FRONT = plot.front;
    const PW = plot.x1 - plot.x0, PD = FRONT - plot.z0;
    const PCX = (plot.x0 + plot.x1) / 2, PCZ = (plot.z0 + FRONT) / 2;
    const rnd = createRng(42);

    // ── Land: grass to the horizon, neighbouring fields, a tree line
    const grassTex = keep(speckleTexture("grass", 3));
    grassTex.repeat.set(REACH, REACH / 2);
    const grassMat = std(C.grass.clone(), { map: grassTex });
    const ground = add(new T.PlaneGeometry(REACH * 2, REACH), grassMat, scene, 0, -0.004, FRONT - REACH / 2, false);
    ground.rotation.x = -Math.PI / 2;

    const rowTex = keep(speckleTexture("rows", 7, LAYOUT.crops.rows));
    const neighbours = ["#9bb463", "#c4b37a", "#7f9e50", "#b7a66c", "#a6bb6a", "#cdbd86", "#8aa957", "#bfa878"];
    let ni = 0;
    for (let gz = 0; gz < 4; gz++) {
      for (let gx = -3; gx <= 3; gx++) {
        if (gz === 0 && gx === 0) continue;
        const w = 7 + rnd() * 3, d = 5 + rnd() * 3;
        const x = gx * 11 + (rnd() - 0.5) * 2, z = FRONT - d / 2 - 0.4 - gz * 9.5 - (rnd() * 1.5);
        const tex = rowTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1, Math.round(d / 0.8) / LAYOUT.crops.rows);
        keep(tex);
        const patch = add(new T.PlaneGeometry(w, d), std(neighbours[ni++ % neighbours.length], { map: tex }), scene, x, -0.002, z, false);
        patch.rotation.x = -Math.PI / 2;
        if (gz === 0 && Math.abs(gx) === 1) patch.position.z = FRONT - d / 2; // reach the cut face beside the plot
      }
    }

    const TREES = 90;
    const trunks = new T.InstancedMesh(keep(new T.CylinderGeometry(0.06, 0.09, 1, 6)), std("#6b5340"), TREES);
    const crowns = new T.InstancedMesh(keep(new T.IcosahedronGeometry(1, 1)), std("#ffffff", { flatShading: true, roughness: 1 }), TREES);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sv = new T.Vector3(), pv = new T.Vector3();
    const treeGreens = ["#4f7d3f", "#5d8a46", "#3f6d38", "#6c9450"].map((c) => new T.Color(c));
    for (let i = 0; i < TREES; i++) {
      // a hedge line behind the fields, and scattered trees along the sides
      const back = i < 55;
      const x = back ? -REACH * 0.6 + rnd() * REACH * 1.2 : (rnd() < 0.5 ? -1 : 1) * (15 + rnd() * 24);
      const z = back ? FRONT - 30 - rnd() * 14 : FRONT - 8 - rnd() * 22;
      const h = 1.4 + rnd() * 1.6;
      trunks.setMatrixAt(i, m4.compose(pv.set(x, h * 0.3, z), q.identity(), sv.set(1, h * 0.6, 1)));
      const r = 0.7 + rnd() * 0.8;
      crowns.setMatrixAt(i, m4.compose(pv.set(x, h * 0.6 + r * 0.7, z), q.identity(), sv.set(r, r * 1.15, r)));
      crowns.setColorAt(i, treeGreens[i % treeGreens.length]);
    }
    trunks.castShadow = crowns.castShadow = true;
    scene.add(trunks, crowns);

    // ── The plot's soil surface and the cut face along the front
    const plotTex = rowTex.clone();
    plotTex.needsUpdate = true;
    keep(plotTex);
    const topSurface = std(C.topDry.clone(), { map: plotTex });
    const plotTop = add(new T.PlaneGeometry(PW, PD), topSurface, scene, PCX, 0, PCZ, false);
    plotTop.rotation.x = -Math.PI / 2;

    const strata = keep(speckleTexture("strata", 11));
    const faceTex = (h: number) => {
      const t = strata.clone();
      t.needsUpdate = true;
      t.repeat.set(REACH, h / 2);
      return keep(t);
    };
    const topSide = std(C.topDry.clone(), { map: faceTex(TS) });
    const subSide = std(C.subDry.clone(), { map: faceTex(H - TS) });
    const deepSide = std(C.deep.clone(), { map: faceTex(BEDROCK - H) });
    add(new T.PlaneGeometry(REACH * 2, TS), topSide, scene, 0, -TS / 2, FRONT, false);
    add(new T.PlaneGeometry(REACH * 2, H - TS), subSide, scene, 0, -TS - (H - TS) / 2, FRONT, false);
    add(new T.PlaneGeometry(REACH * 2, BEDROCK - H), deepSide, scene, 0, -H - (BEDROCK - H) / 2, FRONT, false);
    // the root-zone floor, as a thin darker seam
    add(new T.PlaneGeometry(REACH * 2, 0.012), std("#4d3d2c"), scene, 0, -H, FRONT + 0.002, false);

    // Stones on the cut face
    const stone = std("#9a948a", { roughness: 0.7 });
    const pebbleGeo = keep(new T.DodecahedronGeometry(1, 0));
    const PEBBLES = 160;
    const pebbles = new T.InstancedMesh(pebbleGeo, stone, PEBBLES);
    for (let i = 0; i < PEBBLES; i++) {
      const r = 0.012 + rnd() * 0.035 * (i % 7 === 0 ? 2 : 1);
      const y = -0.05 - rnd() * 2.2;
      pebbles.setMatrixAt(i, m4.compose(pv.set(-12 + rnd() * 24, y, FRONT), q.setFromEuler(e.set(rnd() * 3, rnd() * 3, 0)), sv.set(r * 1.3, r * 0.8, r)));
    }
    scene.add(pebbles);

    // Water stored in the root zone, shown on the cut face with a rippling surface
    const waterMat = keep(new T.MeshStandardMaterial({ color: "#2f7fc4", transparent: true, opacity: 0, roughness: 0.15, metalness: 0.05, emissive: "#1b5a92", emissiveIntensity: 0.25, depthWrite: false }));
    const waterFront = add(new T.PlaneGeometry(40, 1, 240, 1), waterMat, scene, 0, 0, FRONT + 0.004, false);
    const setWaterLevel = (mesh: T.Mesh, level: number, t: number) => {
      const p = mesh.geometry.attributes.position as T.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const top = i < p.count / 2; // PlaneGeometry lists the top row first
        const x = p.getX(i);
        p.setY(i, top ? level + 0.012 * Math.sin(x * 7 + t * 2.2) + 0.006 * Math.sin(x * 17 - t * 3.1) : -H);
      }
      p.needsUpdate = true;
    };
    // Infiltrating droplets on the cut face
    const DROPS = 260;
    const dropPos = new Float32Array(DROPS * 3);
    const dropSpeed = new Float32Array(DROPS);
    for (let i = 0; i < DROPS; i++) {
      dropPos[i * 3] = -10 + rnd() * 20;
      dropPos[i * 3 + 1] = -rnd() * H;
      dropPos[i * 3 + 2] = FRONT + 0.01;
      dropSpeed[i] = 0.12 + rnd() * 0.2;
    }
    const dropGeo = keep(new T.BufferGeometry());
    dropGeo.setAttribute("position", new T.BufferAttribute(dropPos, 3));
    const dropMat = keep(new T.PointsMaterial({ color: "#8cc6f2", size: 0.035, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(new T.Points(dropGeo, dropMat));

    // Salt crust specks on the plot when bulk EC is high
    const SALT = 1200;
    const saltPos = new Float32Array(SALT * 3);
    for (let i = 0; i < SALT; i++) {
      saltPos[i * 3] = plot.x0 + rnd() * PW;
      saltPos[i * 3 + 1] = 0.004;
      saltPos[i * 3 + 2] = plot.z0 + rnd() * PD;
    }
    const saltGeo = keep(new T.BufferGeometry());
    saltGeo.setAttribute("position", new T.BufferAttribute(saltPos, 3));
    const saltMat = keep(new T.PointsMaterial({ color: "#f4f1e6", size: 0.03, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(new T.Points(saltGeo, saltMat));

    // ── Station and its two soil probes
    const probeMetal = std("#c9ced1", { metalness: 0.8, roughness: 0.3 });
    const tips: { mat: T.MeshStandardMaterial; key: "surfaceVwc" | "deepVwc" }[] = [];
    for (const [key, p] of [["surfaceVwc", LAYOUT.probes.shallow], ["deepVwc", LAYOUT.probes.deep]] as const) {
      add(new T.CylinderGeometry(0.014, 0.014, p.depth + 0.05, 12), probeMetal, scene, p.x, -p.depth / 2 + 0.025, FRONT + 0.006, false);
      const tipMat = std("#79ace0", { emissive: "#79ace0", emissiveIntensity: 0.6, roughness: 0.4 });
      add(new T.SphereGeometry(0.03, 16, 12), tipMat, scene, p.x, -p.depth, FRONT + 0.01, false);
      tips.push({ mat: tipMat, key });
    }
    const halo = add(new T.TorusGeometry(0.42, 0.014, 8, 48), std("#37864a", { emissive: "#37864a", emissiveIntensity: 0.5 }), scene, LAYOUT.station.x, 0.012, LAYOUT.station.z, false);
    halo.rotation.x = Math.PI / 2;
    let stationModel: T.Object3D | undefined;
    let disposed = false;
    new GLTFLoader().load("/models/terra-station.glb", (g) => {
      if (disposed) return;
      stationModel = g.scene;
      const b = new T.Box3().setFromObject(stationModel);
      const size = b.getSize(new T.Vector3());
      stationModel.scale.setScalar(0.95 / Math.max(size.y, 0.01));
      const a = new T.Box3().setFromObject(stationModel);
      const c = a.getCenter(new T.Vector3());
      stationModel.position.set(LAYOUT.station.x - c.x, -a.min.y, LAYOUT.station.z - c.z);
      stationModel.traverse((n) => { if ((n as T.Mesh).isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      scene.add(stationModel);
    });

    // ── Crops: three plant variants, drawn as instances across the plot
    const leafMat = std(C.leafGood.clone(), { side: T.DoubleSide, roughness: 0.75 });
    const leafDark = std(C.leafGood.clone().multiplyScalar(0.75), { side: T.DoubleSide, roughness: 0.8 });
    const stalkMat = std("#6e9a48", { roughness: 0.8 });
    const tasselMat = std("#d8c07a");
    const earMat = std("#c9b45a");
    const panicleMat = std("#a5552c");
    const fruitMat = std("#e08a2c", { roughness: 0.6 });
    const flowerMat = std("#f2cf3a", { roughness: 0.6 });
    const blossomMat = std("#e9e1f5", { roughness: 0.6 });
    const rootMat = std("#d9c3a0", { roughness: 1 });
    const crops = new T.Group();
    scene.add(crops);
    const geos = {
      longLeaf: keep(ribbonLeaf(0.5, 0.075, 0.9)),
      broad: keep(broadLeaf(0.13)),
      small: keep(broadLeaf(0.055)),
      stalk: keep(new T.CylinderGeometry(0.016, 0.028, 1, 8)),
      stem: keep(new T.CylinderGeometry(0.006, 0.009, 1, 6)),
      tassel: keep(new T.CylinderGeometry(0.004, 0.004, 0.16, 4)),
      ear: keep(new T.CapsuleGeometry(0.03, 0.1, 4, 8)),
      panicle: keep(new T.SphereGeometry(0.06, 10, 8)),
      fruit: keep(new T.SphereGeometry(0.055, 12, 10)),
      flower: keep(new T.SphereGeometry(0.018, 8, 6)),
    };
    /** Build one plant as plain meshes; it is merged into instanced batches afterwards */
    const buildPlant = (cropId: CropId, r: () => number): T.Group => {
      const g = new T.Group();
      const part = (geo: T.BufferGeometry, m: T.Material, repro = false) => {
        const o = new T.Mesh(geo, m);
        o.userData.repro = repro;
        g.add(o);
        return o;
      };
      const shape = CROP_SHAPE[cropId];
      const full = canopyHeight(cropId, 1);
      if (shape === "tall") {
        const stalk = part(geos.stalk, stalkMat);
        stalk.scale.y = full;
        stalk.position.y = full / 2;
        const n = 9;
        for (let i = 0; i < n; i++) {
          const leaf = part(geos.longLeaf, i % 3 ? leafMat : leafDark);
          leaf.position.y = full * (0.12 + (i / n) * 0.78);
          leaf.rotation.y = i * Math.PI + (r() - 0.5) * 0.9;
          leaf.rotation.z = 0.15 + r() * 0.25;
          leaf.scale.setScalar(1.15 - (i / n) * 0.45);
        }
        if (cropId === "corn") {
          for (let i = 0; i < 6; i++) {
            const t = part(geos.tassel, tasselMat, true);
            t.position.set(0, full + 0.06, 0);
            t.rotation.set((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8);
          }
          const ear = part(geos.ear, earMat, true);
          ear.position.set(0.04, full * 0.5, 0);
          ear.rotation.z = -0.35;
        } else {
          const pan = part(geos.panicle, panicleMat, true);
          pan.position.y = full + 0.04;
          pan.scale.set(0.8, 1.5, 0.8);
        }
      } else if (shape === "bush" || shape === "tallbush") {
        const clusters = shape === "bush" ? 9 : 12;
        for (let i = 0; i < clusters; i++) {
          const a = r() * Math.PI * 2;
          const rr = (shape === "bush" ? 0.17 : 0.1) * Math.sqrt(r());
          const h = full * (0.35 + r() * 0.6);
          const stem = part(geos.stem, stalkMat);
          stem.scale.y = h;
          stem.position.set((Math.cos(a) * rr) / 2, h / 2, (Math.sin(a) * rr) / 2);
          stem.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
          for (let k = 0; k < 3; k++) {
            const leaf = part(geos.small, k ? leafMat : leafDark);
            leaf.position.set(Math.cos(a) * rr + Math.cos(k * 2.1) * 0.045, h + 0.01, Math.sin(a) * rr + Math.sin(k * 2.1) * 0.045);
            leaf.rotation.set((r() - 0.5) * 0.6, k * 2.1, (r() - 0.5) * 0.6);
            leaf.scale.set(1, 1, 1.4);
          }
          if (r() < 0.5) {
            const f = part(geos.flower, cropId === "sunnhemp" ? flowerMat : blossomMat, true);
            f.position.set(Math.cos(a) * rr, h + 0.03, Math.sin(a) * rr);
          }
        }
      } else if (shape === "vine") {
        const n = cropId === "squash" ? 7 : 10;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + r() * 0.4;
          const d = 0.08 + r() * 0.16;
          const leaf = part(cropId === "squash" ? geos.broad : geos.small, i % 2 ? leafMat : leafDark);
          leaf.position.set(Math.cos(a) * d, full * (0.3 + r() * 0.7), Math.sin(a) * d);
          leaf.rotation.set((r() - 0.5) * 0.5, a, (r() - 0.5) * 0.5);
          if (cropId !== "squash") leaf.scale.setScalar(1.6);
        }
        if (cropId === "squash") {
          const f = part(geos.fruit, fruitMat, true);
          f.position.set(0.12, 0.05, 0.05);
          f.scale.set(1.2, 0.9, 1);
        }
      } else {
        for (let i = 0; i < 4; i++) {
          const s = part(geos.stem, tasselMat);
          s.scale.y = 0.05 + r() * 0.04;
          s.position.set((r() - 0.5) * 0.15, 0.03, (r() - 0.5) * 0.15);
          s.rotation.z = (r() - 0.5) * 0.6;
        }
      }
      return g;
    };

    interface Batch { mesh: T.InstancedMesh; repro: boolean }
    interface Plant { x: number; z: number; rotY: number; size: number; phase: number; delay: number; grow: number; variant: number; index: number }
    const VARIANTS = 3;
    let batches: Batch[][] = [];
    let plants: Plant[] = [];
    let rootMesh: T.Mesh | undefined;
    let builtCrop = "";
    const rebuildCrops = (cropId: CropId) => {
      for (const b of batches.flat()) { crops.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.dispose(); }
      if (rootMesh) { scene.remove(rootMesh); rootMesh.geometry.dispose(); rootMesh = undefined; }
      const r = createRng(cropId.length * 97 + 13);
      const { cols, rows, x0, x1, z0, z1 } = LAYOUT.crops;
      plants = [];
      const perVariant = new Array(VARIANTS).fill(0);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const variant = Math.floor(r() * VARIANTS);
          plants.push({
            x: x0 + (col / (cols - 1)) * (x1 - x0) + (r() - 0.5) * 0.08,
            z: z0 + (row / (rows - 1)) * (z1 - z0) + (r() - 0.5) * 0.08,
            rotY: r() * Math.PI * 2, size: 0.9 + r() * 0.2, phase: r() * Math.PI * 2, delay: r() * 0.35, grow: 0.001,
            variant, index: perVariant[variant]++,
          });
        }
      }
      batches = [];
      for (let v = 0; v < VARIANTS; v++) {
        const g = buildPlant(cropId, r);
        g.updateMatrixWorld(true);
        const groups = new Map<string, { mat: T.Material; repro: boolean; parts: T.BufferGeometry[] }>();
        g.traverse((o) => {
          const mesh = o as T.Mesh;
          if (!mesh.isMesh) return;
          const mat = mesh.material as T.Material;
          const key = `${mat.uuid}:${mesh.userData.repro ? 1 : 0}`;
          if (!groups.has(key)) groups.set(key, { mat, repro: !!mesh.userData.repro, parts: [] });
          groups.get(key)!.parts.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
        });
        batches.push([...groups.values()].map(({ mat, repro, parts }) => {
          const merged = mergeGeometries(parts)!;
          parts.forEach((p) => p.dispose());
          const mesh = new T.InstancedMesh(merged, mat, Math.max(1, perVariant[v]));
          mesh.count = perVariant[v];
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
          crops.add(mesh);
          return { mesh, repro };
        }));
      }
      // Roots of the front row, seen on the cut face
      if (CROP_SHAPE[cropId] !== "bare") {
        const depth = CROP_SHAPE[cropId] === "tall" ? 0.7 : 0.4;
        const tubes: T.BufferGeometry[] = [];
        for (let col = 0; col < cols; col++) {
          const x = x0 + (col / (cols - 1)) * (x1 - x0);
          for (let k = 0; k < 4; k++) {
            const pts = [new T.Vector3(x, 0, FRONT + 0.006)];
            let px = x;
            for (let s = 1; s <= 6; s++) {
              px += (r() - 0.5) * 0.09 + (k - 1.5) * 0.02;
              pts.push(new T.Vector3(px, -(s / 6) * depth * (0.55 + r() * 0.45), FRONT + 0.006));
            }
            tubes.push(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 0.0045 - k * 0.0006, 5));
          }
        }
        rootMesh = new T.Mesh(mergeGeometries(tubes)!, rootMat);
        tubes.forEach((t) => t.dispose());
        scene.add(rootMesh);
      }
    };

    // ── Rotation strips (one per past season), across the plot
    const strips = new T.Group();
    scene.add(strips);
    let stripKey = "";
    let stripMeshes: T.Mesh[] = [];
    const buildStrips = (s: FieldSceneState) => {
      for (const m of stripMeshes) { strips.remove(m); m.geometry.dispose(); (m.material as T.Material).dispose(); }
      const n = s.rotationStrips.length;
      stripMeshes = s.rotationStrips.map((r, i) => {
        const color = r.isRepeatFamily ? "#c8902e" : r.isLegume ? "#5aa865" : "#b8a079";
        const m = new T.Mesh(new T.BoxGeometry(PW / n - 0.06, 0.05, PD - 0.08), new T.MeshStandardMaterial({ color, roughness: 0.85, transparent: true, opacity: 0 }));
        m.position.set(plot.x0 + ((i + 0.5) * PW) / n, -0.03, PCZ);
        m.receiveShadow = true;
        strips.add(m);
        return m;
      });
    };

    // ── Weather: sun, clouds, rain
    const sunGroup = new T.Group();
    sunGroup.position.set(...LAYOUT.sun);
    scene.add(sunGroup);
    const sunCore = new T.Mesh(keep(new T.SphereGeometry(0.5, 24, 16)), keep(new T.MeshBasicMaterial({ color: "#ffd25e", transparent: true, opacity: 0, fog: false })));
    const glowTex = keep(glowTexture());
    const sunGlow = new T.Sprite(keep(new T.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false })));
    sunGlow.scale.setScalar(4.6);
    const rays = new T.Group();
    const rayMat = keep(new T.MeshBasicMaterial({ color: "#ffd25e", transparent: true, opacity: 0, fog: false }));
    const rayGeo = keep(new T.PlaneGeometry(0.09, 0.5));
    for (let i = 0; i < 12; i++) {
      const ray = new T.Mesh(rayGeo, rayMat);
      const a = (i / 12) * Math.PI * 2;
      ray.position.set(Math.cos(a) * 0.98, Math.sin(a) * 0.98, 0);
      ray.rotation.z = a - Math.PI / 2;
      rays.add(ray);
    }
    sunGroup.add(sunGlow, sunCore, rays);

    const cloudMat = keep(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const puff = keep(new T.SphereGeometry(1, 16, 12));
    const clouds: { g: T.Group; speed: number; rainOnly: boolean }[] = [];
    for (let i = 0; i < 11; i++) {
      const g = new T.Group();
      const n = 5 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const s = new T.Mesh(puff, cloudMat);
        const r = 0.4 + rnd() * 0.4;
        s.scale.set(r * 1.3, r, r);
        s.position.set((k - n / 2) * 0.42, rnd() * 0.25, (rnd() - 0.5) * 0.5);
        g.add(s);
      }
      g.position.set(-11 + rnd() * 22, 4.2 + rnd() * 1.4, -12 + rnd() * 10);
      scene.add(g);
      clouds.push({ g, speed: 0.08 + rnd() * 0.1, rainOnly: i >= 3 });
    }

    const RAIN = 3200;
    const RAIN_TOP = 5;
    const rainPos = new Float32Array(RAIN * 6);
    const rainSeed = new Float32Array(RAIN * 3);
    for (let i = 0; i < RAIN; i++) {
      rainSeed[i * 3] = -8 + rnd() * 16;
      rainSeed[i * 3 + 1] = rnd() * RAIN_TOP;
      rainSeed[i * 3 + 2] = FRONT + 0.6 - rnd() * 12;
    }
    const rainGeo = keep(new T.BufferGeometry());
    rainGeo.setAttribute("position", new T.BufferAttribute(rainPos, 3));
    const rainMat = keep(new T.LineBasicMaterial({ color: "#a9cbe6", transparent: true, opacity: 0 }));
    const rain = new T.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    scene.add(rain);

    // ── Sizing, visibility and motion preferences
    let aspect = 1;
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      snap = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
    io.observe(el);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");

    // Eased visual state
    const v = {
      water: 0, soil: 0, veg: 0, climate: 0, rotation: 0, rainy: 0,
      wetTop: 0.5, wetDeep: 0.5, level: 0.5, vigor: 0.7, growth: 0.5, rainI: 0, cloud: 0, salt: 0, heat: 0,
    };
    let snap = true;
    let shotKey = "";
    let from = { pos: new T.Vector3(), target: new T.Vector3() };
    let to = from;
    let shotStart = 0;
    const look = new T.Vector3();
    const toScreen = new T.Vector3();
    let frame = 0;
    let last = performance.now();
    const start = last;
    resize();

    const placeCallouts = (list: SceneCallout[], w: number, h: number) => {
      const k = Math.min(1, Math.max(0.55, w / 900));
      const INSET = latest.current.controls ? INSET_ALL : INSET_BARE;
      // read sizes first, then write positions
      const sizes = list.map((c) => {
        const card = cards.current.get(c.id);
        return card ? [card.offsetWidth, card.offsetHeight] : [0, 0];
      });
      const fitX = (x: number, cw: number) => Math.min(Math.max(INSET.side, x), w - cw - INSET.side);
      const fitY = (y: number, ch: number) => Math.min(Math.max(INSET.top, y), h - ch - INSET.bottom);
      const boxes = list.map((c, i) => {
        toScreen.set(...c.anchor).project(camera);
        const onScreen = toScreen.z < 1 && Math.abs(toScreen.x) < 1.05 && Math.abs(toScreen.y) < 1.05;
        const ax = ((toScreen.x + 1) / 2) * w, ay = ((1 - toScreen.y) / 2) * h;
        const [cw, ch] = sizes[i];
        const dx = c.offset[0] * k, dy = c.offset[1] * k;
        const left = fitX(dx === 0 ? ax - cw / 2 : dx > 0 ? ax + dx : ax + dx - cw, cw);
        const top = fitY(dy >= 0 ? ay + dy : ay + dy - ch, ch);
        return { ax, ay, cw, ch, left, top, down: dy >= 0, onScreen };
      });
      // Push overlapping cards apart, in the direction each one already sits from its anchor
      const GAP = 6;
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < boxes.length; i++) {
          for (let j = 0; j < i; j++) {
            const a = boxes[i], b = boxes[j];
            const overlapX = a.left < b.left + b.cw + GAP && b.left < a.left + a.cw + GAP;
            const overlapY = a.top < b.top + b.ch + GAP && b.top < a.top + a.ch + GAP;
            if (!overlapX || !overlapY) continue;
            const down = fitY(b.top + b.ch + GAP, a.ch), up = fitY(b.top - a.ch - GAP, a.ch);
            const fitsDown = down >= b.top + b.ch + GAP, fitsUp = up + a.ch + GAP <= b.top;
            a.top = (a.down ? fitsDown || !fitsUp : !fitsUp && fitsDown) ? down : up;
          }
        }
      }
      list.forEach((c, i) => {
        const card = cards.current.get(c.id), dot = dots.current.get(c.id), line = lines.current.get(c.id);
        if (!card || !dot || !line) return;
        const { ax, ay, cw, ch, left, top, onScreen } = boxes[i];
        const lx = Math.min(Math.max(ax, left), left + cw), ly = Math.min(Math.max(ay, top), top + ch);
        const show = onScreen ? "1" : "0";
        card.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
        card.style.opacity = show;
        dot.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px)`;
        dot.style.opacity = show;
        line.setAttribute("x1", ax.toFixed(1)); line.setAttribute("y1", ay.toFixed(1));
        line.setAttribute("x2", lx.toFixed(1)); line.setAttribute("y2", ly.toFixed(1));
        line.style.opacity = show;
      });
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible || document.hidden) return;
      const { state: s, dim: d, callouts: list } = latest.current;
      const still = reduced.matches;
      const t = still ? 0 : (now - start) / 1000;
      const k = still || snap ? 1 : 1 - Math.exp(-dt * 3.2);
      const approach = (key: keyof typeof v, target: number, rate = k) => { v[key] += (target - v[key]) * rate; };

      // Camera: a locked, framed shot per tab, eased between tabs
      const key = `${d}:${aspect.toFixed(3)}`;
      if (key !== shotKey) {
        const next = shotPose(SHOTS[d], aspect);
        const tabChanged = !shotKey.startsWith(d + ":");
        shotKey = key;
        if (snap || still || !tabChanged) { from = next; to = next; shotStart = -Infinity; }
        else { from = { pos: camera.position.clone(), target: look.clone() }; to = next; shotStart = now; }
      }
      const p = ease(clamp01((now - shotStart) / 1500));
      camera.position.lerpVectors(from.pos, to.pos, p);
      look.lerpVectors(from.target, to.target, p);
      camera.lookAt(look);

      // Ease every visual quantity toward the data
      const rainy = (s.metrics.rainMm ?? 0) >= RAIN_DAY_MM;
      approach("water", d === "water" ? 1 : 0);
      approach("soil", d === "soil" ? 1 : 0);
      approach("veg", d === "vegetation" ? 1 : 0);
      approach("climate", d === "climate" ? 1 : 0);
      approach("rotation", d === "rotation" ? 1 : 0);
      approach("rainy", rainy ? 1 : 0);
      approach("wetTop", s.soil.wetnessTop);
      approach("wetDeep", s.soil.wetnessDeep);
      approach("level", s.metrics.storageRatio);
      approach("vigor", s.crop.canopyVigor ?? -1);
      approach("growth", s.crop.growthFactor);
      approach("rainI", s.weather.rainIntensity);
      approach("cloud", s.weather.cloudCover);
      approach("salt", s.soil.salinityAlert === "lock" ? 1 : s.soil.salinityAlert === "elevated" ? 0.5 : 0);
      approach("heat", clamp01(((s.metrics.soilTempC ?? 18) - 24) / 12));
      snap = false;

      // Soil: darker when wet, blue in the water view (the wet darkening eases off so the blue reads)
      const blue = v.water;
      const darkTop = v.wetTop * (1 - 0.6 * blue), darkDeep = v.wetDeep * (1 - 0.6 * blue);
      topSurface.color.copy(C.topDry).lerp(C.topWet, darkTop).lerp(C.waterTint, blue * (0.35 + 0.5 * v.wetTop));
      topSide.color.copy(C.topDry).lerp(C.topWet, darkTop).lerp(C.waterTint, blue * (0.4 + 0.5 * v.wetTop));
      subSide.color.copy(C.subDry).lerp(C.subWet, darkDeep).lerp(C.waterTint, blue * (0.4 + 0.5 * v.wetDeep));
      for (const m of [topSurface, topSide]) m.emissive.setRGB(0.18 * v.heat * v.soil, 0.06 * v.heat * v.soil, 0);
      const level = -H + v.level * H;
      setWaterLevel(waterFront, level, t);
      waterMat.opacity = 0.62 * blue;
      dropMat.opacity = 0.9 * blue;
      if (blue > 0.01 && !still) {
        for (let i = 0; i < DROPS; i++) {
          dropPos[i * 3 + 1] -= dropSpeed[i] * dt;
          if (dropPos[i * 3 + 1] < level) dropPos[i * 3 + 1] = -0.01;
        }
        dropGeo.attributes.position.needsUpdate = true;
      }
      saltMat.opacity = 0.9 * v.salt;
      for (const tip of tips) {
        const val = (s.metrics[tip.key] as number | undefined) ?? 20;
        tip.mat.color.set(moistureColor(val));
        tip.mat.emissive.set(moistureColor(val));
        tip.mat.emissiveIntensity = 0.4 + (v.water + v.soil) * (0.6 + 0.4 * Math.sin(t * 3));
      }
      const status = new T.Color(s.stationStatusColor);
      (halo.material as T.MeshStandardMaterial).color.copy(status);
      (halo.material as T.MeshStandardMaterial).emissive.copy(status);

      // Crops: rebuilt when the crop changes, grown and coloured by the data
      if (builtCrop !== s.crop.id) { builtCrop = s.crop.id; rebuildCrops(s.crop.id); }
      const leafColor = v.vigor < 0 ? C.leafUnknown : new T.Color().copy(C.leafWeak).lerp(C.leafGood, clamp01(v.vigor * 1.4 - 0.15));
      leafMat.color.copy(leafColor);
      leafDark.color.copy(leafColor).multiplyScalar(0.72);
      const grownScale = (0.12 + 0.88 * v.growth) * (1 - 0.97 * v.rotation);
      const reproductiveOn = s.crop.stage === "mid-season" || s.crop.stage === "late";
      const wind = 1 + 2.5 * v.rainy * v.climate;
      for (const pl of plants) {
        pl.grow += (Math.max(0.001, grownScale) - pl.grow) * (still ? 1 : 1 - Math.exp(-dt * (2.4 - pl.delay * 3)));
        e.set(still ? 0 : Math.cos(t * 1.1 + pl.phase) * 0.02 * wind, pl.rotY, still ? 0 : Math.sin(t * 1.4 + pl.phase) * 0.035 * wind);
        m4.compose(pv.set(pl.x, 0, pl.z), q.setFromEuler(e), sv.setScalar(Math.max(pl.grow * pl.size, 0.0001)));
        for (const b of batches[pl.variant]) b.mesh.setMatrixAt(pl.index, m4);
      }
      for (const b of batches.flat()) {
        b.mesh.instanceMatrix.needsUpdate = true;
        b.mesh.visible = grownScale > 0.01 && (!b.repro || reproductiveOn);
      }
      if (rootMesh) {
        rootMesh.scale.y = Math.max(0.001, (0.15 + 0.85 * v.growth) * (1 - 0.9 * v.rotation));
        rootMesh.visible = rootMesh.scale.y > 0.01;
      }

      // Rotation strips rise one season after another
      const sk = JSON.stringify(s.rotationStrips.map((r) => [r.crop, r.isLegume, r.isRepeatFamily]));
      if (sk !== stripKey) { stripKey = sk; buildStrips(s); }
      stripMeshes.forEach((m, i) => {
        const qv = clamp01(v.rotation * (stripMeshes.length + 1) - i * 0.8);
        m.position.y = -0.03 + 0.06 * ease(qv);
        (m.material as T.MeshStandardMaterial).opacity = qv;
        m.visible = qv > 0.01;
      });

      // Weather, shown in the climate view: rain or sun from the day's rain gauge
      const cl = v.climate;
      const sunny = cl * (1 - v.rainy);
      const wet = cl * v.rainy;
      skyU.top.value.copy(C.skyTop).lerp(C.sunTop, sunny).lerp(C.rainTop, wet);
      skyU.bottom.value.copy(C.skyBottom).lerp(C.sunBottom, sunny).lerp(C.rainBottom, wet);
      fog.color.copy(skyU.bottom.value);
      fog.near = 14 - 6 * wet;
      sun.intensity = 2.6 + 0.6 * sunny - 1.5 * wet;
      hemi.intensity = 1.6 - 0.4 * wet;
      (sunCore.material as T.MeshBasicMaterial).opacity = sunny;
      sunGlow.material.opacity = sunny * (0.85 + 0.15 * Math.sin(t * 2));
      rayMat.opacity = sunny * 0.9;
      rays.rotation.z = t * 0.25;
      rays.scale.setScalar(1 + 0.06 * Math.sin(t * 2.4));
      cloudMat.opacity = cl * (0.45 + 0.5 * v.rainy);
      cloudMat.color.setRGB(1, 1, 1).lerp(new T.Color("#8b96a1"), v.rainy * (0.4 + 0.6 * v.cloud));
      for (const c of clouds) {
        c.g.visible = cl > 0.01 && (!c.rainOnly || v.rainy > 0.05);
        c.g.position.x += c.speed * dt;
        if (c.g.position.x > 12) c.g.position.x = -12;
      }
      rainMat.opacity = wet * 0.75;
      const drops = Math.round(RAIN * (0.25 + 0.75 * v.rainI) * (wet > 0.01 ? 1 : 0));
      rainGeo.setDrawRange(0, drops * 2);
      if (drops) {
        for (let i = 0; i < drops; i++) {
          const y = ((rainSeed[i * 3 + 1] - t * 4.6) % RAIN_TOP + RAIN_TOP) % RAIN_TOP;
          const x = rainSeed[i * 3] + y * 0.08;
          const z = rainSeed[i * 3 + 2];
          rainPos.set([x, y, z, x + 0.02, y + 0.15, z], i * 6);
        }
        rainGeo.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
      placeCallouts(list, el.clientWidth, el.clientHeight);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      for (const m of stripMeshes) { m.geometry.dispose(); (m.material as T.Material).dispose(); }
      for (const b of batches.flat()) { b.mesh.geometry.dispose(); b.mesh.dispose(); }
      rootMesh?.geometry.dispose();
      trunks.dispose(); crowns.dispose(); pebbles.dispose();
      stationModel?.traverse((n) => {
        const mesh = n as T.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      });
      disposables.forEach((dsp) => dsp.dispose());
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <div ref={host} className={clsx("@container relative w-full overflow-hidden", tall ? "h-[min(78vh,760px)]" : "h-[clamp(400px,64vh,620px)]")}>
      {fallback ? (
        <ul className="space-y-1 p-6 text-sm text-ink-soft">
          <li className="font-medium text-ink">3D is unavailable in this browser.</li>
          {callouts.map((c) => <li key={c.id}>{c.label}: {c.value}{c.sub ? ` (${c.sub})` : ""}</li>)}
        </ul>
      ) : (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <svg className="absolute inset-0 h-full w-full overflow-visible">
            {callouts.map((c, i) => (
              <line key={`${dim}-${c.id}`} ref={(n) => { if (n) lines.current.set(c.id, n); else lines.current.delete(c.id); }}
                className="terra-callout-line" strokeWidth={1.25} strokeDasharray="3 3" style={{ opacity: 0, ["--d" as string]: `${600 + i * 110}ms` }} />
            ))}
          </svg>
          {callouts.map((c, i) => (
            <span key={`${dim}-${c.id}`} ref={(n) => { if (n) dots.current.set(c.id, n); else dots.current.delete(c.id); }}
              className="terra-callout-dot" style={{ opacity: 0, ["--d" as string]: `${600 + i * 110}ms` }} />
          ))}
          {callouts.map((c, i) => (
            <div key={`${dim}-${c.id}`} ref={(n) => { if (n) cards.current.set(c.id, n); else cards.current.delete(c.id); }}
              className="absolute left-0 top-0" style={{ opacity: 0 }}>
              <div className={clsx("terra-callout flex items-center gap-2.5 rounded-xl border px-3 py-2 shadow-pop backdrop-blur-sm @max-[32rem]:gap-1.5 @max-[32rem]:px-2 @max-[32rem]:py-1.5",
                c.tone === "warn" ? "border-amber-line bg-amber-soft/95" : "border-line bg-surface/95")}
                style={{ ["--d" as string]: `${600 + i * 110}ms` }}>
                {c.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- small static crop render
                  <img src={c.image} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain @max-[32rem]:h-7 @max-[32rem]:w-7" />
                )}
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-[11px] font-medium leading-tight text-muted">{c.label}</p>
                  <p className="tabular whitespace-nowrap text-[15px] font-semibold leading-snug text-ink @max-[32rem]:text-[13px]">{c.value}</p>
                  {c.sub && <p className="whitespace-nowrap text-[11px] leading-tight text-ink-soft @max-[32rem]:hidden">{c.sub}</p>}
                  {c.source && <SourceTag kind={c.source} short className="mt-0.5 text-[10px]!" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* The 3D scene was built with SI tools (see si-use.json) */}
      <span className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-ink/70 px-2 py-0.5 text-[10.5px] font-medium text-white">SI-generated scene</span>
    </div>
  );
}
