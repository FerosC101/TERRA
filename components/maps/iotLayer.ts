import { MercatorCoordinate, type CustomLayerInterface, type Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { LatLng } from "@/types";

/**
 * Field devices drawn in 3D on the MapLibre map with three.js, on the map's own
 * WebGL context:
 *  - the TERRA field station (public/models/terra-station.glb), enlarged so it
 *    can be seen at field scale;
 *  - soil-moisture probe points as "moisture beacons": a probe stake, a glass
 *    droplet that fills to the measured moisture, a ground ring sized by it, and
 *    a value label. Fill level, colour and ring size all encode the reading;
 *    the beacon's height does not.
 * Everything sits on the terrain. Screen positions are reported every frame so the
 * map can place labels and test clicks against what is actually drawn.
 */
export const STATION_MODEL_SCALE = 60;
const STATION_HEIGHT_M = 1.22 * STATION_MODEL_SCALE;
const MODEL_URL = "/models/terra-station.glb";

/** Volumetric water content treated as a full droplet */
export const BEACON_FULL_VWC = 45;
/** Beacons are modelled at a 1x size below, then enlarged like the station so they read at field scale */
const BEACON_SCALE = 2.2;
const STAKE_TOP = 24;
const DROP_CENTRE = 36;
const DROP_HEIGHT = 15;

export interface ProbeBeacon {
  id: string;
  label: string;
  position: LatLng;
  value: number;
  color: string;
}

export interface IotState {
  station: { name: string; position: LatLng; visible: boolean };
  probes: ProbeBeacon[];
  showProbes: boolean;
  selectedProbe: string | null;
  /** Terrain exaggeration in use, or 0 when the map is flat */
  terrain: number;
  reduceMotion: boolean;
}

export interface ScreenPoint { x: number; y: number; visible: boolean }
export interface IotScreen {
  station?: { foot: ScreenPoint; top: ScreenPoint };
  probes: Record<string, { drop: ScreenPoint; label: ScreenPoint }>;
}

/** Teardrop outline for LatheGeometry: round bottom, pointed top. */
function dropletProfile(height: number, radius: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;                                   // 0 bottom .. 1 tip
    const y = t * height;
    const r = radius * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.35 * t);
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  return pts;
}

interface BeaconMeshes {
  group: THREE.Group;
  bob: THREE.Group;
  ring: THREE.Mesh;
  pulse: THREE.Mesh;
  fillMaterial: THREE.MeshStandardMaterial;
  clip: THREE.Plane;
  key: string;
}

function buildBeacon(p: ProbeBeacon, selected: boolean): BeaconMeshes {
  const color = new THREE.Color(p.color);
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(BEACON_SCALE);
  group.add(body);
  const frac = Math.max(0.06, Math.min(1, p.value / BEACON_FULL_VWC));

  // Ground ring: radius grows with moisture
  const outer = 7 + frac * 20;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(outer * 0.72, outer, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: selected ? 0.75 : 0.45, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.6;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(outer * 0.72, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.5;
  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(outer * 0.96, outer, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  );
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 0.7;
  // Dark edge so pale (dry) readings still stand out on bright imagery
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(outer, outer + 0.9, 48),
    new THREE.MeshBasicMaterial({ color: 0x183b2a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  );
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.65;
  for (const m of [disc, ring, edge, pulse]) {
    (m.material as THREE.MeshBasicMaterial).depthTest = false;
    m.renderOrder = -1;
  }
  body.add(disc, ring, edge, pulse);

  // Probe stake with a sensor head
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.9, roughness: 0.3 });
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, STAKE_TOP, 12), metal);
  stake.position.y = STAKE_TOP / 2;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 20), new THREE.MeshStandardMaterial({ color: 0x1b1f28, metalness: 0.4, roughness: 0.4 }));
  head.position.y = STAKE_TOP;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }));
  tip.position.y = STAKE_TOP + 1.8;
  body.add(stake, head, tip);

  // Glass droplet that fills to the measured moisture
  const bob = new THREE.Group();
  const bottom = DROP_CENTRE - DROP_HEIGHT / 2;
  const shellGeo = new THREE.LatheGeometry(dropletProfile(DROP_HEIGHT, 6.2), 40);
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({
    color: 0xe4edf2, transparent: true, opacity: selected ? 0.34 : 0.24, metalness: 0.1, roughness: 0.05, depthWrite: false,
  }));
  shell.position.y = bottom;
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const fillMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12, roughness: 0.3, clippingPlanes: [clip] });
  const fill = new THREE.Mesh(new THREE.LatheGeometry(dropletProfile(DROP_HEIGHT * 0.88, 5.4), 40), fillMaterial);
  fill.position.y = bottom + DROP_HEIGHT * 0.05;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.35, 8, 40), new THREE.MeshStandardMaterial({ color: 0x183b2a, metalness: 0.3, roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = bottom + DROP_HEIGHT * 0.32;
  bob.add(fill, shell);
  bob.add(rim);
  rim.visible = selected;
  body.add(bob);

  // Fill level in the beacon's unscaled frame (see BEACON_SCALE)
  bob.userData.fillLevel = bottom + DROP_HEIGHT * 0.05 + DROP_HEIGHT * 0.88 * frac;
  return { group, bob, ring, pulse, fillMaterial, clip, key: `${p.id}:${p.value}:${p.color}:${selected}` };
}

function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
  });
}

export function createIotLayer(getState: () => IotState, onFrame: (screen: IotScreen) => void): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const station = new THREE.Group();
  const beacons = new Map<string, BeaconMeshes>();
  const started = performance.now();

  const syncBeacons = (state: IotState) => {
    const wanted = new Set(state.probes.map((p) => p.id));
    for (const [id, b] of beacons) {
      if (!wanted.has(id)) { scene.remove(b.group); disposeTree(b.group); beacons.delete(id); }
    }
    for (const p of state.probes) {
      const selected = state.selectedProbe === p.id;
      const key = `${p.id}:${p.value}:${p.color}:${selected}`;
      const existing = beacons.get(p.id);
      if (existing && existing.key === key) continue;
      if (existing) { scene.remove(existing.group); disposeTree(existing.group); }
      const b = buildBeacon(p, selected);
      beacons.set(p.id, b);
      scene.add(b.group);
    }
  };

  return {
    id: "iot-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.localClippingEnabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-40, 80, 60);
      scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 0.7), station);
      new GLTFLoader().load(MODEL_URL, (gltf) => {
        const root = gltf.scene;
        // Stand the model on its feet at the origin (glTF is Y-up, metres), then enlarge it
        const box = new THREE.Box3().setFromObject(root);
        const centre = box.getCenter(new THREE.Vector3());
        root.position.set(-centre.x, -box.min.y, -centre.z);
        station.add(root);
        station.scale.setScalar(STATION_MODEL_SCALE);
        map.triggerRepaint();
      });
    },
    render(_gl, args) {
      const state = getState();
      const three = state.terrain > 0;
      syncBeacons(state);

      // Local frame: metres, origin at the station on the ground, Y up, X east, Z south
      const origin: [number, number] = [state.station.position.lng, state.station.position.lat];
      const elevation = (ll: [number, number]) => (three ? map.queryTerrainElevation(ll) ?? 0 : 0);
      const originElev = elevation(origin);
      const ref = MercatorCoordinate.fromLngLat(origin, originElev);
      const unit = ref.meterInMercatorCoordinateUnits();
      const transform = new THREE.Matrix4()
        .makeTranslation(ref.x, ref.y, ref.z ?? 0)
        .scale(new THREE.Vector3(unit, -unit, unit))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      const full = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(transform);
      camera.projectionMatrix = full;

      station.visible = state.station.visible;
      const t = (performance.now() - started) / 1000;
      for (const p of state.probes) {
        const b = beacons.get(p.id);
        if (!b) continue;
        b.group.visible = state.showProbes && three;
        const ll: [number, number] = [p.position.lng, p.position.lat];
        const merc = MercatorCoordinate.fromLngLat(ll, 0);
        b.group.position.set((merc.x - ref.x) / unit, elevation(ll) - originElev, (merc.y - ref.y) / unit);
        const bobY = state.reduceMotion ? 0 : Math.sin(t * 1.6 + p.position.lng * 9000) * 1.2;
        b.bob.position.y = bobY;
        // clip the fill at its level, in the local frame
        b.clip.constant = b.group.position.y + BEACON_SCALE * (bobY + (b.bob.userData.fillLevel as number));
        const phase = state.reduceMotion ? 0.5 : (t * 0.45 + (p.position.lat * 7000) % 1) % 1;
        b.pulse.scale.setScalar(1 + phase * 0.9);
        (b.pulse.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - phase);
      }

      renderer.resetState();
      renderer.render(scene, camera);

      // Report where things are on screen, for labels and click tests
      const canvas = map.getCanvas();
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const project = (x: number, y: number, z: number): ScreenPoint => {
        const v = new THREE.Vector4(x, y, z, 1).applyMatrix4(full);
        if (v.w <= 0) return { x: 0, y: 0, visible: false };
        return { x: ((v.x / v.w + 1) / 2) * w, y: ((1 - v.y / v.w) / 2) * h, visible: Math.abs(v.x / v.w) < 1.2 && Math.abs(v.y / v.w) < 1.2 };
      };
      const screen: IotScreen = { probes: {} };
      if (state.station.visible) screen.station = { foot: project(0, 0, 0), top: project(0, STATION_HEIGHT_M, 0) };
      if (state.showProbes && three) {
        for (const p of state.probes) {
          const b = beacons.get(p.id);
          if (!b) continue;
          const g = b.group.position;
          const lift = (y: number) => g.y + BEACON_SCALE * (y + b.bob.position.y);
          screen.probes[p.id] = {
            drop: project(g.x, lift(DROP_CENTRE), g.z),
            label: project(g.x, lift(DROP_CENTRE + DROP_HEIGHT * 0.62), g.z),
          };
        }
      }
      onFrame(screen);
      if (!state.reduceMotion || !station.children.length) map.triggerRepaint();
    },
    onRemove() {
      disposeTree(scene);
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}

/** Does a screen point fall on the drawn station (between its foot and its top)? */
export function hitsStation(screen: IotScreen, point: { x: number; y: number }): boolean {
  const s = screen.station;
  if (!s || !s.foot.visible) return false;
  const height = Math.abs(s.foot.y - s.top.y);
  const half = Math.max(14, height * 0.32);
  return point.y >= Math.min(s.foot.y, s.top.y) - 8 && point.y <= Math.max(s.foot.y, s.top.y) + 8 && Math.abs(point.x - s.foot.x) <= half;
}

/** The probe beacon under a screen point, if any. */
export function probeAt(screen: IotScreen, point: { x: number; y: number }): string | null {
  for (const [id, p] of Object.entries(screen.probes)) {
    // Hit radius follows the droplet's size on screen
    const radius = Math.max(18, Math.hypot(p.label.x - p.drop.x, p.label.y - p.drop.y) * 1.1);
    if (p.drop.visible && Math.hypot(point.x - p.drop.x, point.y - p.drop.y) < radius) return id;
  }
  return null;
}
