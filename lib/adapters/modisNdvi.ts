/**
 * Adapter: field-mean MODIS NDVI (scripts/process-modis-ndvi-lipa.py → modis_ndvi_lipa.csv) →
 * contract values (D-002), and a helper that adds values to an existing FieldDay record.
 *
 * ASSUMPTIONS
 * 1. A composite represents its nominal 16-day window (start day + 15) as LOCAL calendar days.
 *    MOD13Q1/MYD13Q1 days are days of the year of daytime overpasses (Terra ~10:30, Aqua ~13:30 local
 *    solar time), which fall on the same calendar day in UTC+8. The pixels' actual days are in the note.
 * 2. Per D-002, a period longer than 24 h is placed on its last day, so a composite enters the record
 *    when its window closes. MOD13Q1 and MYD13Q1 windows start 8 days apart, so they never share a day.
 * 3. A blank field value (fewer than half the AOI pixels usable) is kept as quality "missing" with the counts.
 *    Usable = pixel_reliability 0, or 1 with no adjacent cloud, mixed clouds or shadow (see the processing script).
 */
import { placeOnLocalDate } from "@/lib/adapters/nasaPipeline";
import type { AnyObservationValue, FieldDay } from "@/types/discovery-contract";

export interface ModisNdviRow {
  product: string;
  compositeStart: string;
  compositeEnd: string;
  nAoi: number;
  nGood: number;
  nUsable: number;
  ndvi: number | null;
  pixelDayMin: string | null;
  pixelDayMax: string | null;
}

const COLUMNS = ["product", "composite_start", "composite_end_nominal", "n_aoi_pixels", "n_good", "n_usable", "ndvi_field", "pixel_day_min", "pixel_day_max"];

export function parseModisNdviCsv(text: string): ModisNdviRow[] {
  const [header, ...lines] = text.trim().split(/\r?\n/).map((l) => l.split(","));
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`MODIS NDVI CSV: missing column(s) ${missing.join(", ")}`);
  const col = (r: string[], name: string) => r[header.indexOf(name)];
  return lines.map((r) => {
    if (r.length !== header.length) throw new Error(`MODIS NDVI CSV: row "${r.join(",")}" has ${r.length} fields, header has ${header.length}`);
    const ndvi = col(r, "ndvi_field") === "" ? null : Number(col(r, "ndvi_field"));
    if (ndvi !== null && !(ndvi >= -0.2 && ndvi <= 1)) throw new Error(`MODIS NDVI CSV: NDVI ${ndvi} outside -0.2..1`);
    return {
      product: col(r, "product"),
      compositeStart: col(r, "composite_start"),
      compositeEnd: col(r, "composite_end_nominal"),
      nAoi: Number(col(r, "n_aoi_pixels")),
      nGood: Number(col(r, "n_good")),
      nUsable: Number(col(r, "n_usable")),
      ndvi,
      pixelDayMin: col(r, "pixel_day_min") || null,
      pixelDayMax: col(r, "pixel_day_max") || null,
    };
  });
}

/** UTC offset (ms) of a time zone at an instant. */
function offsetMs(ms: number, timeZone: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(ms).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}

/** UTC instant of local midnight starting `date` in `timeZone`. */
function localMidnightUtc(date: string, timeZone: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  return guess - offsetMs(guess, timeZone);
}

const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

export function modisNdviToValues(rows: ModisNdviRow[], timeZone: string): AnyObservationValue[] {
  return rows.map((r) => {
    const start = localMidnightUtc(r.compositeStart, timeZone);
    const end = localMidnightUtc(r.compositeEnd, timeZone) + 86_400_000 - 1000;
    const pixels = `${r.nUsable} of ${r.nAoi} AOI pixels usable (${r.nGood} good, ${r.nUsable - r.nGood} cloud-free marginal)`;
    const days = r.pixelDayMin ? `; good pixels acquired ${r.pixelDayMin}..${r.pixelDayMax}` : "";
    return {
      variable: "ndvi",
      source: "modis",
      product: `${r.product} 061`,
      provenance: "satellite",
      value: r.ndvi,
      unit: "dimensionless",
      depthCm: null,
      aggregation: "composite",
      period: { start: iso(start), end: iso(end) },
      sampleCount: r.nUsable,
      quality: r.ndvi === null ? "missing" : "ok",
      qualityNote: r.ndvi === null ? `Fewer than half of the AOI pixels are usable: ${pixels}.` : `Mean of ${pixels}${days}.`,
    };
  });
}

/**
 * Adds values to a consecutive FieldDay record, each on its D-002 local day. Values that fall outside
 * the record are dropped and counted. A second value of the same variable/source/depth on a day throws.
 */
export function mergeValues(days: FieldDay[], values: AnyObservationValue[], timeZone: string): { days: FieldDay[]; dropped: number } {
  const byDate = new Map(days.map((d) => [d.date, { ...d, values: [...d.values] }]));
  let dropped = 0;
  for (const v of values) {
    const day = byDate.get(placeOnLocalDate(v.period, timeZone));
    if (!day) {
      dropped++;
      continue;
    }
    if (day.values.some((x) => x.variable === v.variable && x.source === v.source && x.depthCm === v.depthCm)) {
      throw new Error(`${day.date} already has ${v.variable}/${v.source}/${v.depthCm ?? "-"}`);
    }
    day.values.push(v);
  }
  return { days: days.map((d) => byDate.get(d.date)!), dropped };
}
