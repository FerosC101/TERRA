"use client";

import clsx from "clsx";
import { Boxes, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createExplode, type Explode } from "./stationExplode";

/**
 * Interactive 3D view of the TERRA Field Explorer station.
 * Model: hardware/blender/TERRA_Device_Isolated.glb (copied to public/models).
 *
 * "Explode view" pulls the station apart into its components (see stationExplode.ts) and
 * moves the camera to the exploded-view angle; "Assemble" puts it back together.
 *
 * Drag to rotate, scroll or pinch to zoom. It turns slowly on its own until the
 * user takes control, stops rendering while off-screen, and stays still when the
 * viewer prefers reduced motion. Without WebGL it falls back to a static render.
 */
const MODEL_URL = "/models/terra-station.glb";
const FALLBACK_URL = "/models/terra-station.jpg";

type Status = "loading" | "ready" | "fallback";

export default function StationModel({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const explodeRef = useRef<(on: boolean) => void>(() => {});
  const [status, setStatus] = useState<Status>("loading");
  const [exploded, setExploded] = useState(false);
  const [canExplode, setCanExplode] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL unavailable, show the static render
      setStatus("fallback");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.domElement.style.display = "block";
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;

    scene.environmentIntensity = 0.85;

    // Studio lighting: a soft shadow-casting key, a cool fill and a rim light from behind
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(2, 8, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 10;
    key.shadow.blurSamples = 16;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.01;
    const fill = new THREE.DirectionalLight(0xe8eef5, 0.55);
    fill.position.set(-5, 2.5, 3);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    rim.position.set(-2, 4, -6);
    scene.add(key, fill, rim, new THREE.HemisphereLight(0xffffff, 0xd9ded6, 0.35));

    // Soft contact shadow on an invisible floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    // OrbitControls blocks all touch scrolling. Let vertical swipes scroll the page,
    // so the model never traps a phone user; horizontal swipes still rotate it.
    renderer.domElement.style.touchAction = "pan-y";
    controls.minPolarAngle = Math.PI * 0.12;
    controls.maxPolarAngle = Math.PI * 0.62;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 1.1;
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    let home = { position: new THREE.Vector3(5, 3, 6), target: new THREE.Vector3() };
    let explodeHome = home;
    let explode: Explode | null = null;
    let isExploded = false;

    // Camera move between the assembled and exploded framings
    let fly: { from: THREE.Vector3; fromTarget: THREE.Vector3; to: THREE.Vector3; toTarget: THREE.Vector3; t: number } | null = null;
    const flyTo = (view: { position: THREE.Vector3; target: THREE.Vector3 }) => {
      if (reduceMotion) {
        camera.position.copy(view.position);
        controls.target.copy(view.target);
        controls.update();
        return;
      }
      fly = { from: camera.position.clone(), fromTarget: controls.target.clone(), to: view.position.clone(), toTarget: view.target.clone(), t: 0 };
    };

    resetRef.current = () => {
      fly = null;
      const view = isExploded ? explodeHome : home;
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      controls.autoRotate = !reduceMotion && !isExploded;
      controls.update();
    };
    explodeRef.current = (on: boolean) => {
      if (!explode) return;
      isExploded = on;
      controls.autoRotate = !reduceMotion && !on;
      if (reduceMotion) explode.snap(on);
      else explode.setTarget(on);
      flyTo(on ? explodeHome : home);
    };

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let disposed = false;
    let model: THREE.Object3D | null = null;
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        // Centre the station and frame it with a little room around it
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        model.position.sub(centre);
        scene.add(model);
        floor.position.y = -size.y / 2 - 0.002;

        const radius = size.length() / 2;
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.92;
        const direction = new THREE.Vector3(0.62, 0.32, 0.72).normalize();
        home = { position: direction.multiplyScalar(distance), target: new THREE.Vector3(0, -size.y * 0.04, 0) };
        controls.minDistance = distance * 0.45;
        controls.maxDistance = distance * 1.8;

        explode = createExplode(model);
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
        });
        // Fit the shadow camera to the exploded extent, which contains the assembled one
        const reach = size.length() * 1.1;
        Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.1, far: 30 });
        key.shadow.camera.updateProjectionMatrix();
        if (explode) {
          scene.updateMatrixWorld(true);
          const exBox = explode.explodedBox();
          const exSphere = exBox.getBoundingSphere(new THREE.Sphere());
          const vFov = THREE.MathUtils.degToRad(camera.fov);
          const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.5));
          const exDistance = exSphere.radius / Math.sin(Math.min(vFov, hFov) / 2) * 0.84;
          exSphere.center.y -= exSphere.radius * 0.14;
          explodeHome = { position: exSphere.center.clone().add(explode.viewDirection().multiplyScalar(exDistance)), target: exSphere.center.clone() };
          controls.maxDistance = Math.max(controls.maxDistance, exDistance * 1.6);
          setCanExplode(true);
        }
        resetRef.current();
        setStatus("ready");
      },
      undefined,
      () => { if (!disposed) setStatus("fallback"); },
    );

    // Render only while the viewer is on screen
    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.01 });
    io.observe(el);

    let frame = 0;
    let last = performance.now();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      explode?.update(dt);
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / 1.6);
        const k = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
        camera.position.lerpVectors(fly.from, fly.to, k);
        controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
        if (fly.t === 1) fly = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      explode?.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      key.shadow.map?.dispose();
      model?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      });
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={className}>
      <div ref={host} className="relative h-full w-full cursor-grab active:cursor-grabbing"
        role="img" aria-label="3D model of the TERRA field station. Drag to rotate, scroll to zoom.">
        {status === "fallback" && (
          // eslint-disable-next-line @next/next/no-img-element -- static fallback when WebGL is unavailable
          <img src={FALLBACK_URL} alt="Render of the TERRA field station" className="absolute inset-0 h-full w-full object-contain" />
        )}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted" role="status">Loading 3D model…</div>
        )}
      </div>
      {status !== "loading" && (
        // The station model and its renders were made with SI tools (see si-use.json)
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-ink/70 px-2 py-0.5 text-[10.5px] font-medium text-white">SI-generated model</span>
      )}
      {status === "ready" && (
        <div className="no-print absolute bottom-3 right-3 flex items-center gap-1.5">
          {canExplode && (
            <button type="button" aria-pressed={exploded}
              onClick={() => { const next = !exploded; setExploded(next); explodeRef.current(next); }}
              className={clsx("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium shadow-card transition-colors",
                exploded ? "bg-ink text-white hover:bg-ink-soft" : "bg-surface/90 text-ink-soft hover:text-ink")}>
              {exploded ? <Minimize2 size={13} aria-hidden /> : <Boxes size={13} aria-hidden />}
              {exploded ? "Assemble" : "Explode view"}
            </button>
          )}
          <button type="button" onClick={() => resetRef.current()}
            className="rounded-md bg-surface/90 px-2.5 py-1 text-xs font-medium text-ink-soft shadow-card hover:text-ink">
            Reset view
          </button>
        </div>
      )}
    </div>
  );
}
