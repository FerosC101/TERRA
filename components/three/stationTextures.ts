import * as THREE from "three";

/**
 * Procedural textures for the station's exploded-view parts, drawn on canvases at runtime
 * (no image files). Seeded, so every visit draws the same boards.
 */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, g: c.getContext("2d")! };
}

function finish(c: HTMLCanvasElement, colour = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, light: string, dark: string, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() > 0.5 ? light : dark;
    g.fillRect(r() * w, r() * h, size, size);
  }
}

const cache = new Map<string, THREE.Texture>();
const memo = (key: string, make: () => THREE.Texture) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
};

/** Green solder-mask circuit board with copper traces, vias, pads, silkscreen and mounting holes. */
export function pcbTexture(seed: number, aspect = 1) {
  return memo(`pcb-${seed}-${aspect.toFixed(2)}`, () => {
    const W = 512, H = Math.round(512 / aspect);
    const { c, g } = canvas(W, H);
    const r = rng(seed * 7919);
    const base = g.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, "#1d6a39"); base.addColorStop(1, "#16572e");
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    grain(g, W, H, r, 2600, "rgba(255,255,255,0.035)", "rgba(0,0,0,0.05)", 3);

    // Copper pour around the edge
    g.strokeStyle = "rgba(196,160,80,0.35)"; g.lineWidth = 6;
    g.strokeRect(10, 10, W - 20, H - 20);

    // Traces: Manhattan routes with 45° corners
    g.lineCap = "round"; g.lineJoin = "round";
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(${200 + r() * 30},${165 + r() * 25},${80 + r() * 20},${0.55 + r() * 0.3})`;
      g.lineWidth = r() > 0.8 ? 5 : 2.5;
      let x = Math.round((r() * (W - 60) + 30) / 8) * 8, y = Math.round((r() * (H - 60) + 30) / 8) * 8;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 3 + Math.floor(r() * 4); s++) {
        const d = Math.floor(r() * 4), len = 16 + r() * 110;
        if (d === 0) x += len; else if (d === 1) y += len; else if (d === 2) { x += len * 0.7; y += len * 0.7; } else { x -= len * 0.6; y += len * 0.6; }
        x = Math.min(W - 20, Math.max(20, x)); y = Math.min(H - 20, Math.max(20, y));
        g.lineTo(x, y);
      }
      g.stroke();
      // via at the end
      g.fillStyle = "#c9a24a"; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#0f3a1e"; g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
    }

    // Component footprints: pads with silkscreen outlines and designators
    g.font = "bold 13px ui-monospace, Menlo, monospace";
    const labels = ["U1", "U2", "C4", "C12", "R7", "R22", "J1", "L3", "D2", "Q1", "TP4", "SW1"];
    for (let i = 0; i < 14; i++) {
      const fw = 26 + r() * 50, fh = 14 + r() * 34, fx = 24 + r() * (W - fw - 48), fy = 24 + r() * (H - fh - 48);
      g.fillStyle = "rgba(214,184,104,0.9)";
      const pads = Math.max(2, Math.floor(fw / 9));
      for (let p = 0; p < pads; p++) { g.fillRect(fx + p * (fw / pads) + 2, fy - 5, fw / pads - 4, 5); g.fillRect(fx + p * (fw / pads) + 2, fy + fh, fw / pads - 4, 5); }
      g.strokeStyle = "rgba(240,244,240,0.85)"; g.lineWidth = 1.6;
      g.strokeRect(fx - 4, fy - 9, fw + 8, fh + 18);
      g.fillStyle = "rgba(240,244,240,0.85)";
      g.fillText(labels[i % labels.length], fx, fy - 13);
    }
    // Mounting holes
    for (const [x, y] of [[22, 22], [W - 22, 22], [22, H - 22], [W - 22, H - 22]]) {
      g.fillStyle = "#cfab55"; g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#0d0f0e"; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    }
    return finish(c);
  });
}

/** Top of an IC package: dark epoxy, pin-1 dot and a laser-etched part number. */
export function chipTexture(text: string) {
  return memo(`chip-${text}`, () => {
    const { c, g } = canvas(256, 256);
    const r = rng(text.length * 131 + text.charCodeAt(0));
    g.fillStyle = "#17191b"; g.fillRect(0, 0, 256, 256);
    grain(g, 256, 256, r, 1400, "rgba(255,255,255,0.04)", "rgba(0,0,0,0.12)", 2);
    g.fillStyle = "rgba(255,255,255,0.18)"; g.beginPath(); g.arc(36, 36, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(225,228,230,0.72)"; g.font = "bold 34px ui-monospace, Menlo, monospace"; g.textAlign = "center";
    g.fillText(text, 128, 140);
    return finish(c);
  });
}

/** Front of a LiFePO₄ battery pack: moulded blue casing with a label. */
export function batteryFrontTexture() {
  return memo("battery-front", () => {
    const { c, g } = canvas(320, 384);
    const r = rng(42);
    const body = g.createLinearGradient(0, 0, 0, 384);
    body.addColorStop(0, "#2d64a8"); body.addColorStop(1, "#1f4d86");
    g.fillStyle = body; g.fillRect(0, 0, 320, 384);
    grain(g, 320, 384, r, 3000, "rgba(255,255,255,0.03)", "rgba(0,0,0,0.05)", 2);
    // moulded rim
    g.strokeStyle = "rgba(255,255,255,0.10)"; g.lineWidth = 8; g.strokeRect(10, 10, 300, 364);
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 3; g.strokeRect(18, 18, 284, 348);
    // label
    const lx = 40, ly = 120, lw = 240, lh = 150;
    g.fillStyle = "#e9edf1"; g.fillRect(lx, ly, lw, lh);
    g.fillStyle = "#1f4d86"; g.fillRect(lx, ly, lw, 34);
    g.fillStyle = "#ffffff"; g.font = "bold 22px Inter, system-ui, sans-serif"; g.textAlign = "left";
    g.fillText("LiFePO₄", lx + 14, ly + 25);
    g.fillStyle = "#1e2a35"; g.font = "15px Inter, system-ui, sans-serif";
    g.fillText("Rechargeable cell pack", lx + 14, ly + 60);
    g.fillStyle = "#56616b"; g.font = "12px Inter, system-ui, sans-serif";
    g.fillText("Do not short-circuit", lx + 14, ly + 82);
    // barcode
    for (let i = 0; i < 46; i++) { g.fillStyle = "#1e2a35"; const bw = r() > 0.6 ? 3 : 1.5; g.fillRect(lx + 14 + i * 4.6, ly + 100, bw, 34); }
    // polarity
    g.fillStyle = "rgba(255,255,255,0.75)"; g.font = "bold 30px Inter, system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("+", 80, 72); g.fillText("−", 240, 72);
    return finish(c);
  });
}

/** Plain moulded blue for the pack's other faces. */
export function batterySideTexture() {
  return memo("battery-side", () => {
    const { c, g } = canvas(128, 128);
    const r = rng(7);
    g.fillStyle = "#245899"; g.fillRect(0, 0, 128, 128);
    grain(g, 128, 128, r, 900, "rgba(255,255,255,0.035)", "rgba(0,0,0,0.06)", 2);
    g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = 3; g.strokeRect(6, 6, 116, 116);
    return finish(c);
  });
}

/** Brushed aluminium: fine horizontal streaks (used as colour and roughness). */
export function brushedTexture(tone = 168) {
  return memo(`brushed-${tone}`, () => {
    const { c, g } = canvas(512, 512);
    const r = rng(tone);
    g.fillStyle = `rgb(${tone},${tone + 3},${tone + 7})`; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5200; i++) {
      const v = r() > 0.5 ? 255 : 0;
      g.strokeStyle = `rgba(${v},${v},${v},${0.015 + r() * 0.04})`;
      g.lineWidth = 0.6 + r() * 1.2;
      const y = r() * 512, x = r() * 512;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40 + r() * 380, y + (r() - 0.5) * 1.5); g.stroke();
    }
    return finish(c, true, true);
  });
}

/** Moulded black rubber pad with a raised dot pattern (colour and bump). */
export function rubberPadTexture() {
  return memo("rubber-pad", () => {
    const { c, g } = canvas(256, 256);
    const r = rng(3);
    g.fillStyle = "#1a1b1d"; g.fillRect(0, 0, 256, 256);
    grain(g, 256, 256, r, 1800, "rgba(255,255,255,0.025)", "rgba(0,0,0,0.08)", 2);
    for (let y = 8; y < 256; y += 16) for (let x = (y / 16) % 2 ? 16 : 8; x < 256; x += 16) {
      const gr = g.createRadialGradient(x - 1.5, y - 1.5, 0, x, y, 5);
      gr.addColorStop(0, "#3a3c40"); gr.addColorStop(1, "#1a1b1d");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    }
    return finish(c, true, true);
  });
}

export function disposeStationTextures() {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
