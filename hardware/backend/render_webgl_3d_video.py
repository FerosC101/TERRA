"""
True Three.js WebGL PBR 3D Video & Poster Renderer for TERRA Autonomous Field Explorer
Built using the MonumentalSystems/Atlas-Agent-Teams `3d-design` 5-phase specialist pipeline:
  1. 3d-analyst: Official TERRA Quad-Legged Solar-Canopy & Multispectral Pod reference breakdown
  2. modeler (skills/modeling): Modular hard-surface octagonal armor, conical 16-segment solar canopy,
     GNSS dome, whip antenna, dual-lens multispectral camera, 4-tier 'Inside TERRA' internal PCB &
     blue LiFePO4 battery stack, 4 articulated outrigger landing legs, and 10/30/60cm soil probes.
  3. texturer (skills/texturing): PBR Metallic-Roughness materials, 2048px solar cell canvas atlas,
     glowing emerald TERRA leaf emblem & wordmark, bead-blasted matte-silver armor, anodized gunmetal.
  4. rigger (skills/rigging): Hierarchical mechanical joint tree (Crown, 4 Armor Plates, 4 Internal
     Tiers, 4 Outrigger Legs with Hip/Strut/Footpad pivots, Subsurface Soil Probes).
  5. animator (skills/animation) & asset-optimizer (skills/asset-optimization): 14-second (420-frame
     @ 30fps) 5-act studio & golden-hour reveal choreography + high-resolution product poster.
"""

from __future__ import annotations
import base64
import io
import json
import math
import os
import shutil
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
import av
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HARDWARE_DIR = "C:/Users/Lenovo/Documents/Nasa/hardware"
ARTIFACT_DIR = "C:/Users/Lenovo/.gemini/antigravity-cli/brain/22297c32-35b8-4163-8faf-5a1423287c1b"
CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe"

VIDEO_OUT = os.path.join(HARDWARE_DIR, "Field_Explorer_3D_Reveal.mp4")
POSTER_OUT = os.path.join(HARDWARE_DIR, "Field_Explorer_Product_Poster.png")
SCREENSHOT_SIM_OUT = os.path.join(HARDWARE_DIR, "Field_Explorer_Simulator_Preview.png")

WIDTH, HEIGHT = 1280, 720
FPS = 30
TOTAL_FRAMES = 420  # 14.0 seconds @ 30fps

RENDER_HTML = r"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1280px;
    height: 720px;
    overflow: hidden;
    background: #06101e;
    font-family: 'Segoe UI', Inter, sans-serif;
  }
  #gl { width: 1280px; height: 720px; display: block; }
</style>
<script src="/three.min.js"></script>
</head>
<body>
<canvas id="gl" width="1280" height="720"></canvas>
<script>
const W = 1280, H = 720;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(33, W / H, 0.1, 120);

// ============================================================================
// PHASE 3B: TEXTURER SKILL — PROCEDURAL PBR TEXTURE ATLASES (2048x2048)
// ============================================================================

// 1. Golden-Hour Agro-Tech Studio & Horizon Backdrop Texture
function makeGoldenHourBackdrop() {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const ctx = c.getContext('2d');

  // Sky to horizon gradient matching official TERRA poster
  const sky = ctx.createLinearGradient(0, 0, 0, 720);
  sky.addColorStop(0.0, '#071426');
  sky.addColorStop(0.32, '#132e4f');
  sky.addColorStop(0.56, '#2b4c65');
  sky.addColorStop(0.68, '#d99b52');
  sky.addColorStop(0.75, '#1a2418');
  sky.addColorStop(1.0, '#090f0b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1280, 720);

  // Golden sunrise glow behind the TERRA pod
  const sun = ctx.createRadialGradient(740, 445, 20, 740, 445, 460);
  sun.addColorStop(0.0, 'rgba(255, 230, 150, 0.82)');
  sun.addColorStop(0.35, 'rgba(245, 158, 11, 0.35)');
  sun.addColorStop(0.7, 'rgba(16, 185, 129, 0.08)');
  sun.addColorStop(1.0, 'rgba(7, 20, 38, 0.0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1280, 720);

  // Subtle emerald bio-tech grid glow in upper sky
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1280; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 460); ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}
scene.background = makeGoldenHourBackdrop();

// 2. Conical 16-Segment Monocrystalline Solar Panel Canopy Texture
function makeSolarCanopyTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 2048;
  const ctx = c.getContext('2d');
  const cx = 1024, cy = 1024;

  // Deep monocrystalline silicon blue base
  const rad = ctx.createRadialGradient(cx, cy, 120, cx, cy, 980);
  rad.addColorStop(0.0, '#0c2d5e');
  rad.addColorStop(0.55, '#0f3d7a');
  rad.addColorStop(0.88, '#082042');
  rad.addColorStop(1.0, '#cbd5e1');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 2048, 2048);

  // Concentric photovoltaic cell wafer rings
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.32)';
  ctx.lineWidth = 3;
  for (let r = 200; r <= 920; r += 48) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Fine micro-busbars
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.20)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 180, cy + Math.sin(a) * 180);
    ctx.lineTo(cx + Math.cos(a) * 930, cy + Math.sin(a) * 930);
    ctx.stroke();
  }

  // 16 Main Silver/White Radial Segment Divider Ribs
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 14;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 165, cy + Math.sin(a) * 165);
    ctx.lineTo(cx + Math.cos(a) * 955, cy + Math.sin(a) * 955);
    ctx.stroke();
  }

  // Outer brushed aluminum rim ring
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 42;
  ctx.beginPath();
  ctx.arc(cx, cy, 960, 0, Math.PI * 2);
  ctx.stroke();

  return new THREE.CanvasTexture(c);
}

// 3. Front Matte-Silver Armor Plate Texture with Glowing Emerald TERRA Leaf Logo & Wordmark
function makeFrontArmorLogoTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1536;
  const ctx = c.getContext('2d');

  // Bead-blasted matte silver aluminum base
  const grad = ctx.createLinearGradient(0, 0, 1024, 1536);
  grad.addColorStop(0.0, '#e2e6ec');
  grad.addColorStop(0.5, '#cfd5de');
  grad.addColorStop(1.0, '#b8c0cc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1536);

  // Subtle recessed panel seam lines
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(44, 44, 936, 1448);

  // Glowing Emerald Green TERRA Leaf Emblem (Lower Half of Front Plate)
  ctx.save();
  ctx.translate(512, 1020);

  // Soft neon emerald outer glow
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur = 42;
  ctx.strokeStyle = '#34d399';
  ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
  ctx.lineWidth = 18;

  // Main leaf contour
  ctx.beginPath();
  ctx.moveTo(-70, 85);
  ctx.bezierCurveTo(-95, -20, -10, -115, 95, -125);
  ctx.bezierCurveTo(95, -10, 35, 85, -70, 85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner leaf vein
  ctx.beginPath();
  ctx.moveTo(-68, 82);
  ctx.quadraticCurveTo(10, 10, 62, -75);
  ctx.stroke();

  // Secondary smaller sprout leaf on left
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-72, 45);
  ctx.bezierCurveTo(-135, 10, -130, -55, -65, -70);
  ctx.bezierCurveTo(-45, -20, -50, 20, -72, 45);
  ctx.stroke();
  ctx.restore();

  // Bold Dark Gunmetal "TERRA" Wordmark below the glowing leaf
  ctx.save();
  ctx.fillStyle = '#1e293b';
  ctx.font = '900 104px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '12px';
  ctx.fillText('TERRA', 512, 1255);
  ctx.restore();

  return new THREE.CanvasTexture(c);
}

// 4. Multi-Layer Green & Gold PCB Texture ("Inside TERRA" Stack)
function makePcbTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#064e3b';
  ctx.fillRect(0, 0, 1024, 1024);

  // Gold & emerald circuit traces
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 4;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(512, 512);
    ctx.lineTo(512 + Math.cos(a) * 450, 512 + Math.sin(a) * 450);
    ctx.stroke();
  }
  ctx.fillStyle = '#fbbf24';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(512 + Math.cos(a) * 435, 512 + Math.sin(a) * 435, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

// ============================================================================
// LIGHTING RIG (Golden-Hour Sun Rim + Cool Sky Dome + Emerald Bio-Tech Fill)
// ============================================================================
const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.92);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
keyLight.position.set(5.5, 8.8, 6.8);
keyLight.castShadow = true;
scene.add(keyLight);

// Golden-hour sunset rim light from back-right
const goldenSunLight = new THREE.DirectionalLight(0xf59e0b, 1.25);
goldenSunLight.position.set(4.5, 2.5, -5.5);
scene.add(goldenSunLight);

// Emerald bio-tech accent light from front-bottom
const emeraldFillLight = new THREE.PointLight(0x10b981, 1.45, 12);
emeraldFillLight.position.set(0.0, -1.2, 3.2);
scene.add(emeraldFillLight);

// Cool cyan rim light from left
const cyanRimLight = new THREE.PointLight(0x38bdf8, 1.0, 15);
cyanRimLight.position.set(-5.0, 3.0, 2.0);
scene.add(cyanRimLight);

// ============================================================================
// FIELD TERRAIN MOUND & CROP ROWS (Matching Reference Ground Context)
// ============================================================================
const terrainGroup = new THREE.Group();
scene.add(terrainGroup);

const soilMat = new THREE.MeshStandardMaterial({
  color: 0x2b1d14,
  roughness: 0.92,
  metalness: 0.05
});
const soilMound = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 5.2, 0.75, 64), soilMat);
soilMound.position.y = -2.22;
soilMound.receiveShadow = true;
terrainGroup.add(soilMound);

// Furrow rings & young emerald crop sprouts in background
const sproutMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5 });
for (let i = 0; i < 28; i++) {
  const ang = (i / 28) * Math.PI * 2;
  const dist = 2.45 + (i % 3) * 0.48;
  if (Math.sin(ang) < 0.55) { // Keep front center clear for soil probe visibility
    const plant = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 6), sproutMat);
    plant.position.set(Math.cos(ang) * dist, -1.72, Math.sin(ang) * dist);
    plant.rotation.z = (Math.random() - 0.5) * 0.25;
    terrainGroup.add(plant);
  }
}

// ============================================================================
// PHASE 3A & 3C: MODELER + RIGGER SKILLS — OFFICIAL TERRA HARDWARE RIG
// ============================================================================
const podRoot = new THREE.Group();
scene.add(podRoot);

// Shared PBR Materials (Asset-Optimizer Skill: Shared Material Instances)
const matSilverArmor = new THREE.MeshStandardMaterial({
  color: 0xd4d9e2,
  roughness: 0.32,
  metalness: 0.28,
  transparent: true,
  opacity: 1.0
});
const matFrontLogoArmor = new THREE.MeshStandardMaterial({
  map: makeFrontArmorLogoTexture(),
  roughness: 0.30,
  metalness: 0.24,
  transparent: true,
  opacity: 1.0
});
const matDarkGunmetal = new THREE.MeshStandardMaterial({
  color: 0x1b222c,
  roughness: 0.42,
  metalness: 0.72
});
const matBrushedAlum = new THREE.MeshStandardMaterial({
  color: 0xe2e8f0,
  roughness: 0.22,
  metalness: 0.82
});
const matNeonEmerald = new THREE.MeshBasicMaterial({ color: 0x34d399 });
const matPcbBoard = new THREE.MeshStandardMaterial({
  map: makePcbTexture(),
  roughness: 0.35,
  metalness: 0.30
});
const matGoldMetal = new THREE.MeshStandardMaterial({
  color: 0xfbbf24,
  roughness: 0.16,
  metalness: 0.94
});
const matBlueBattery = new THREE.MeshStandardMaterial({
  color: 0x1d4ed8,
  roughness: 0.25,
  metalness: 0.22
});

// ----------------------------------------------------------------------------
// 1. TOP CROWN ASSEMBLY (`crownGroup`: Conical Solar Canopy + GNSS Dome + Antenna)
// ----------------------------------------------------------------------------
const crownGroup = new THREE.Group();
podRoot.add(crownGroup);

// 1A. Stepped Dark Gunmetal Neck Collar under Solar Canopy
const solarUnderCollar = new THREE.Mesh(
  new THREE.CylinderGeometry(1.18, 0.98, 0.20, 32),
  matDarkGunmetal
);
solarUnderCollar.position.y = 1.22;
crownGroup.add(solarUnderCollar);

// Gold accent ring under solar collar
const solarGoldTrim = new THREE.Mesh(
  new THREE.CylinderGeometry(1.06, 1.06, 0.04, 32),
  matGoldMetal
);
solarGoldTrim.position.y = 1.13;
crownGroup.add(solarGoldTrim);

// 1B. Conical 16-Segment Solar Panel Canopy ("Solar Panel For Long-Term Operation")
const solarConeMat = new THREE.MeshStandardMaterial({
  map: makeSolarCanopyTexture(),
  roughness: 0.18,
  metalness: 0.55
});
const solarCone = new THREE.Mesh(
  new THREE.CylinderGeometry(0.42, 1.54, 0.36, 32),
  solarConeMat
);
solarCone.position.y = 1.48;
solarCone.castShadow = true;
crownGroup.add(solarCone);

// Brushed silver outer rim around solar canopy perimeter
const solarRim = new THREE.Mesh(
  new THREE.TorusGeometry(1.53, 0.042, 16, 64),
  matBrushedAlum
);
solarRim.rotation.x = Math.PI / 2;
solarRim.position.y = 1.31;
crownGroup.add(solarRim);

// 16 Raised 3D Silver Divider Ribs along the conical slope
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2;
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.025, 1.16), matBrushedAlum);
  const midR = 0.98;
  rib.position.set(Math.cos(a) * midR, 1.49, Math.sin(a) * midR);
  rib.rotation.y = -a + Math.PI / 2;
  rib.rotation.x = 0.30;
  crownGroup.add(rib);
}

// 1C. Central Stepped Black Mast & White Mushroom GNSS Dome ("GNSS & Communication")
const gnssMastBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.38, 0.44, 0.14, 32),
  matDarkGunmetal
);
gnssMastBase.position.y = 1.70;
crownGroup.add(gnssMastBase);

const gnssMastNeck = new THREE.Mesh(
  new THREE.CylinderGeometry(0.22, 0.25, 0.26, 32),
  matDarkGunmetal
);
gnssMastNeck.position.y = 1.88;
crownGroup.add(gnssMastNeck);

// Small glowing green sync LED dot on front of GNSS neck
const gnssNeckLed = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), matNeonEmerald);
gnssNeckLed.position.set(0, 1.88, 0.24);
crownGroup.add(gnssNeckLed);

// White Mushroom GNSS Receiver Cap
const gnssDomeMat = new THREE.MeshStandardMaterial({
  color: 0xf8fafc,
  roughness: 0.22,
  metalness: 0.08
});
const gnssDome = new THREE.Mesh(new THREE.SphereGeometry(0.36, 36, 24), gnssDomeMat);
gnssDome.scale.set(1.0, 0.48, 1.0);
gnssDome.position.y = 2.06;
gnssDome.castShadow = true;
crownGroup.add(gnssDome);

// 1D. Right-Side Vertical Auto-Sync Whip Antenna with Glowing White Beacon Tip
const antGroup = new THREE.Group();
antGroup.position.set(0.56, 1.62, -0.15);
crownGroup.add(antGroup);

const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.18, 16), matBrushedAlum);
antGroup.add(antBase);

const antRod = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, 0.72, 16), matDarkGunmetal);
antRod.position.y = 0.42;
antGroup.add(antRod);

const antBeaconTip = new THREE.Mesh(
  new THREE.SphereGeometry(0.048, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
antBeaconTip.position.y = 0.80;
antGroup.add(antBeaconTip);

const antPointLight = new THREE.PointLight(0xe0f2fe, 0.9, 3.0);
antPointLight.position.y = 0.82;
antGroup.add(antPointLight);

// ----------------------------------------------------------------------------
// 2. "INSIDE TERRA" 4-TIER INTERNAL STACK (`tier1Group`..`tier4Group`)
//    Matches the "Inside TERRA" exploded cutaway at bottom-left of reference!
// ----------------------------------------------------------------------------
const internalStackGroup = new THREE.Group();
podRoot.add(internalStackGroup);

// 4 Vertical Silver Structural Standoff Rods linking the internal stack
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 1.95, 12),
    matBrushedAlum
  );
  rod.position.set(Math.cos(a) * 0.68, 0.0, Math.sin(a) * 0.68);
  internalStackGroup.add(rod);
}

// Tier 1: Sensor Module PCB (Upper environmental & optical interface deck)
const tier1SensorGroup = new THREE.Group();
tier1SensorGroup.position.y = 0.82;
internalStackGroup.add(tier1SensorGroup);

const tier1Pcb = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.05, 32), matPcbBoard);
tier1SensorGroup.add(tier1Pcb);

for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  const ic = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.14), matDarkGunmetal);
  ic.position.set(Math.cos(a) * 0.48, 0.05, Math.sin(a) * 0.48);
  tier1SensorGroup.add(ic);
}

// Tier 2: Edge AI Processor Deck (ESP32-S3 / STM32 + Multi-Board Neural Compute)
const tier2EdgeAiGroup = new THREE.Group();
tier2EdgeAiGroup.position.y = 0.34;
internalStackGroup.add(tier2EdgeAiGroup);

const tier2Pcb = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.055, 32), matPcbBoard);
tier2EdgeAiGroup.add(tier2Pcb);

// Central ESP32-S3 / STM32 Processor Package + Gold Heatsink Frame
const edgeMcu = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.46), matDarkGunmetal);
edgeMcu.position.set(0, 0.06, 0.12);
tier2EdgeAiGroup.add(edgeMcu);

// Vertical green daughterboard cards with white/gold connectors (matches "Inside TERRA" cutaway)
for (let s = -1; s <= 1; s += 2) {
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.36, 0.62), matPcbBoard);
  card.position.set(s * 0.38, 0.18, 0.0);
  tier2EdgeAiGroup.add(card);

  const goldBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.56), matGoldMetal);
  goldBar.position.set(s * 0.38, 0.34, 0.0);
  tier2EdgeAiGroup.add(goldBar);
}
// Glowing green Edge AI status LEDs
for (let i = -2; i <= 2; i++) {
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), matNeonEmerald);
  led.position.set(i * 0.12, 0.08, 0.58);
  tier2EdgeAiGroup.add(led);
}

// Tier 3: Sensor & LoRaWAN Telemetry Interface Ring
const tier3BusGroup = new THREE.Group();
tier3BusGroup.position.y = -0.15;
internalStackGroup.add(tier3BusGroup);

const tier3Pcb = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.05, 32), matPcbBoard);
tier3BusGroup.add(tier3Pcb);

const loraShield = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.28), matBrushedAlum);
loraShield.position.set(-0.25, 0.09, 0.25);
tier3BusGroup.add(loraShield);

const goldConn = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.22), matGoldMetal);
goldConn.position.set(0.28, 0.08, 0.28);
tier3BusGroup.add(goldConn);

// Tier 4: "Reliable Battery" — Bright-Blue Prismatic & Cylindrical LiFePO4 Battery Pack!
const tier4BatteryGroup = new THREE.Group();
tier4BatteryGroup.position.y = -0.68;
internalStackGroup.add(tier4BatteryGroup);

const battTray = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.06, 32), matDarkGunmetal);
battTray.position.y = -0.22;
tier4BatteryGroup.add(battTray);

// Central bright-blue prismatic LiFePO4 block + surrounding cylindrical blue cells
const mainBluePack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.52), matBlueBattery);
mainBluePack.position.set(0, 0.03, 0.12);
tier4BatteryGroup.add(mainBluePack);

for (let c = 0; c < 6; c++) {
  const a = (c / 6) * Math.PI * 2;
  const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 20), matBlueBattery);
  cell.position.set(Math.cos(a) * 0.54, 0.02, Math.sin(a) * 0.54);
  tier4BatteryGroup.add(cell);

  const term = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), matBrushedAlum);
  term.position.set(Math.cos(a) * 0.54, 0.24, Math.sin(a) * 0.54);
  tier4BatteryGroup.add(term);
}

// ----------------------------------------------------------------------------
// 3. WEATHERPROOF OCTAGONAL CORE & 4 BEVELED SILVER ARMOR PLATES (`armorGroup`)
// ----------------------------------------------------------------------------
const armorGroup = new THREE.Group();
podRoot.add(armorGroup);

// Inner Dark-Gunmetal Octagonal Frame (visible at the 4 diagonal corners)
const coreOctagon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.95, 0.98, 2.02, 8, 1, true),
  matDarkGunmetal
);
coreOctagon.rotation.y = Math.PI / 8;
coreOctagon.position.y = 0.06;
armorGroup.add(coreOctagon);

// Vertical Glowing Emerald-Green LED Accent Strips in the front-left & front-right seams
[-0.54, 0.54].forEach(xPos => {
  const seamStrip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1.56, 0.032), matNeonEmerald);
  seamStrip.position.set(xPos, 0.06, 0.78);
  armorGroup.add(seamStrip);
});

// Wireframe X-Ray Cage for "Inside TERRA" X-Ray mode
const wireCageMat = new THREE.MeshBasicMaterial({
  color: 0x34d399,
  wireframe: true,
  transparent: true,
  opacity: 0.0
});
const wireCageMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(1.06, 1.08, 2.02, 16, 6),
  wireCageMat
);
wireCageMesh.position.y = 0.06;
armorGroup.add(wireCageMesh);

// 4 Detachable Beveled Matte-Silver Armor Plates (North/Front, South, East, West)
const armorPlateNorth = new THREE.Group(); // Front Plate (+Z): Multispectral Camera + TERRA Logo
const armorPlateSouth = new THREE.Group(); // Back Plate (-Z)
const armorPlateEast = new THREE.Group();  // Right Plate (+X): Sensor Chamber
const armorPlateWest = new THREE.Group();  // Left Plate (-X): Sensor Chamber
armorGroup.add(armorPlateNorth, armorPlateSouth, armorPlateEast, armorPlateWest);

// Front Armor Plate (+Z) with Logo Texture
const frontPlateMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.94, 1.94, 0.10),
  matFrontLogoArmor
);
frontPlateMesh.position.set(0, 0.06, 0.96);
frontPlateMesh.castShadow = true;
armorPlateNorth.add(frontPlateMesh);

// Corner Hex Bolts on Front Plate
const boltCoords = [[-0.38, 0.88], [0.38, 0.88], [-0.38, 0.05], [0.38, 0.05], [-0.38, -0.78], [0.38, -0.78]];
boltCoords.forEach(([bx, by]) => {
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 6), matDarkGunmetal);
  bolt.rotation.x = Math.PI / 2;
  bolt.position.set(bx, by, 1.015);
  armorPlateNorth.add(bolt);
});

// Front Dual-Lens Multispectral Camera Module ("Multispectral Camera - Crop Health Analysis")
const camHousing = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.64, 0.12),
  matDarkGunmetal
);
camHousing.position.set(0, 0.46, 1.00);
armorPlateNorth.add(camHousing);

// Primary Upper Multispectral Lens Barrel + Sapphire-Blue Coated Optical Glass
const mainLensRing = new THREE.Mesh(
  new THREE.CylinderGeometry(0.155, 0.165, 0.08, 32),
  matBrushedAlum
);
mainLensRing.rotation.x = Math.PI / 2;
mainLensRing.position.set(0, 0.56, 1.04);
armorPlateNorth.add(mainLensRing);

const lensGlassMat = new THREE.MeshStandardMaterial({
  color: 0x0284c7,
  roughness: 0.06,
  metalness: 0.88
});
const mainLensGlass = new THREE.Mesh(
  new THREE.SphereGeometry(0.135, 28, 20),
  lensGlassMat
);
mainLensGlass.scale.set(1.0, 1.0, 0.38);
mainLensGlass.position.set(0, 0.56, 1.065);
armorPlateNorth.add(mainLensGlass);

// Secondary Lower NIR / Thermal Lens
const subLensRing = new THREE.Mesh(
  new THREE.CylinderGeometry(0.085, 0.095, 0.07, 24),
  matBrushedAlum
);
subLensRing.rotation.x = Math.PI / 2;
subLensRing.position.set(0, 0.28, 1.035);
armorPlateNorth.add(subLensRing);

const subLensGlass = new THREE.Mesh(
  new THREE.SphereGeometry(0.072, 20, 16),
  lensGlassMat
);
subLensGlass.scale.set(1.0, 1.0, 0.35);
subLensGlass.position.set(0, 0.28, 1.055);
armorPlateNorth.add(subLensGlass);

// Camera Status Green Indicator Dot
const camLed = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), matNeonEmerald);
camLed.position.set(-0.15, 0.56, 1.065);
armorPlateNorth.add(camLed);

// Back Armor Plate (-Z)
const backPlateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.94, 0.10), matSilverArmor);
backPlateMesh.position.set(0, 0.06, -0.96);
armorPlateSouth.add(backPlateMesh);

// East (+X) & West (-X) Flank Armor Plates with Louvered "Sensor Chamber (Weather & Environment)"
[
  { grp: armorPlateEast, sign: 1 },
  { grp: armorPlateWest, sign: -1 }
].forEach(({ grp, sign }) => {
  const sidePlate = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.94, 0.94), matSilverArmor);
  sidePlate.position.set(sign * 0.96, 0.06, 0);
  sidePlate.castShadow = true;
  grp.add(sidePlate);

  // Recessed Dark Gunmetal Weather & Environment Sensor Chamber Slot
  const chamberBox = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.86, 0.28), matDarkGunmetal);
  chamberBox.position.set(sign * 0.985, 0.04, 0);
  grp.add(chamberBox);

  // Louvered intake gills inside Sensor Chamber
  for (let l = -4; l <= 4; l++) {
    const gill = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.22), matBrushedAlum);
    gill.position.set(sign * 1.025, 0.04 + l * 0.08, 0);
    grp.add(gill);
  }
});

// ----------------------------------------------------------------------------
// 4. HEAVY BASE COLLAR, DUAL GREEN BUMPER LEDS, 4 OUTRIGGER LEGS & SOIL PROBES
// ----------------------------------------------------------------------------
const baseAndLegsGroup = new THREE.Group();
podRoot.add(baseAndLegsGroup);

// Heavy Octagonal Dark-Gunmetal Base Collar
const baseCollar = new THREE.Mesh(
  new THREE.CylinderGeometry(1.06, 1.14, 0.46, 8),
  matDarkGunmetal
);
baseCollar.rotation.y = Math.PI / 8;
baseCollar.position.y = -1.18;
baseAndLegsGroup.add(baseCollar);

// 4 Silver Bumper Cladding Panels around the Base Collar
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2;
  const fender = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.28, 0.08), matSilverArmor);
  fender.position.set(Math.cos(a) * 1.04, -1.14, Math.sin(a) * 1.04);
  fender.rotation.y = -a + Math.PI / 2;
  baseAndLegsGroup.add(fender);
}

// Front Bumper Dual Horizontal Glowing Emerald-Green LED Bars (Signature Reference Detail!)
const frontBumperPod = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.24, 0.12), matDarkGunmetal);
frontBumperPod.position.set(0, -1.28, 1.05);
baseAndLegsGroup.add(frontBumperPod);

const ledBarTop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.032, 0.04), matNeonEmerald);
ledBarTop.position.set(0, -1.24, 1.10);
baseAndLegsGroup.add(ledBarTop);

const ledBarBot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.032, 0.04), matNeonEmerald);
ledBarBot.position.set(0, -1.32, 1.10);
baseAndLegsGroup.add(ledBarBot);

// 4 Angled Mechanical Outrigger Landing Legs (45°, 135°, 225°, 315°)
const legPivots = [];
for (let i = 0; i < 4; i++) {
  const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
  const legRoot = new THREE.Group();
  legRoot.position.set(Math.cos(angle) * 0.94, -1.16, Math.sin(angle) * 0.94);
  legRoot.rotation.y = -angle + Math.PI / 2;
  baseAndLegsGroup.add(legRoot);

  // Hip Mounting Clevis Bracket
  const hipBracket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.26), matDarkGunmetal);
  legRoot.add(hipBracket);

  // Articulated Strut Assembly (Splayed outward at 42 degrees)
  const strutPivot = new THREE.Group();
  strutPivot.rotation.x = 0.68;
  legRoot.add(strutPivot);
  legPivots.push(strutPivot);

  // Dark Structural Inner Leg Beam
  const innerBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.88, 0.16), matDarkGunmetal);
  innerBeam.position.set(0, -0.38, 0.22);
  strutPivot.add(innerBeam);

  // Matte-Silver Beveled Outer Leg Armor Shroud
  const legArmor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.76, 0.08), matSilverArmor);
  legArmor.position.set(0, -0.36, 0.30);
  legArmor.castShadow = true;
  strutPivot.add(legArmor);

  // Dark Recessed Center Slot on Leg Shroud
  const legSlot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.09), matDarkGunmetal);
  legSlot.position.set(0, -0.36, 0.305);
  strutPivot.add(legSlot);

  // Articulated Horizontal Ground Footpad
  const footpad = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.10, 0.38), matDarkGunmetal);
  footpad.rotation.x = -0.68;
  footpad.position.set(0, -0.78, 0.30);
  footpad.castShadow = true;
  strutPivot.add(footpad);
}

// Subsurface Soil Moisture, Temperature & EC Probes ("Soil Probes - Moisture & Temperature")
const probesGroup = new THREE.Group();
baseAndLegsGroup.add(probesGroup);

const probeConfigs = [
  { x: -0.36, z: 0.22, len: 0.72 },
  { x: 0.0,   z: 0.32, len: 1.05 },
  { x: 0.36,  z: 0.22, len: 1.35 },
  { x: -0.22, z: -0.26, len: 0.90 },
  { x: 0.22,  z: -0.26, len: 1.15 }
];
probeConfigs.forEach(p => {
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.024, p.len, 16),
    matBrushedAlum
  );
  rod.position.set(p.x, -1.40 - p.len / 2, p.z);
  probesGroup.add(rod);

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.028, 0.09, 16),
    matGoldMetal
  );
  tip.rotation.x = Math.PI;
  tip.position.set(p.x, -1.40 - p.len - 0.04, p.z);
  probesGroup.add(tip);
});

// Animated Subsurface Dielectric & Thermal Sensing Rings/Rays
const sensingWavesGroup = new THREE.Group();
podRoot.add(sensingWavesGroup);

for (let w = 0; w < 4; w++) {
  const waveRing = new THREE.Mesh(
    new THREE.RingGeometry(0.35 + w * 0.28, 0.38 + w * 0.28, 48),
    new THREE.MeshBasicMaterial({
      color: w % 2 === 0 ? 0x34d399 : 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55 - w * 0.1
    })
  );
  waveRing.rotation.x = -Math.PI / 2;
  waveRing.position.y = -1.78 - w * 0.16;
  sensingWavesGroup.add(waveRing);
}

// ============================================================================
// PHASE 3C & 3D: MECHANICAL RIG CONSTRAINTS & 5-ACT ANIMATION CHOREOGRAPHY
// ============================================================================
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function applyTerraRig(explode, plateSpread, xray, tSec) {
  // 1. Staggered Vertical Separation ("Inside TERRA" Stack + Solar Crown + Base)
  crownGroup.position.y = explode * 1.18;
  tier1SensorGroup.position.y = 0.82 + explode * 0.72;
  tier2EdgeAiGroup.position.y = 0.34 + explode * 0.32;
  tier3BusGroup.position.y = -0.15 - explode * 0.08;
  tier4BatteryGroup.position.y = -0.68 - explode * 0.42;
  baseAndLegsGroup.position.y = -explode * 0.75;

  // 2. Radial Outward Separation of the 4 Beveled Silver Armor Plates
  armorPlateNorth.position.z = plateSpread * 0.85;
  armorPlateSouth.position.z = -plateSpread * 0.85;
  armorPlateEast.position.x = plateSpread * 0.85;
  armorPlateWest.position.x = -plateSpread * 0.85;

  // 3. Wireframe X-Ray Opacity Cross-Fade
  const solidOpacity = Math.max(0.08, 1.0 - xray * 0.88);
  matSilverArmor.opacity = solidOpacity;
  matFrontLogoArmor.opacity = solidOpacity;
  wireCageMat.opacity = xray * 0.85;

  // 4. Secondary Motion: Pulsing Subsurface Sensing Waves
  sensingWavesGroup.rotation.y = tSec * 0.9;
  sensingWavesGroup.position.y = -explode * 0.75;
}

window.setFrameTime = function(tSec) {
  let explode = 0, plateSpread = 0, xray = 0;
  let camAngle = 0.26, camPitch = 0.06, camDist = 6.35;
  let targetX = 0.0, targetY = 0.02, targetZ = 0.0;

  terrainGroup.visible = true;
  sensingWavesGroup.visible = false;

  if (tSec < 2.6) {
    // ACT 1 (0:00 - 0:02.6): Official TERRA Hero Golden-Hour Lockup & Staggered Explosion
    const p = smoothstep(0.65, 2.45, tSec);
    explode = p * 0.78;
    plateSpread = smoothstep(1.0, 2.5, tSec) * 0.55;
    xray = 0.0;
    camAngle = 0.24 - p * 0.14;
    camPitch = 0.06 + p * 0.04;
    camDist = 7.85 + p * 0.55;
    targetY = 0.12;
  } else if (tSec < 5.5) {
    // ACT 2 (0:02.6 - 0:05.5): Low-Angle Swoop to Quad Outrigger Legs, Dual Green LEDs & Soil Probes
    const p = (tSec - 2.6) / 2.9;
    explode = 0.45;
    plateSpread = 0.15;
    xray = 0.0;
    terrainGroup.visible = false; // Reveal full subsurface 10/30/60cm soil probes & sensing waves
    sensingWavesGroup.visible = true;
    camAngle = -0.35 + p * 0.82;
    camPitch = -0.16 + p * 0.14;
    camDist = 4.95;
    targetX = 0.0;
    targetY = -1.25;
    targetZ = 0.0;
  } else if (tSec < 8.5) {
    // ACT 3 (0:05.5 - 0:08.5): Multispectral Camera Macro & "Inside TERRA" Wireframe X-Ray Cutaway
    const p = (tSec - 5.5) / 3.0;
    explode = smoothstep(6.0, 7.6, tSec) * 0.72;
    plateSpread = smoothstep(6.1, 7.5, tSec) * 0.78;
    xray = smoothstep(5.9, 7.0, tSec);
    coreOctagon.visible = (xray < 0.45);
    terrainGroup.visible = false;
    sensingWavesGroup.visible = true;
    camAngle = -0.28 + p * 0.62;
    camPitch = 0.05;
    camDist = 5.45 + explode * 0.75;
    targetX = 0.0;
    targetY = 0.02;
    targetZ = 0.0;
  } else if (tSec < 11.2) {
    // ACT 4 (0:08.5 - 0:11.2): Conical 16-Segment Solar Canopy, GNSS Dome, Whip Antenna & Edge AI Stack
    const p = (tSec - 8.5) / 2.7;
    explode = 0.76;
    plateSpread = 0.35;
    xray = 0.25;
    coreOctagon.visible = true;
    terrainGroup.visible = false;
    camAngle = 0.22 + p * 0.95;
    camPitch = 0.34;
    camDist = 5.25;
    targetX = 0.0;
    targetY = 1.25;
    targetZ = 0.0;
  } else {
    // ACT 5 (0:11.2 - 0:14.0): Precision Mechanical Re-Assembly & Final TERRA Hero Lockup
    const p = smoothstep(11.2, 12.85, tSec);
    explode = 0.76 * (1.0 - p);
    plateSpread = 0.35 * (1.0 - p);
    xray = 0.25 * (1.0 - p);
    coreOctagon.visible = true;
    terrainGroup.visible = true;
    camAngle = 0.24;
    camPitch = 0.06;
    camDist = 8.35 - p * 0.55;
    targetY = 0.12;
  }

  applyTerraRig(explode, plateSpread, xray, tSec);

  const cx = targetX + Math.sin(camAngle) * Math.cos(camPitch) * camDist;
  const cy = targetY + Math.sin(camPitch) * camDist;
  const cz = targetZ + Math.cos(camAngle) * Math.cos(camPitch) * camDist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(targetX, targetY, targetZ);

  renderer.render(scene, camera);
  return canvas.toDataURL('image/jpeg', 0.95);
};

// Dedicated high-detail renders for the Product Poster ("Hero Pod" + "Inside TERRA Cutaway")
window.renderPosterViews = function() {
  // 1. Hero Assembled View (Framed so GNSS whip to 4 outrigger legs sit above bottom cards)
  terrainGroup.visible = true;
  sensingWavesGroup.visible = false;
  coreOctagon.visible = true;
  applyTerraRig(0.0, 0.0, 0.0, 0.0);
  camera.position.set(Math.sin(0.24) * 8.6, 0.45, Math.cos(0.24) * 8.6);
  camera.lookAt(0.42, -0.32, 0);
  renderer.render(scene, camera);
  const heroDataUrl = canvas.toDataURL('image/png');

  // 2. "Inside TERRA" Vertical Exploded Stack View (matches bottom-left card of reference)
  terrainGroup.visible = false;
  sensingWavesGroup.visible = false;
  coreOctagon.visible = false;
  applyTerraRig(0.78, 0.0, 0.92, 2.0);
  armorPlateNorth.visible = false;
  armorPlateSouth.visible = false;
  armorPlateEast.visible = false;
  armorPlateWest.visible = false;
  camera.position.set(Math.sin(0.20) * 8.2, 0.25, Math.cos(0.20) * 8.2);
  camera.lookAt(0, 0.02, 0);
  renderer.render(scene, camera);
  const insideDataUrl = canvas.toDataURL('image/png');

  coreOctagon.visible = true;
  armorPlateNorth.visible = true;
  armorPlateSouth.visible = true;
  armorPlateEast.visible = true;
  armorPlateWest.visible = true;
  return { heroDataUrl, insideDataUrl };
};

async function runBatchCapture() {
  const posterViews = window.renderPosterViews();
  await fetch('/poster_views', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(posterViews)
  });

  for (let i = 0; i < 420; i++) {
    const tSec = i / 30.0;
    const dataUrl = window.setFrameTime(tSec);
    await fetch('/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idx: i, t: tSec, dataUrl })
    });
  }
  await fetch('/done', { method: 'POST' });
}

window.addEventListener('load', () => {
  setTimeout(runBatchCapture, 150);
});
</script>
</body>
</html>
"""


def get_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_callout_tag(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    target_pt: tuple[int, int],
    title: str,
    sub: str,
    accent: tuple[int, int, int, int] = (52, 211, 153, 235),
) -> None:
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=8, fill=(8, 20, 34, 205), outline=accent, width=2)
    f_b = get_font(13, bold=True)
    f_r = get_font(11, bold=False)
    draw.text((x0 + 10, y0 + 6), title, font=f_b, fill=(248, 250, 252, 255))
    draw.text((x0 + 10, y0 + 24), sub, font=f_r, fill=(167, 243, 208, 255))

    # Leader line + glowing dot on 3D hardware feature
    anchor_x = x1 if target_pt[0] > x1 else (x0 if target_pt[0] < x0 else (x0 + x1) // 2)
    anchor_y = (y0 + y1) // 2
    draw.line([(anchor_x, anchor_y), target_pt], fill=(226, 232, 240, 210), width=2)
    tx, ty = target_pt
    draw.ellipse([tx - 4, ty - 4, tx + 4, ty + 4], fill=accent, outline=(255, 255, 255, 255))


def add_hud_caption_to_pil(img: Image.Image, t_sec: float) -> Image.Image:
    rgba = img.convert("RGBA")
    overlay = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    f_brand = get_font(26, bold=True)
    f_tag = get_font(12, bold=True)
    f_title = get_font(16, bold=True)
    f_sub = get_font(13, bold=False)

    # Top-left TERRA Brand Header (matching reference poster)
    draw.rounded_rectangle([24, 20, 355, 86], radius=10, fill=(6, 16, 30, 185), outline=(16, 185, 129, 160), width=1)
    draw.text((38, 25), "TERRA", font=f_brand, fill=(248, 250, 252, 255))
    draw.text((132, 25), "FIELD EXPLORER", font=get_font(16, bold=True), fill=(52, 211, 153, 255))
    draw.text((38, 60), "DISCOVER  •  PREDICT  •  REGENERATE", font=f_tag, fill=(110, 231, 183, 255))

    # Dynamic 3D Callouts per Act
    if t_sec < 2.6:
        stage = "ACT 1 • OFFICIAL TERRA AUTONOMOUS FIELD EXPLORER & MODULAR SEPARATION"
        sub = "Conical Solar Canopy • GNSS Auto-Sync • Multispectral Camera • Quad-Leg Stabilizer Base"
        if t_sec < 1.1:
            draw_callout_tag(draw, (70, 145, 315, 192), (535, 175), "Solar Panel Canopy", "16-Segment Monocrystalline Array")
            draw_callout_tag(draw, (860, 110, 1135, 157), (695, 110), "GNSS & Communication", "Auto-Sync Satellite + LoRaWAN")
            draw_callout_tag(draw, (70, 275, 320, 322), (620, 290), "Multispectral Camera", "Dual-Lens Crop Health Analysis")
            draw_callout_tag(draw, (860, 320, 1125, 367), (735, 345), "Sensor Chamber", "Weather & Microclimate Intake")
            draw_callout_tag(draw, (70, 470, 315, 517), (530, 520), "Quad Outrigger Base", "Soil Probes (Moisture & Temp)")
    elif t_sec < 5.5:
        stage = "ACT 2 • QUAD OUTRIGGER LANDING LEGS & SUBSURFACE SOIL PROBES (10 / 30 / 60 cm)"
        sub = "Articulated Mechanical Stabilizer Legs • Dual Emerald Bumper LEDs • Multi-Depth FDR & EC Rods"
        draw_callout_tag(draw, (65, 420, 340, 467), (540, 430), "Quad Stabilizer Legs", "Rugged All-Terrain Outrigger Struts")
        draw_callout_tag(draw, (855, 455, 1165, 502), (650, 515), "Soil Probes (10/30/60 cm)", "Moisture, Temperature & Pore-Water EC")
    elif t_sec < 8.5:
        stage = "ACT 3 • 'INSIDE TERRA' WIREFRAME X-RAY CUTAWAY & 4-TIER INTERNAL STACK"
        sub = "Tier 1: Sensor Module • Tier 2: Edge AI Processor (ESP32-S3/STM32) • Tier 4: Blue LiFePO4 Battery"
        draw_callout_tag(draw, (850, 195, 1165, 242), (665, 225), "Sensor Module PCB", "I2C / SPI / RS-485 Environmental Hub")
        draw_callout_tag(draw, (850, 295, 1165, 342), (665, 315), "Edge AI Processor", "On-Device Z-Score Anomaly Detection")
        draw_callout_tag(draw, (850, 415, 1165, 462), (665, 445), "Reliable LiFePO4 Battery", "6.4V 12Ah Prismatic & Cell Pack")
    elif t_sec < 11.2:
        stage = "ACT 4 • CONICAL SOLAR CANOPY, GNSS DOME & EDGE AI COMPUTE DECK"
        sub = "10W Radial Photovoltaic Canopy • Mushroom GNSS Receiver • Telescopic Auto-Sync Whip Antenna"
        draw_callout_tag(draw, (75, 165, 355, 212), (560, 240), "Solar Panel Canopy", "Long-Term Autonomous Field Operation")
        draw_callout_tag(draw, (855, 145, 1155, 192), (660, 165), "GNSS & Auto-Sync Mast", "RTK-Ready Geolocation + LoRa Whip")
    else:
        stage = "ACT 5 • TERRA AUTONOMOUS INTELLIGENCE SYSTEM FOR CLIMATE-RESILIENT AGRICULTURE"
        sub = "Fusing Local Multi-Depth Soil & Crop Health Data with NASA NISAR, SMAP L4 & ECOSTRESS"
        draw_callout_tag(draw, (845, 210, 1195, 262), (650, 285), "Field Health: 87 / 100 (Healthy)", "Next Action: Consider Legume Rotation")

    # Bottom HUD Caption Bar
    draw.rounded_rectangle(
        [24, HEIGHT - 74, 835, HEIGHT - 18],
        radius=11,
        fill=(6, 16, 30, 210),
        outline=(16, 185, 129, 210),
        width=2,
    )
    draw.text((42, HEIGHT - 65), stage, font=f_title, fill=(240, 253, 244, 255))
    draw.text((42, HEIGHT - 41), sub, font=f_sub, fill=(167, 243, 208, 255))

    rgba.alpha_composite(overlay)
    return rgba.convert("RGB")


def build_product_poster(hero_img: Image.Image, inside_img: Image.Image) -> Image.Image:
    """
    Composites the high-resolution TERRA Product & Architecture Showcase Poster
    matching the exact visual structure of uploaded_media_1794640205248.jpg:
      - Top Left: TERRA Brand + Discover / Understand / Adapt pillars
      - Top Center: 3D TERRA Hardware Pod with 5 callouts
      - Top Right: TERRA Live Field Health (87/100) + Rotation Simulator tablet UI
      - Bottom 4 Cards: Inside TERRA (with 3D cutaway), Sensor Suite, How TERRA Works, Real-World Impact
    """
    W_P, H_P = 1600, 1060
    poster = Image.new("RGBA", (W_P, H_P), (6, 15, 26, 255))

    # Place scaled 3D Hero Render in the top section
    hero_resized = hero_img.resize((1600, 740), Image.Resampling.LANCZOS).convert("RGBA")
    poster.paste(hero_resized, (0, 0))

    overlay = Image.new("RGBA", (W_P, H_P), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Dark gradient vignette on left, right, and bottom for crisp UI legibility
    for x in range(520):
        alpha = int(205 * (1.0 - x / 520.0))
        draw.line([(x, 0), (x, 680)], fill=(5, 14, 24, alpha))
    for y in range(620, H_P):
        alpha = int(248 * min(1.0, (y - 620) / 80.0))
        draw.line([(0, y), (W_P, y)], fill=(5, 14, 22, alpha))

    # 1. Top-Left TERRA Branding & 3 Pillars (Discover, Understand, Adapt)
    draw.text((42, 34), "T E R R", font=get_font(54, bold=True), fill=(248, 250, 252, 255))
    draw.text((255, 34), "A", font=get_font(54, bold=True), fill=(74, 222, 128, 255))
    draw.text((44, 98), "DISCOVER  •  PREDICT  •  REGENERATE", font=get_font(15, bold=True), fill=(110, 231, 183, 255))
    draw.text((44, 130), "The autonomous intelligence system", font=get_font(17, bold=False), fill=(226, 232, 240, 255))
    draw.text((44, 152), "for climate-resilient agriculture.", font=get_font(17, bold=False), fill=(226, 232, 240, 255))

    pillars = [
        ("Discover", "Detect hidden field", "stress and anomalies.", 220),
        ("Understand", "Fuse local data with", "NASA Earth observations.", 325),
        ("Adapt", "Explore resilient crop", "rotations for the future.", 430),
    ]
    for title, l1, l2, py in pillars:
        draw.ellipse([44, py, 98, py + 54], fill=(8, 28, 36, 220), outline=(52, 211, 153, 245), width=3)
        draw.ellipse([58, py + 14, 84, py + 40], outline=(167, 243, 208, 220), width=2)
        draw.text((114, py + 2), title, font=get_font(19, bold=True), fill=(248, 250, 252, 255))
        draw.text((114, py + 26), l1, font=get_font(14, bold=False), fill=(203, 213, 225, 255))
        draw.text((114, py + 44), l2, font=get_font(14, bold=False), fill=(203, 213, 225, 255))

    # 2. Center 3D Hardware Callout Labels pointing to the TERRA Pod
    draw_callout_tag(draw, (410, 82, 625, 130), (705, 158), "Solar Panel", "(For Long-Term Operation)")
    draw_callout_tag(draw, (875, 42, 1085, 90), (835, 95), "GNSS & Comms", "(Auto Sync)")
    draw_callout_tag(draw, (395, 230, 615, 278), (765, 265), "Multispectral Camera", "(Crop Health Analysis)")
    draw_callout_tag(draw, (915, 310, 1125, 358), (890, 335), "Sensor Chamber", "(Weather & Environment)")
    draw_callout_tag(draw, (395, 425, 605, 473), (710, 480), "Soil Probes", "(Moisture & Temperature)")

    # 3. Top-Right "TERRA Live" Tablet Dashboard (Field Health 87/100 + Rotation Simulator)
    tx0, ty0, tx1, ty1 = 1045, 32, 1568, 565
    draw.rounded_rectangle([tx0, ty0, tx1, ty1], radius=22, fill=(8, 20, 32, 235), outline=(148, 163, 184, 210), width=3)
    draw.text((tx0 + 26, ty0 + 18), "TERRA", font=get_font(22, bold=True), fill=(248, 250, 252, 255))
    draw.ellipse([tx1 - 88, ty0 + 24, tx1 - 74, ty0 + 38], fill=(52, 211, 153, 255))
    draw.text((tx1 - 68, ty0 + 19), "Live", font=get_font(18, bold=True), fill=(110, 231, 183, 255))

    # Satellite Field Polygon Map Panel
    draw.rounded_rectangle([tx0 + 20, ty0 + 58, tx0 + 325, ty0 + 305], radius=12, fill=(14, 38, 28, 255), outline=(34, 197, 94, 160), width=2)
    poly_pts = [(tx0 + 65, ty0 + 235), (tx0 + 185, ty0 + 95), (tx0 + 275, ty0 + 145), (tx0 + 215, ty0 + 275)]
    draw.polygon(poly_pts, fill=(34, 197, 94, 75), outline=(74, 222, 128, 255))
    draw.ellipse([tx0 + 168, ty0 + 178, tx0 + 192, ty0 + 202], fill=(74, 222, 128, 255), outline=(255, 255, 255, 255), width=2)

    # Field Health 87/100 Card
    draw.rounded_rectangle([tx0 + 338, ty0 + 58, tx1 - 18, ty0 + 215], radius=12, fill=(11, 28, 42, 245), outline=(52, 211, 153, 120), width=1)
    draw.text((tx0 + 356, ty0 + 68), "Field Health", font=get_font(16, bold=True), fill=(226, 232, 240, 255))
    draw.ellipse([tx0 + 378, ty0 + 96, tx0 + 468, ty0 + 186], outline=(34, 197, 94, 255), width=7)
    draw.text((tx0 + 402, ty0 + 115), "87", font=get_font(30, bold=True), fill=(255, 255, 255, 255))
    draw.text((tx0 + 406, ty0 + 148), "/100", font=get_font(13, bold=False), fill=(148, 163, 184, 255))
    draw.rounded_rectangle([tx0 + 382, ty0 + 190, tx0 + 464, ty0 + 210], radius=8, fill=(16, 185, 129, 230))
    draw.text((tx0 + 399, ty0 + 192), "Healthy", font=get_font(12, bold=True), fill=(6, 20, 14, 255))

    # Next Action Card
    draw.rounded_rectangle([tx0 + 338, ty0 + 225, tx1 - 18, ty0 + 305], radius=12, fill=(11, 28, 42, 245), outline=(52, 211, 153, 120), width=1)
    draw.text((tx0 + 352, ty0 + 234), "Next Action", font=get_font(15, bold=True), fill=(226, 232, 240, 255))
    draw.text((tx0 + 382, ty0 + 260), "Consider", font=get_font(13, bold=False), fill=(167, 243, 208, 255))
    draw.text((tx0 + 382, ty0 + 278), "Legume Rotation", font=get_font(13, bold=True), fill=(255, 255, 255, 255))

    # Rotation Simulator Cards
    draw.text((tx0 + 24, ty0 + 320), "Rotation Simulator", font=get_font(17, bold=True), fill=(241, 245, 249, 255))
    rot_cards = [
        ("Corn → Rice → Mung Bean", "Optimal", "92/100", (16, 185, 129, 235), tx0 + 20),
        ("Corn → Corn → Soybean", "Balanced", "78/100", (34, 197, 94, 200), tx0 + 184),
        ("Corn → Peanut → Rice", "Risk: Water", "64/100", (217, 119, 6, 235), tx0 + 348),
    ]
    for seq_txt, badge_txt, score_txt, b_col, rx in rot_cards:
        draw.rounded_rectangle([rx, ty0 + 350, rx + 154, ty0 + 448], radius=10, fill=(13, 31, 48, 245), outline=(71, 85, 105, 180), width=1)
        draw.text((rx + 8, ty0 + 364), seq_txt, font=get_font(11, bold=True), fill=(226, 232, 240, 255))
        draw.rounded_rectangle([rx + 8, ty0 + 402, rx + 88, ty0 + 428], radius=6, fill=b_col)
        draw.text((rx + 14, ty0 + 407), badge_txt, font=get_font(11, bold=True), fill=(255, 255, 255, 255))
        draw.text((rx + 96, ty0 + 406), score_txt, font=get_font(13, bold=True), fill=(248, 250, 252, 255))

    # Bottom Mode Tabs inside Tablet
    tabs = [("Historical", tx0 + 60, False), ("Future Climate", tx0 + 205, True), ("Custom Scenario", tx0 + 365, False)]
    for t_lbl, tab_x, is_act in tabs:
        draw.rounded_rectangle(
            [tab_x, ty0 + 468, tab_x + 135, ty0 + 508],
            radius=10,
            fill=(14, 116, 144, 220) if is_act else (15, 23, 42, 200),
            outline=(56, 189, 248, 255) if is_act else (71, 85, 105, 160),
            width=2 if is_act else 1,
        )
        draw.text((tab_x + 16, ty0 + 480), t_lbl, font=get_font(13, bold=True), fill=(255, 255, 255, 255))

    # =========================================================================
    # 4. BOTTOM 4 INFOGRAPHIC CARDS (Matching uploaded_media_1794640205248.jpg)
    # =========================================================================
    card_y0, card_y1 = 628, 1036
    card_specs = [
        (24, 384, "Inside TERRA"),
        (402, 772, "Sensor Suite"),
        (790, 1218, "How TERRA Works"),
        (1236, 1576, "Real-World Impact"),
    ]
    for cx0, cx1, c_title in card_specs:
        draw.rounded_rectangle([cx0, card_y0, cx1, card_y1], radius=16, fill=(7, 22, 34, 242), outline=(45, 212, 191, 135), width=2)
        draw.text((cx0 + 20, card_y0 + 14), c_title, font=get_font(21, bold=True), fill=(248, 250, 252, 255))

    # Card 1: "Inside TERRA" Exploded 3D Render + 4 Component Labels
    inside_crop = inside_img.crop((390, 30, 890, 700)).resize((195, 345), Image.Resampling.LANCZOS).convert("RGBA")
    poster.alpha_composite(overlay)
    poster.paste(inside_crop, (36, card_y0 + 52))
    overlay = Image.new("RGBA", (W_P, H_P), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    inside_labels = [
        ("Sensor", "Module", card_y0 + 108),
        ("Edge AI", "Processor", card_y0 + 178),
        ("Reliable", "Battery", card_y0 + 248),
        ("Weatherproof", "Housing", card_y0 + 318),
    ]
    for l_top, l_bot, ly in inside_labels:
        draw.ellipse([236, ly + 6, 246, ly + 16], fill=(52, 211, 153, 255))
        draw.line([(185, ly + 11), (236, ly + 11)], fill=(52, 211, 153, 180), width=2)
        draw.text((256, ly - 4), l_top, font=get_font(14, bold=True), fill=(241, 245, 249, 255))
        draw.text((256, ly + 14), l_bot, font=get_font(14, bold=False), fill=(167, 243, 208, 255))

    # Card 2: "Sensor Suite" (6 Circular Neon Icons)
    suite_items = [
        ("Soil", "Moisture", 460, card_y0 + 82),
        ("Soil", "Temperature", 585, card_y0 + 82),
        ("Rainfall", "", 705, card_y0 + 82),
        ("Vegetation", "Index", 460, card_y0 + 215),
        ("Solar", "Radiation", 585, card_y0 + 215),
        ("Location", "(GNSS)", 705, card_y0 + 215),
    ]
    for s1, s2, sx, sy in suite_items:
        draw.ellipse([sx - 34, sy, sx + 34, sy + 68], fill=(10, 35, 48, 235), outline=(56, 189, 248, 220), width=2)
        draw.ellipse([sx - 12, sy + 22, sx + 12, sy + 46], outline=(52, 211, 153, 255), width=2)
        draw.text((sx - 32, sy + 76), s1, font=get_font(13, bold=True), fill=(226, 232, 240, 255))
        if s2:
            draw.text((sx - 36, sy + 94), s2, font=get_font(13, bold=False), fill=(148, 163, 184, 255))

    # Root-zone sensing horizon lines at bottom of Sensor Suite card
    for rx in range(418, 758, 18):
        draw.line([(585, card_y0 + 325), (rx, card_y1 - 14)], fill=(16, 185, 129, 130), width=2)

    # Card 3: "How TERRA Works" (5-Step Circular Loop around Glowing TERRA Leaf)
    cx_loop, cy_loop = 1004, card_y0 + 225
    draw.ellipse([cx_loop - 44, cy_loop - 44, cx_loop + 44, cy_loop + 44], fill=(12, 48, 42, 255), outline=(52, 211, 153, 255), width=3)
    draw.ellipse([cx_loop - 108, cy_loop - 108, cx_loop + 108, cy_loop + 108], outline=(52, 211, 153, 140), width=2)

    steps = [
        ("1. Observe", "Collect field & satellite data", cx_loop - 175, cy_loop - 95),
        ("2. Discover", "Find unusual patterns", cx_loop + 75, cy_loop - 115),
        ("3. Investigate", "Request more measurements", cx_loop + 85, cy_loop + 25),
        ("4. Experiment", "Test crop rotations & scenarios", cx_loop - 65, cy_loop + 115),
        ("5. Adapt", "Get personalized recommendations", cx_loop - 195, cy_loop + 15),
    ]
    for st_title, st_sub, sx, sy in steps:
        draw.text((sx, sy), st_title, font=get_font(14, bold=True), fill=(110, 231, 183, 255))
        draw.text((sx, sy + 18), st_sub, font=get_font(11, bold=False), fill=(203, 213, 225, 255))

    # Card 4: "Real-World Impact"
    impacts = [
        "Healthier Soil",
        "Smarter Crop Rotations",
        "Greater Resilience",
        "Food Security",
    ]
    for idx, imp in enumerate(impacts):
        iy = card_y0 + 68 + idx * 42
        draw.ellipse([1258, iy, 1280, iy + 22], fill=(16, 185, 129, 255))
        draw.text((1292, iy - 1), imp, font=get_font(16, bold=True), fill=(241, 245, 249, 255))

    draw.rounded_rectangle([1254, card_y0 + 250, 1558, card_y1 - 18], radius=12, fill=(14, 38, 34, 220), outline=(52, 211, 153, 160), width=1)
    draw.text((1272, card_y1 - 78), "A more resilient tomorrow,", font=get_font(16, bold=False), fill=(226, 232, 240, 255))
    draw.text((1272, card_y1 - 52), "with TERRA.", font=get_font(18, bold=True), fill=(74, 222, 128, 255))

    poster.alpha_composite(overlay)
    return poster.convert("RGB")


class FrameCollectorServer:
    def __init__(self) -> None:
        self.frames: dict[int, Image.Image] = {}
        self.hero_img: Image.Image | None = None
        self.inside_img: Image.Image | None = None
        self.done_event = threading.Event()


COLLECTOR = FrameCollectorServer()


class RenderHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        pass

    def do_GET(self) -> None:
        if self.path == "/" or self.path.startswith("/index"):
            raw = RENDER_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        elif self.path == "/Field_Explorer_3D_Simulator.html":
            with open(os.path.join(HARDWARE_DIR, "Field_Explorer_3D_Simulator.html"), "rb") as f:
                raw = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        elif self.path == "/three.min.js":
            with open(os.path.join(HARDWARE_DIR, "three.min.js"), "rb") as f:
                raw = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self) -> None:
        if self.path == "/poster_views":
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            b64_hero = payload["heroDataUrl"].split(",", 1)[1]
            b64_inside = payload["insideDataUrl"].split(",", 1)[1]
            COLLECTOR.hero_img = Image.open(io.BytesIO(base64.b64decode(b64_hero))).convert("RGB")
            COLLECTOR.inside_img = Image.open(io.BytesIO(base64.b64decode(b64_inside))).convert("RGB")
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        elif self.path == "/frame":
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            idx = int(payload["idx"])
            t_sec = float(payload["t"])
            b64 = payload["dataUrl"].split(",", 1)[1]
            pil_img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
            COLLECTOR.frames[idx] = add_hud_caption_to_pil(pil_img, t_sec)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        elif self.path == "/done":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"done")
            COLLECTOR.done_event.set()


def main() -> None:
    server = HTTPServer(("127.0.0.1", 8915), RenderHTTPHandler)
    srv_thread = threading.Thread(target=server.serve_forever, daemon=True)
    srv_thread.start()

    print("Launching Headless Chrome WebGL 3D Renderer for Official TERRA Hardware Pod...")
    proc = subprocess.Popen(
        [
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu-sandbox",
            "--enable-webgl",
            "--ignore-gpu-blocklist",
            "--window-size=1280,720",
            "http://127.0.0.1:8915/",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    COLLECTOR.done_event.wait(timeout=120.0)
    proc.terminate()

    # Also capture the live HTTP screenshot of Field_Explorer_3D_Simulator.html
    subprocess.run(
        [
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu-sandbox",
            "--enable-webgl",
            "--ignore-gpu-blocklist",
            "--window-size=1440,860",
            "--virtual-time-budget=2500",
            f"--screenshot={SCREENSHOT_SIM_OUT}",
            "http://127.0.0.1:8915/Field_Explorer_3D_Simulator.html",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    server.shutdown()

    if COLLECTOR.hero_img and COLLECTOR.inside_img:
        poster = build_product_poster(COLLECTOR.hero_img, COLLECTOR.inside_img)
        poster.save(POSTER_OUT, quality=95)
        print("Saved Official TERRA 3D Product Poster to:", POSTER_OUT)

    print(f"Captured {len(COLLECTOR.frames)} WebGL 3D frames. Encoding H.264 MP4...")
    container = av.open(VIDEO_OUT, mode="w")
    stream = container.add_stream("libx264", rate=FPS)
    stream.width = WIDTH
    stream.height = HEIGHT
    stream.pix_fmt = "yuv420p"
    stream.options = {"crf": "18", "preset": "fast"}

    for i in range(TOTAL_FRAMES):
        img = COLLECTOR.frames.get(i) or COLLECTOR.frames[max(COLLECTOR.frames.keys())]
        arr = np.array(img, dtype=np.uint8)
        frame = av.VideoFrame.from_ndarray(arr, format="rgb24")
        for pkt in stream.encode(frame):
            container.mux(pkt)

    for pkt in stream.encode():
        container.mux(pkt)
    container.close()
    print("Saved Official TERRA 3D Reveal Video to:", VIDEO_OUT)

    # Copy artifacts to Artifact Directory for user inspection
    if os.path.exists(ARTIFACT_DIR):
        shutil.copy2(VIDEO_OUT, os.path.join(ARTIFACT_DIR, "Field_Explorer_3D_Reveal.mp4"))
        shutil.copy2(POSTER_OUT, os.path.join(ARTIFACT_DIR, "Field_Explorer_Product_Poster.png"))


if __name__ == "__main__":
    main()
