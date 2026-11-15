/**
 * Adapter: SMAP L4 daily means (scripts/process-smap-l4-lipa.py → smap_l4_daily_lipa.csv) → contract values (D-002, D-011).
 *
 * - Source `smap_l4` (not `smap`): L4 is a land-model product with SMAP brightness temperatures assimilated, a
 *   different estimate from the L3 retrieval (they differ by ~0.13 m³/m³ at Lipa, F-016). Provenance "model".
 * - Two layers per day, told apart by depthCm = the layer's bottom: 5 (sm_surface, 0–5 cm) and 100
 *   (sm_rootzone, 0–100 cm). The layer is named in the note.
 * - Period: the local (Manila) calendar day the 8 three-hourly values were assigned to, as UTC instants.
 *   An incomplete day (fewer than 8 values) is kept as quality "missing" with the count.
 */
import type { AnyObservationValue } from "@/types/discovery-contract";

export interface SmapL4DailyRow {
  date: string;
  nSurface: number;
  nRootzone: number;
  surface: number | null;
  rootzone: number | null;
}

const COLUMNS = ["local_date", "n_surface", "n_rootzone", "sm_surface_mean", "sm_rootzone_mean"];

export function parseSmapL4DailyCsv(text: string): SmapL4DailyRow[] {
  const [header, ...lines] = text.trim().split(/\r?\n/).map((l) => l.split(","));
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`SMAP L4 CSV: missing column(s) ${missing.join(", ")}`);
  const col = (r: string[], name: string) => r[header.indexOf(name)];
  const num = (r: string[], name: string): number | null => {
    if (col(r, name) === "") return null;
    const v = Number(col(r, name));
    if (!(v >= 0 && v <= 0.9)) throw new Error(`SMAP L4 CSV: ${name} ${v} on ${col(r, "local_date")} outside 0..0.9 m3/m3`);
    return v;
  };
  return lines.map((r) => {
    if (r.length !== header.length) throw new Error(`SMAP L4 CSV: row "${r.join(",")}" has ${r.length} fields, header has ${header.length}`);
    return {
      date: col(r, "local_date"),
      nSurface: Number(col(r, "n_surface")),
      nRootzone: Number(col(r, "n_rootzone")),
      surface: num(r, "sm_surface_mean"),
      rootzone: num(r, "sm_rootzone_mean"),
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

const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

export function smapL4ToValues(rows: SmapL4DailyRow[], timeZone: string): AnyObservationValue[] {
  return rows.flatMap((r) => {
    const guess = Date.parse(`${r.date}T00:00:00Z`);
    const start = guess - offsetMs(guess, timeZone);
    const period = { start: iso(start), end: iso(start + 86_400_000 - 1000) };
    const layers = [
      { depthCm: 5, value: r.surface, n: r.nSurface, layer: "sm_surface, 0–5 cm" },
      { depthCm: 100, value: r.rootzone, n: r.nRootzone, layer: "sm_rootzone, 0–100 cm" },
    ];
    return layers.map((l): AnyObservationValue => ({
      variable: "soil_moisture",
      source: "smap_l4",
      product: "SPL4SMGP 008",
      provenance: "model",
      value: l.value,
      unit: "m3/m3",
      depthCm: l.depthCm,
      aggregation: "mean",
      period,
      sampleCount: l.n,
      quality: l.value === null ? "missing" : "ok",
      qualityNote: l.value === null
        ? `${l.layer}: ${l.n} of 8 three-hourly values on this day; no daily mean.`
        : `${l.layer}; mean of 8 three-hourly time averages (one 9 km cell).`,
    }));
  });
}
