import { MercatorCoordinate, type CustomLayerInterface, type Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { LatLng } from "@/types";

/**
 * Draws the TERRA field station (public/models/terra-station.glb, built in
 * hardware/blender/station_v2) at its real position on the MapLibre map, using
 * three.js on the map's own WebGL context. A 1.2 m pod would be under a pixel
 * at field zoom, so it is drawn STATION_MODEL_SCALE times larger, and the legend says so.
 */
export const STATION_MODEL_SCALE = 60;
const MODEL_URL = "/models/terra-station.glb";

export interface StationLayerState {
  name: string;
  position: LatLng;
  visible: boolean;
  /** Terrain exaggeration in use, or 0 when the map is flat */
  terrain: number;
}

export function createStationLayer(getState: () => StationLayerState): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  let model: THREE.Object3D | null = null;

  return {
    id: "station-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-40, 80, 60);
      scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 0.7));
      new GLTFLoader().load(MODEL_URL, (gltf) => {
        const root = gltf.scene;
        // Stand the model on its feet at the origin (glTF is Y-up, metres)
        const box = new THREE.Box3().setFromObject(root);
        const centre = box.getCenter(new THREE.Vector3());
        root.position.set(-centre.x, -box.min.y, -centre.z);
        model = new THREE.Group();
        model.add(root);
        scene.add(model);
        map.triggerRepaint();
      });
    },
    render(gl, args) {
      const state = getState();
      if (!model || !state.visible) return;
      const lngLat: [number, number] = [state.position.lng, state.position.lat];
      const ground = state.terrain ? map.queryTerrainElevation(lngLat) ?? 0 : 0;
      const merc = MercatorCoordinate.fromLngLat(lngLat, ground);
      const metre = merc.meterInMercatorCoordinateUnits() * STATION_MODEL_SCALE;
      // Y-up model -> Z-up mercator; mercator y grows southward, hence the negative scale
      const transform = new THREE.Matrix4()
        .makeTranslation(merc.x, merc.y, merc.z ?? 0)
        .scale(new THREE.Vector3(metre, -metre, metre))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      const projection = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
      camera.projectionMatrix = projection.multiply(transform);
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
    onRemove() {
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      });
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}

/** Screen-space hit test for the drawn model: the vertical segment from its foot to its top. */
export function hitsStation(map: MapLibreMap, state: StationLayerState, point: { x: number; y: number }): boolean {
  if (!state.visible) return false;
  const lngLat: [number, number] = [state.position.lng, state.position.lat];
  const foot = map.project(lngLat);
  const height = 1.22 * STATION_MODEL_SCALE;
  // Approximate the top by moving up the screen in proportion to the pitch
  const metresPerPixel = 40075016 * Math.cos((state.position.lat * Math.PI) / 180) / (512 * 2 ** map.getZoom());
  const topY = foot.y - (height / metresPerPixel) * Math.sin((map.getPitch() * Math.PI) / 180);
  const minY = Math.min(foot.y, topY) - 12;
  const maxY = Math.max(foot.y, topY) + 12;
  const radius = Math.max(14, (0.75 * STATION_MODEL_SCALE) / metresPerPixel);
  return point.y >= minY && point.y <= maxY && Math.abs(point.x - foot.x) <= radius;
}
