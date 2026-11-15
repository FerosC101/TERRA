"use client";

import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { FieldSceneState } from "@/features/living-field-model/simulation";
import type { DimensionKey } from "@/types";

const VIEWS: Record<DimensionKey, [number, number, number]> = {
  water: [6, 2, 7],
  soil: [4, 1, 5],
  vegetation: [5, 2, 5],
  climate: [8, 6, 9],
  rotation: [3, 10, 5],
};

export default function FieldScene({
  state,
  activeDim,
  follow,
  reset,
}: {
  state: FieldSceneState;
  activeDim: DimensionKey;
  follow: boolean;
  reset: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(state);
  const focus = useRef({ dim: activeDim, follow, reset });
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    focus.current = { dim: activeDim, follow, reset };
  }, [activeDim, follow, reset]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      queueMicrotask(() => setFallback(true));
      return;
    }

    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";
    renderer.domElement.setAttribute("aria-hidden", "true");

    const scene = new T.Scene();
    scene.background = new T.Color("#e9eee7");
    scene.add(new T.HemisphereLight(0xffffff, 0x625344, 2));
    const sun = new T.DirectionalLight(0xfff3d5, 3);
    sun.position.set(3, 8, 4);
    sun.castShadow = true;
    scene.add(sun);

    const camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(7, 5, 8);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0, 0);
    orbit.enableDamping = true;
    orbit.minDistance = 3;
    orbit.maxDistance = 20;
    orbit.maxPolarAngle = Math.PI * 0.65;

    let user = false;
    const manual = () => {
      user = true;
    };
    orbit.addEventListener("start", manual);

    const materials: T.Material[] = [];
    const geometries: T.BufferGeometry[] = [];
    function mat(
      color: string,
      extra: Partial<T.MeshStandardMaterialParameters> = {},
    ) {
      const m = new T.MeshStandardMaterial({ color, ...extra });
      materials.push(m);
      return m;
    }
    function mesh(
      g: T.BufferGeometry,
      m: T.Material,
      x = 0,
      y = 0,
      z = 0,
      parent: T.Object3D = scene,
    ) {
      geometries.push(g);
      const o = new T.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }

    const topmat = mat("#766344");
    const deepmat = mat("#9c7650");
    mesh(new T.BoxGeometry(6, 0.15, 4), topmat, 0, -0.075, 0);
    mesh(new T.BoxGeometry(6, 0.85, 4), deepmat, 0, -0.575, 0);

    // Front cutaway band is symbolic available-water storage, never a groundwater level.
    const water = mesh(
      new T.BoxGeometry(5.9, 1, 0.04),
      mat("#377f9c", { transparent: true, opacity: 0.55, depthWrite: false }),
      0,
      -0.5,
      2.03,
    );

    for (const [depth, color] of [
      [0.1, "#4698c0"],
      [0.4, "#c7b26f"],
    ] as const) {
      mesh(
        new T.CylinderGeometry(0.025, 0.025, depth, 12),
        mat("#bcc6c5"),
        -2.4,
        -depth / 2,
        1.5,
      );
      const tip = mesh(
        new T.SphereGeometry(0.065, 12, 8),
        mat(color, { emissive: color, emissiveIntensity: 0.3 }),
        -2.4,
        -depth,
        1.5,
      );
      tip.name = "Probe " + depth;
    }

    const foliage = mat("#37864a", { roughness: 0.8 });
    const crops = new T.Group();
    scene.add(crops);
    let cropId = "";

    function rebuild(s: FieldSceneState) {
      for (const o of [...crops.children]) {
        o.traverse((n) => {
          if (n instanceof T.Mesh) n.geometry.dispose();
        });
        crops.remove(o);
      }
      if (s.crop.id === "fallow") return;
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 6; col++) {
          const plant = new T.Group();
          plant.position.set(-1.65 + col * 0.65, 0, -1.5 + row * 0.65);
          crops.add(plant);
          const tall = ["corn", "sorghum"].includes(s.crop.id);
          const vine = ["squash", "sweetpotato"].includes(s.crop.id);
          const h = tall ? 1.6 : vine ? 0.22 : 0.65;
          mesh(
            new T.CylinderGeometry(0.014, 0.025, h, 6),
            foliage,
            0,
            h / 2,
            0,
            plant,
          );
          for (let i = 0; i < 6; i++) {
            const leaf = mesh(
              new T.SphereGeometry(1, 8, 5),
              foliage,
              Math.sin(i * 2.4) * 0.16,
              h * (0.22 + i * 0.11),
              Math.cos(i * 2.4) * 0.16,
              plant,
            );
            leaf.scale.set(tall ? 0.32 : 0.2, 0.025, vine ? 0.3 : 0.1);
            leaf.rotation.z = (i % 2 ? 1 : -1) * 0.35;
          }
        }
      }
    }

    const rainGeo = new T.BufferGeometry();
    const positions = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) {
      positions[i * 3] = ((i * 1.618) % 1) * 7 - 3.5;
      positions[i * 3 + 1] = ((i * 0.713) % 1) * 6;
      positions[i * 3 + 2] = ((i * 0.413) % 1) * 5 - 2.5;
    }
    rainGeo.setAttribute("position", new T.BufferAttribute(positions, 3));
    geometries.push(rainGeo);
    const rainMat = new T.PointsMaterial({
      color: "#6f9cb1",
      size: 0.025,
      transparent: true,
      opacity: 0.6,
    });
    materials.push(rainMat);
    const rain = new T.Points(rainGeo, rainMat);
    scene.add(rain);

    const strips = new T.Group();
    scene.add(strips);
    let rotation = "";

    const vaporMat = new T.PointsMaterial({
      color: "#d9dfd0",
      size: 0.06,
      transparent: true,
      opacity: 0,
    });
    materials.push(vaporMat);
    const vapor = new T.Points(rainGeo, vaporMat);
    vapor.scale.set(1, 0.25, 1);
    scene.add(vapor);

    const heat = mesh(
      new T.BoxGeometry(5.9, 0.08, 0.045),
      mat("#ae643c", { transparent: true, opacity: 0 }),
      0,
      -0.1,
      2.06,
    );

    let disposed = false;
    const loader = new GLTFLoader();
    let station: T.Object3D | undefined;
    const disposeModel = (obj: T.Object3D) =>
      obj.traverse((n) => {
        if (n instanceof T.Mesh) {
          n.geometry.dispose();
          for (const m of Array.isArray(n.material)
            ? n.material
            : [n.material]) {
            for (const v of Object.values(m)) {
              if (v instanceof T.Texture) v.dispose();
            }
            m.dispose();
          }
        }
      });

    loader.load(
      "/models/terra-station.glb",
      (g) => {
        if (disposed) {
          disposeModel(g.scene);
          return;
        }
        station = g.scene;
        const b = new T.Box3().setFromObject(station);
        const size = b.getSize(new T.Vector3());
        station.scale.setScalar(1.1 / Math.max(size.y, 0.01));
        const a = new T.Box3().setFromObject(station);
        const c = a.getCenter(new T.Vector3());
        station.position.set(-2.4 - c.x, -a.min.y, 1.5 - c.z);
        scene.add(station);
      },
      undefined,
      () => {
        if (disposed) return;
        mesh(
          new T.CylinderGeometry(0.22, 0.28, 0.75, 16),
          mat("#d5d9d2"),
          -2.4,
          0.4,
          1.5,
        );
        mesh(
          new T.ConeGeometry(0.44, 0.18, 24),
          mat("#182b49"),
          -2.4,
          0.86,
          1.5,
        );
      },
    );

    const halo = mesh(
      new T.TorusGeometry(0.38, 0.018, 8, 40),
      mat("#37864a", { emissive: "#37864a", emissiveIntensity: 0.4 }),
      -2.4,
      0.035,
      1.5,
    );
    halo.rotation.x = Math.PI / 2;

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let lastFocus = "";
    let last = performance.now();

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible || document.hidden) return;

      const s = latest.current;
      const f = focus.current;
      const key = f.dim + ":" + f.reset;
      if (key !== lastFocus) {
        lastFocus = key;
        user = false;
      }
      if (f.follow && !user) {
        const dest = new T.Vector3(...VIEWS[f.dim]);
        camera.position.lerp(dest, reduced.matches ? 1 : 0.08);
        orbit.target.lerp(
          new T.Vector3(0, f.dim === "soil" ? -0.35 : 0, 0),
          reduced.matches ? 1 : 0.08,
        );
      }
      if (cropId !== s.crop.id) {
        cropId = s.crop.id;
        rebuild(s);
      }
      const growth = s.crop.growthFactor;
      crops.scale.set(1, 0.12 + growth * 0.88, 1);
      foliage.color.set(
        s.crop.canopyVigor === null
          ? "#7f895b"
          : s.crop.canopyVigor < 0.4
            ? "#a28b4f"
            : "#37864a",
      );
      crops.rotation.z = reduced.matches ? 0 : Math.sin(now * 0.001) * 0.008;

      topmat.color
        .set("#9a7c53")
        .lerp(new T.Color("#433b2c"), s.soil.wetnessTop);
      water.scale.y = Math.max(0.001, s.metrics.storageRatio);
      water.position.y = -1 + s.metrics.storageRatio * 0.5;
      rainGeo.setDrawRange(0, Math.round(500 * s.weather.rainIntensity));
      if (!reduced.matches) {
        for (let i = 0; i < 500; i++) {
          positions[i * 3 + 1] -= dt * 4;
          if (positions[i * 3 + 1] < 0) positions[i * 3 + 1] = 6;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      vaporMat.opacity = s.weather.evapShimmer * 0.15;
      (heat.material as T.MeshStandardMaterial).opacity = Math.min(
        0.4,
        Math.max(0, ((s.metrics.soilTempC ?? 18) - 18) / 55),
      );
      (halo.material as T.MeshStandardMaterial).color.set(s.stationStatusColor);
      (halo.material as T.MeshStandardMaterial).emissive.set(
        s.stationStatusColor,
      );
      scene.background = new T.Color("#e9eee7").lerp(
        new T.Color("#a0adb4"),
        s.weather.cloudCover,
      );

      const rk = JSON.stringify(s.rotationStrips);
      if (rotation !== rk) {
        rotation = rk;
        for (const o of [...strips.children]) strips.remove(o);
        s.rotationStrips.forEach((r, i) => {
          mesh(
            new T.BoxGeometry(0.7, 0.04, 0.4),
            mat(
              r.isRepeatFamily
                ? "#9a6410"
                : r.isLegume
                  ? "#37864a"
                  : "#928567",
            ),
            -2.4 + i * 0.8,
            0.03,
            -2.3,
            strips,
          );
        });
      }

      orbit.update();
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      orbit.dispose();
      if (station) disposeModel(station);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      className="relative h-[420px] w-full sm:h-[520px]"
      ref={host}
      role="img"
      aria-label="Illustrative field cutaway with crops, station, moisture probes and weather"
    >
      {fallback && (
        <div className="p-6">
          3D is unavailable. {state.crop.name}: {state.metrics.storageMm} mm
          root-zone storage; soil {state.metrics.soilTempC} °C; NDVI{" "}
          {state.metrics.ndvi ?? "unavailable"}; rain {state.metrics.rainMm} mm.
        </div>
      )}
    </div>
  );
}
