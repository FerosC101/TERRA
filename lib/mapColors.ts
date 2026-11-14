/** Sequential single-hue ramp (light → dark blue) for moisture magnitude. */
export const MOISTURE_RAMP = ["#D6E6F7", "#A9CBEE", "#79ACE0", "#4C8BCB", "#2F6FB2", "#1C4E86"];
export const MOISTURE_RANGE: [number, number] = [12, 38];

export function moistureColor(v: number): string {
  const t = Math.min(1, Math.max(0, (v - MOISTURE_RANGE[0]) / (MOISTURE_RANGE[1] - MOISTURE_RANGE[0])));
  return MOISTURE_RAMP[Math.min(MOISTURE_RAMP.length - 1, Math.floor(t * MOISTURE_RAMP.length))];
}

/** Sequential single-hue ramp (light → dark green) for NDVI magnitude. */
export const NDVI_RAMP = ["#DDF0DD", "#B4DDB8", "#86C690", "#58AA69", "#37864A", "#1F5C30"];
export const NDVI_RANGE: [number, number] = [0.2, 0.85];

export function ndviColor(v: number): string {
  const t = Math.min(1, Math.max(0, (v - NDVI_RANGE[0]) / (NDVI_RANGE[1] - NDVI_RANGE[0])));
  return NDVI_RAMP[Math.min(NDVI_RAMP.length - 1, Math.floor(t * NDVI_RAMP.length))];
}
