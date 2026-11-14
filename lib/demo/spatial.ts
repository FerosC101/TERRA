import { offset } from "@/data/fields";
import { clamp, round } from "@/lib/format";
import { createRng } from "@/lib/rng";
import type { Field, LatLng } from "@/types";

/**
 * Demo spatial samples for the Field Explorer. Like the demo time series, these
 * are generated locally: they place values at the right scale for each product
 * (probe points, 250 m MODIS pixels, the ~9 km SMAP cell) so the map can show
 * honestly how much ground each kind of observation describes.
 */
export interface MoistureReading { id: string; label: string; position: LatLng; value: number }
export interface NdviPixel { id: string; bounds: [LatLng, LatLng]; value: number; insideShare: number }

export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) hit = !hit;
  }
  return hit;
}

/** Probe-point surface moisture: the station value plus each point's fixed demo offset. */
export function probeReadings(field: Field, stationSurfaceVwc: number): MoistureReading[] {
  return field.points.filter((p) => p.kind === "moisture").map((p) => ({
    id: p.id, label: p.label, position: p.position, value: round(clamp(stationSurfaceVwc + (p.moistureOffset ?? 0), 8, 45), 1),
  }));
}

/** 250 m pixels that touch the field, with the share of each that lies inside it. */
export function ndviPixels(field: Field, ndvi: number): NdviPixel[] {
  const rng = createRng(field.seed + 99);
  const lats = field.boundary.map((p) => p.lat);
  const lngs = field.boundary.map((p) => p.lng);
  const halfNorth = ((Math.max(...lats) - Math.min(...lats)) * 111320) / 2;
  const halfEast = ((Math.max(...lngs) - Math.min(...lngs)) * 111320 * Math.cos((field.center.lat * Math.PI) / 180)) / 2;
  const nx = Math.ceil(halfEast / 250) + 1;
  const ny = Math.ceil(halfNorth / 250) + 1;
  const mid: LatLng = { lat: (Math.max(...lats) + Math.min(...lats)) / 2, lng: (Math.max(...lngs) + Math.min(...lngs)) / 2 };
  const out: NdviPixel[] = [];
  for (let gx = -nx; gx <= nx; gx++) {
    for (let gy = -ny; gy <= ny; gy++) {
      const sw = offset(mid, gx * 250 - 125, gy * 250 - 125);
      const ne = offset(mid, gx * 250 + 125, gy * 250 + 125);
      let hits = 0;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        const p = { lat: sw.lat + ((i + 0.5) / 6) * (ne.lat - sw.lat), lng: sw.lng + ((j + 0.5) / 6) * (ne.lng - sw.lng) };
        if (pointInPolygon(p, field.boundary)) hits++;
      }
      const noise = (rng() - 0.5) * 0.08;
      if (!hits) continue;
      const share = hits / 36;
      // Edge pixels blend toward the (assumed lower) surrounding value
      out.push({ id: `px-${gx}-${gy}`, bounds: [sw, ne], insideShare: share, value: round(clamp(ndvi * (0.82 + 0.18 * share) + noise, 0.1, 0.92), 2) });
    }
  }
  return out;
}

export const SMAP_CELL_HA = 8100;

/** Indicative ~9 km SMAP cell containing the field. The real EASE-Grid cell edges are not reproduced. */
export function smapCell(field: Field): [LatLng, LatLng] {
  return [offset(field.center, -3100, -5200), offset(field.center, 5900, 3800)];
}
