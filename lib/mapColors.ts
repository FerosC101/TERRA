/** Sequential single-hue ramp (light → dark blue) for moisture magnitude. */
export function moistureColor(v: number): string {
  const t = Math.min(1, Math.max(0, (v - 12) / 26));
  const ramp = ["#CFE4FF", "#9CC7FF", "#6AA9F8", "#4089E6", "#2367C4", "#12489A"];
  return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
}

/** Sequential single-hue ramp (light → dark green) for NDVI magnitude. */
export function ndviColor(v: number): string {
  const t = Math.min(1, Math.max(0, (v - 0.2) / 0.65));
  const ramp = ["#D6F5DC", "#A6E9B1", "#6FD682", "#39B654", "#218A3B", "#125E27"];
  return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
}

