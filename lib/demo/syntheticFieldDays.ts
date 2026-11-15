/**
 * Synthetic FieldDay records with injected, labelled events, for testing and
 * evaluating the Discovery Engine (docs/ai-ml/EXPERIMENTS.md E-001).
 *
 * SIMULATED DATA. Nothing here is a measurement or a NASA retrieval, and every
 * value is tagged provenance "simulated". Rain comes from the monthly climatology, a
 * two-layer soil model driven by ETc = Kc × ET0 turns it into soil moisture (default:
 * FAO-56 structure, lib/demo/soilModel.ts; "demo-v1": the original lib/demo/series.ts-style
 * bucket), and satellite values follow the real products' sampling, all in canonical
 * units (m³/m³). Station gaps can be added with `missing`.
 * Results on this data test the engine's code paths and sensitivity to the
 * injected patterns. They say nothing about real fields.
 *
 * Injecting an event never changes the random draws, so a run with an event
 * and a clean run with the same seed differ only through that event.
 */
import { kcOnDay } from "@/data/crops";
import { addDays, daysBetween, monthOf } from "@/lib/dates";
import { clamp } from "@/lib/format";
import { createRng, gaussian } from "@/lib/rng";
import type { Crop, DiscoveryKind, MonthlyClimate } from "@/types";
import type { AnyObservationValue, FieldDay } from "@/types/discovery-contract";
import { canopyCover, soilStep, type SoilParams, type SoilState } from "./soilModel";

export type InjectedEvent =
  /** Gauge and satellite rain forced to zero for `days` days from day index `startDay`. */
  | { kind: "dry-spell"; startDay: number; days: number }
  /** Rain amplified (×1.9, plus 9 mm on about half the days) for `days` days. */
  | { kind: "wet-spell"; startDay: number; days: number }
  /** NDVI lowered by `drop` on the first composite on or after day index `day`. */
  | { kind: "ndvi-dip"; day: number; drop: number }
  /** Every SMAP value shifted by `bias` m³/m³ for the whole record. */
  | { kind: "smap-bias"; bias: number };

export interface SyntheticOptions {
  fieldId: string;
  /** First local date, YYYY-MM-DD. */
  start: string;
  days: number;
  seed: number;
  climate: MonthlyClimate;
  crop: Crop;
  plantedOn: string;
  events?: InjectedEvent[];
  /**
   * "fao56" (default): two-layer model in lib/demo/soilModel.ts with FAO-56 structure.
   * "demo-v1": the original model (ASSUMPTIONS 1, 3–6), kept so E-001 stays reproducible.
   */
  soilModel?: "fao56" | "demo-v1";
  /** fao56 only: share of transpiration from the 0.10 m surface layer (default 0.1 = thickness share). */
  surfaceUptakeShare?: number;
  /**
   * Station data gaps: each day the whole station is missing with probability `rate`, and on every
   * day of each outage. Drawn from a separate random stream, so other values do not change.
   */
  missing?: { rate?: number; outages?: { startDay: number; days: number }[] };
}

/** Ground truth for one injected event: which detectors it should trigger, and when. */
export interface LabelledEvent {
  kind: InjectedEvent["kind"];
  start: string;
  end: string;
  detectors: DiscoveryKind[];
}

const H = 3600_000;
/** Synthetic fields use Asia/Manila (UTC+8, no daylight saving). */
const UTC_OFFSET_H = 8;
const COMPOSITE_DAYS = 16;

/*
 * ASSUMPTIONS — soil model "demo-v1" (scientific-validation check, 2026-11-14). Items 1 and 3–6
 * apply only to demo-v1; the default "fao56" model is documented in lib/demo/soilModel.ts and FAO_SOIL.
 * Reference opened: Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). Crop evapotranspiration.
 * FAO Irrigation and Drainage Paper 56. Ch. 7 https://www.fao.org/4/x0490e/x0490e0c.htm and
 * Ch. 8 https://www.fao.org/4/x0490e/x0490e0e.htm (accessed 2026-11-14).
 *
 * 1. Field capacity 0.34 and wilting point 0.12 m³/m³ (copied from lib/demo/series.ts ÷ 100).
 *    UNVERIFIED for any real texture. FAO-56 Table 19 has no "clay loam" row (the demo field's texture).
 *    FC 0.34 lies inside the silt loam, silt clay loam and clay ranges, but WP 0.12 is below the silt
 *    clay loam (0.17–0.24) and clay (0.20–0.24) ranges, and FC − WP = 0.22 exceeds every Table 19
 *    row (largest 0.20). Saturation 0.42 has no FAO-56 basis here.
 * 2. Surface layer 150 mm. Consistent with FAO-56 Ch. 7: evaporation layer Ze 0.10–0.15 m.
 * 3. 80% of crop water use (ETc) taken from the surface layer. UNVERIFIED and at odds with FAO-56
 *    Ch. 7, which separates soil evaporation (from Ze) from transpiration (from the root zone) and
 *    says transpiration from the evaporating layer is usually small. Hand check: in mid-season
 *    (Kc 1.2, ET0 ≈ 4.3 mm/day) the 10 cm reading falls ≈ 0.015–0.02 m³/m³ per day, 0.053 over
 *    3 dry days. This is the likely cause of the high moisture-divergence alarm rate (F-002).
 * 4. Uptake falls linearly from field capacity. FAO-56 Ch. 8 instead keeps Ks = 1 until depletion
 *    exceeds RAW = p × TAW (eq. 83–84). Simplification, UNVERIFIED.
 * 5. 35% of the water above field capacity drains per day. FAO-56 Ch. 8 assumes all of it is lost
 *    by deep percolation the same day. UNVERIFIED.
 * 6. Deep layer 400 mm with 12% of ETc uptake; together with item 3 only 92% of stress-limited ETc
 *    is removed. No source. UNVERIFIED.
 * 7. Rain occurrence/amounts, IMERG error, sensor noise (0.005, 0.003), SMAP noise (0.02 m³/m³) and
 *    NDVI noise (0.012): illustrative, no source. SMAP's accuracy could not be confirmed from the NSIDC
 *    SPL3SMP_E V6 landing page (https://nsidc.org/data/spl3smp_e, accessed 2026-11-14; not stated there).
 * 8. Corn parameters come from data/crops.ts: Kc mid 1.2 and end 0.5 lie within FAO-56 Table 12
 *    (maize grain: mid 1.20, end 0.60–0.35); Kc ini 0.3 matches the Table 12 cereals group value.
 *    The stage lengths 20/30/40/25 days do not match any Table 11 maize row (closest: 20/35/40/30,
 *    Nigeria humid) (Ch. 6, https://www.fao.org/4/x0490e/x0490e0b.htm, accessed 2026-11-14).
 */
// Soil layers, m³/m³ (assumption 1).
const WILT = 0.12;
const FC = 0.34;
const SAT = 0.42;
/** m³/m³ per mm of water: surface layer ≈ 150 mm deep (assumption 2), deep layer ≈ 400 mm (assumption 6). */
const SURF_PER_MM = 1 / 150;
const DEEP_PER_MM = 0.0025;

/**
 * Default ("fao56") soil: silt loam, every value inside FAO-56 Table 19 ranges (θFC 0.22–0.36,
 * θWP 0.09–0.21, θFC − θWP 0.13–0.19, REW 8–11 mm, TEW 18–25 mm at Ze = 0.10 m). Not calibrated
 * to any real field. TEW = (θFC − 0.5 θWP) × Ze = (0.32 − 0.075) × 100 mm = 24.5 mm (Table 19 footnote).
 * Root zone 1.0 m matches the demo fields' profileDepthM in data/fields.ts (not a measured corn rooting depth).
 */
const FAO_SOIL = { fc: 0.32, wp: 0.15, surfaceDepthM: 0.1, rootDepthM: 1.0, rewMm: 9, tewMm: 24.5 };

const isoMs = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const utcMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`);
const localMidnight = (date: string) => utcMidnight(date) - UTC_OFFSET_H * H;

function val(
  date: string,
  variable: AnyObservationValue["variable"],
  source: AnyObservationValue["source"],
  depthCm: number | null,
  value: number,
  unit: string,
  aggregation: AnyObservationValue["aggregation"],
  periodMs: [number, number],
): AnyObservationValue {
  return {
    variable, source, depthCm, value, unit, aggregation,
    product: `synthetic (${source})`,
    provenance: "simulated",
    period: { start: isoMs(periodMs[0]), end: isoMs(periodMs[1]) },
    quality: "ok",
  } as AnyObservationValue;
}

export function generateSyntheticFieldDays(opts: SyntheticOptions): { days: FieldDay[]; events: LabelledEvent[] } {
  const { climate, crop } = opts;
  const events = opts.events ?? [];
  const rng = createRng(opts.seed);
  const inSpell = (kind: "dry-spell" | "wet-spell", i: number) =>
    events.some((e) => e.kind === kind && i >= e.startDay && i < e.startDay + e.days);
  const smapBias = events.reduce((a, e) => (e.kind === "smap-bias" ? a + e.bias : a), 0);
  const isComposite = (i: number) => i % COMPOSITE_DAYS === COMPOSITE_DAYS - 1;
  const firstCompositeFrom = (day: number) => day + ((COMPOSITE_DAYS - 1 - (day % COMPOSITE_DAYS)) + COMPOSITE_DAYS) % COMPOSITE_DAYS;

  const useFao = (opts.soilModel ?? "fao56") === "fao56";
  const soilParams: SoilParams = { ...FAO_SOIL, p: crop.depletionP, surfaceUptakeShare: opts.surfaceUptakeShare };
  let soil: SoilState = { surfaceDepletionMm: 5, deepDepletionMm: 30 }; // start of record: UNVERIFIED
  const missRng = createRng((opts.seed ^ 0x5bd1e995) >>> 0);
  const missRate = opts.missing?.rate ?? 0;
  const inOutage = (i: number) => (opts.missing?.outages ?? []).some((o) => i >= o.startDay && i < o.startDay + o.days);

  let surface = 0.27;
  let deep = 0.3;
  let ndviState = 0.24;
  const days: FieldDay[] = [];

  for (let i = 0; i < opts.days; i++) {
    const date = addDays(opts.start, i);
    const m = monthOf(date);

    // Fixed number of draws per day, whatever the events.
    const uWet = rng(), uAmount = rng(), uExtra = rng(), uImerg = rng();
    const nImerg = gaussian(rng), nEt0 = gaussian(rng), nTmax = gaussian(rng), nS10 = gaussian(rng), nS40 = gaussian(rng);

    const monthly = climate.rainMm[m];
    const pWet = clamp(monthly / 420, 0.08, 0.7);
    let rain = uWet < pWet ? -Math.log(Math.max(uAmount, 1e-6)) * (monthly / (30 * pWet)) : 0;
    if (inSpell("wet-spell", i)) rain = rain * 1.9 + (uExtra < 0.5 ? 9 : 0);
    if (inSpell("dry-spell", i)) rain = 0;
    const imerg = Math.max(0, rain * (0.75 + 0.5 * uImerg) + (rain > 0 ? nImerg * 1.5 : 0));

    const et0 = Math.max(1, climate.et0MmDay[m] + nEt0 * 0.3);
    const tmax = climate.tmaxC[m] + nTmax * 1.1;
    const dap = daysBetween(opts.plantedOn, date);
    const kc = kcOnDay(crop, dap);
    const etc = kc * et0;

    if (useFao) {
      const r = soilStep(soil, { rainMm: rain, etcMm: etc, canopyCover: canopyCover(crop, dap) }, soilParams);
      soil = r.state;
      surface = r.surfaceVwc;
      deep = r.deepVwc;
    } else {
      // demo-v1 surface layer: infiltration, crop use limited by dryness, drainage above field capacity
      // (assumptions 3–5: the 0.8 share, the linear stress and the 0.35 drainage rate are UNVERIFIED).
      const stress = clamp((surface - WILT) / (FC - WILT), 0, 1);
      const infil = Math.min(rain, Math.max(0, (SAT - surface) / SURF_PER_MM));
      const drain = Math.max(0, surface - FC) * 0.35;
      surface = clamp(surface + (infil - 0.8 * etc * stress) * SURF_PER_MM - drain, WILT, SAT);
      const toDeepMm = rain - infil + drain / SURF_PER_MM;
      // demo-v1 deep layer: slow recharge and slow root uptake.
      const deepStress = clamp((deep - 0.16) / 0.12, 0, 1);
      deep = clamp(deep + (toDeepMm * 0.6 - 0.12 * etc * deepStress) * DEEP_PER_MM - Math.max(0, deep - 0.33) * 0.02, 0.16, 0.36);
    }
    const stationMissing = missRng() < missRate || inOutage(i);

    const local: [number, number] = [localMidnight(date), localMidnight(date) + 24 * H - 1000];
    const utcDay: [number, number] = [utcMidnight(date), utcMidnight(date) + 24 * H - 1000];
    const station = (v: AnyObservationValue): AnyObservationValue =>
      stationMissing ? ({ ...v, value: null, quality: "missing", qualityNote: "Simulated station outage" } as AnyObservationValue) : v;
    const values: AnyObservationValue[] = [
      station(val(date, "soil_moisture", "station", 10, clamp(surface + nS10 * 0.005, 0, 1), "m3/m3", "mean", local)),
      station(val(date, "soil_moisture", "station", 40, clamp(deep + nS40 * 0.003, 0, 1), "m3/m3", "mean", local)),
      station(val(date, "precipitation", "station", null, rain, "mm/day", "total", local)),
      val(date, "precipitation", "imerg", null, imerg, "mm/day", "total", utcDay),
      val(date, "et0", "power", null, et0, "mm/day", "total", utcDay),
      val(date, "air_temperature_max", "power", null, tmax, "degC", "max", utcDay),
    ];

    if (i % 3 === 1) {
      const overpass = localMidnight(date) + 6 * H;
      values.push(val(date, "soil_moisture", "smap", null, clamp(surface + gaussian(rng) * 0.02 + smapBias, 0.02, 0.6), "m3/m3", "instant", [overpass, overpass]));
    }

    if (isComposite(i)) {
      const canopy = dap < 0 ? 0 : clamp(kc / crop.kc.mid, 0, 1);
      const target = dap < 0 ? 0.24 : 0.22 + 0.6 * canopy ** 1.2;
      ndviState = ndviState + (target - ndviState) * 0.75 + gaussian(rng) * 0.012;
      const dip = events.reduce((a, e) => (e.kind === "ndvi-dip" && firstCompositeFrom(e.day) === i ? a + e.drop : a), 0);
      const period: [number, number] = [localMidnight(addDays(date, -(COMPOSITE_DAYS - 1))), local[1]];
      values.push(val(date, "ndvi", "modis", null, clamp(ndviState - dip, 0.1, 0.9), "dimensionless", "composite", period));
    }

    days.push({ fieldId: opts.fieldId, date, values });
  }

  const dateAt = (i: number) => addDays(opts.start, i);
  const labels: LabelledEvent[] = events.map((e) => {
    switch (e.kind) {
      case "dry-spell":
        return { kind: e.kind, start: dateAt(e.startDay), end: dateAt(e.startDay + e.days - 1), detectors: ["rain-departure", "moisture-divergence"] };
      case "wet-spell":
        return { kind: e.kind, start: dateAt(e.startDay), end: dateAt(e.startDay + e.days - 1), detectors: ["rain-departure"] };
      case "ndvi-dip": {
        const d = dateAt(firstCompositeFrom(e.day));
        return { kind: e.kind, start: d, end: d, detectors: ["ndvi-change"] };
      }
      case "smap-bias":
        return { kind: e.kind, start: dateAt(0), end: dateAt(opts.days - 1), detectors: ["sensor-offset"] };
    }
  });

  return { days, events: labels };
}
