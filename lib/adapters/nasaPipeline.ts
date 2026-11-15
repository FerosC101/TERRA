/**
 * Adapter: TERRA NASA data pipeline (docs/Data Pipeline) → Discovery Engine input (D-002).
 *
 * Input:  the pipeline's merged daily records (data/processed/terra_daily_merged.json, or
 *         GET /observations/daily-merged), one per UTC date, every source of that date together.
 * Output: one `FieldDay` per consecutive local date for one field.
 *
 * Only variables the contract defines are kept. The rest (mean/min temperature, humidity,
 * radiation, wind, POWER soil *wetness indexes* (0–1, not m³/m³), IMERG error and sample count)
 * are dropped on purpose. Values are passed through unchanged; nothing is converted or filled.
 *
 * ASSUMPTIONS
 * 1. IMERG Final daily (GPM_3IMERGDF) is a UTC-day accumulation (file names S000000-E235959).
 *    POWER daily values are local-solar-time (LST) days: the API default, confirmed by the response
 *    header `time_standard: "LST"` (2026-11-15; DATA-MANIFEST.md section 1). At Lipa (121.18 E) an LST
 *    day starts about 8 h 05 min before the UTC day, i.e. it is almost exactly the Manila day. The
 *    `period` written below for POWER and ET0 is still the UTC date (off by ~8 h); the local date it
 *    is placed on is the same either way under the D-002 rule.
 * 2. SMAP L3 (SPL3SMP_E): the pipeline stores only the file date at 00:00Z, not the overpass time.
 *    Measured for Lipa 2024–2025 (scripts/fetch-smap-overpass-time.py, tb_time_seconds of the cell
 *    the pipeline used): AM passes at 21:44–22:22Z on the file date, i.e. 05:44–06:22 on the NEXT
 *    Manila day; PM passes 09:35–09:58Z, the same Manila day. Pass those times as
 *    `options.smapAcquisitionUtc` (file date → UTC instant) and each value is placed at its real
 *    time. Without a time for a day, the pipeline's timestamp is kept and labelled UNVERIFIED.
 * 3. POWER (reanalysis with satellite assimilation) and the pipeline's FAO-56 ET0 computed from it
 *    are labelled provenance "model". IMERG and SMAP L3 are labelled "satellite".
 */
import { addDays } from "@/lib/dates";
import type { AnyObservationValue, FieldDay, FieldLocation, SourceId, ValueQuality, Variable } from "@/types/discovery-contract";
import type { Provenance } from "@/types";

/** One variable of a merged pipeline record (validators/schema_validation.py, VariableObservation). */
export interface PipelineObservation {
  value: number | null;
  unit: string;
  raw_variable: string;
  source_dataset: string;
  product_name: string;
  product_version: string;
  observation_type: string;
  quality_flag: string | number | null;
  is_missing: boolean;
  extraction_mode?: string | null;
  notes?: string | null;
}

/** One record of terra_daily_merged.json. Only the fields the adapter reads are typed. */
export interface PipelineDailyRecord {
  date: string;
  timestamp: string;
  location_id: string;
  source_quality_statuses: Record<string, string>;
  quality_flags?: Record<string, { retrieval_qual_decoded?: { summary?: string } | null } & Record<string, unknown>>;
  observations: Record<string, PipelineObservation>;
}

interface Mapping {
  variable: Variable;
  source: SourceId;
  /** The pipeline dataset this key must come from; anything else is refused. */
  dataset: string;
  unit: string;
  aggregation: AnyObservationValue["aggregation"];
  provenance: Provenance;
  /** "daily": expected every day (null → missing). "overpass": absent when null (no overpass). */
  cadence: "daily" | "overpass";
}

/** Pipeline variable name → contract value. */
const MAPPINGS: Record<string, Mapping> = {
  precipitation_imerg_mm: { variable: "precipitation", source: "imerg", dataset: "GPM_IMERG", unit: "mm/day", aggregation: "total", provenance: "satellite", cadence: "daily" },
  precipitation_mm: { variable: "precipitation", source: "power", dataset: "NASA_POWER", unit: "mm/day", aggregation: "total", provenance: "model", cadence: "daily" },
  air_temperature_max_c: { variable: "air_temperature_max", source: "power", dataset: "NASA_POWER", unit: "degC", aggregation: "max", provenance: "model", cadence: "daily" },
  et0_mm_day: { variable: "et0", source: "power", dataset: "NASA_POWER", unit: "mm/day", aggregation: "total", provenance: "model", cadence: "daily" },
  soil_moisture_surface_m3_m3: { variable: "soil_moisture", source: "smap", dataset: "SMAP", unit: "m3/m3", aggregation: "instant", provenance: "satellite", cadence: "overpass" },
};

/** The pipeline's per-source status (validators/quality_checks.py) → contract quality of a present value. */
const QUALITY: Record<string, ValueQuality> = {
  VALID: "ok",
  VALID_WITH_WARNINGS: "warning",
  INCOMPLETE: "warning",
  INVALID: "invalid",
};

/** Local calendar date (YYYY-MM-DD) of a UTC instant in an IANA time zone. */
function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

/** D-002 placement: midpoint for periods of 24 h or less, end for longer ones. */
export function placeOnLocalDate(period: { start: string; end: string }, timeZone: string): string {
  const s = Date.parse(period.start);
  const e = Date.parse(period.end);
  return localDate(e - s <= 24 * 3600_000 ? (s + e) / 2 : e, timeZone);
}

export interface PipelineAdapterOptions {
  /** SMAP L3 acquisition instant per file date (YYYY-MM-DD → "YYYY-MM-DDTHH:MM:SSZ"). */
  smapAcquisitionUtc?: Record<string, string>;
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function toValue(r: PipelineDailyRecord, key: string, m: Mapping, o: PipelineObservation, opts: PipelineAdapterOptions): AnyObservationValue | null {
  if (o.source_dataset !== m.dataset) {
    throw new Error(`${r.date} ${key}: expected dataset ${m.dataset}, got ${o.source_dataset}`);
  }
  if (o.unit !== m.unit) throw new Error(`${r.date} ${key}: expected unit ${m.unit}, got ${o.unit}`);
  const missing = o.value === null || o.is_missing;
  if (missing && m.cadence === "overpass") return null;

  const status = r.source_quality_statuses[m.dataset];
  const quality: ValueQuality = missing ? "missing" : QUALITY[status];
  if (quality === undefined) throw new Error(`${r.date} ${m.dataset}: unknown quality status "${status}"`);

  const notes: string[] = [];
  const decoded = r.quality_flags?.[m.dataset]?.retrieval_qual_decoded?.summary;
  if (decoded && !missing) notes.push(`SMAP retrieval_qual_flag: ${decoded}`);
  const acquired = m.cadence === "overpass" ? opts.smapAcquisitionUtc?.[r.date] : undefined;
  if (acquired !== undefined && !UTC_INSTANT.test(acquired)) {
    throw new Error(`${r.date} SMAP acquisition time "${acquired}" is not a UTC instant (YYYY-MM-DDTHH:MM:SSZ)`);
  }
  if (m.cadence === "overpass") {
    notes.push(acquired
      ? "Period is the acquisition time (SPL3SMP_E tb_time_seconds, cell mean)."
      : "Overpass time not in the pipeline record; period is the file date at 00:00Z (UNVERIFIED).");
  }

  const period = m.cadence === "overpass"
    ? { start: acquired ?? r.timestamp, end: acquired ?? r.timestamp }
    : { start: `${r.date}T00:00:00Z`, end: `${r.date}T23:59:59Z` };

  return {
    variable: m.variable,
    source: m.source,
    product: `${o.product_name} ${o.product_version}`.trim(),
    provenance: m.provenance,
    value: missing ? null : o.value,
    unit: m.unit,
    depthCm: null,
    aggregation: m.aggregation,
    period,
    quality,
    ...(notes.length ? { qualityNote: notes.join(" ") } : {}),
  } as AnyObservationValue;
}

/**
 * Converts merged pipeline records for one location into a consecutive FieldDay record.
 * Throws on another location, an unexpected unit or dataset, or an unknown quality status,
 * rather than guessing. Dates with no record become FieldDays with no values.
 */
export function pipelineToFieldDays(records: PipelineDailyRecord[], location: FieldLocation, options: PipelineAdapterOptions = {}): FieldDay[] {
  const byDate = new Map<string, AnyObservationValue[]>();
  for (const r of records) {
    if (r.location_id !== location.pipelineLocationId) {
      throw new Error(`Record ${r.date} is for location "${r.location_id}", not "${location.pipelineLocationId}"`);
    }
    for (const [key, m] of Object.entries(MAPPINGS)) {
      const o = r.observations[key];
      if (!o) continue;
      const v = toValue(r, key, m, o, options);
      if (!v) continue;
      const date = placeOnLocalDate(v.period, location.timeZone);
      byDate.set(date, [...(byDate.get(date) ?? []), v]);
    }
  }

  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return [];
  const days: FieldDay[] = [];
  for (let d = dates[0]; d <= dates[dates.length - 1]; d = addDays(d, 1)) {
    days.push({ fieldId: location.fieldId, date: d, values: byDate.get(d) ?? [] });
  }
  return days;
}
