"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Interactive 3D view of the TERRA Field Explorer station.
 * Model: hardware/blender/TERRA_Device_Isolated.glb (copied to public/models).
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
  const [status, setStatus] = useState<Status>("loading");

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
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = "block";
    renderer.domElement.setAttribute("aria-hidden", "true");
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(4, 6, 5);
    scene.add(key, new THREE.HemisphereLight(0xffffff, 0xdfe6dc, 0.6));

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
    resetRef.current = () => {
      camera.position.copy(home.position);
      controls.target.copy(home.target);
      controls.autoRotate = !reduceMotion;
      controls.update();
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

        const radius = size.length() / 2;
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.92;
        const direction = new THREE.Vector3(0.62, 0.32, 0.72).normalize();
        home = { position: direction.multiplyScalar(distance), target: new THREE.Vector3(0, -size.y * 0.04, 0) };
        controls.minDistance = distance * 0.45;
        controls.maxDistance = distance * 1.8;
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
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
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
      {status === "ready" && (
        <button type="button" onClick={() => resetRef.current()}
          className="no-print absolute bottom-3 right-3 rounded-md bg-surface/90 px-2.5 py-1 text-xs font-medium text-ink-soft shadow-card hover:text-ink">
          Reset view
        </button>
      )}
    </div>
  );
}
