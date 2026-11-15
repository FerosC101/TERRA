/**
 * The app's daily observation rows (DailyObservation) for a field with a REAL record, on the record's own dates, so
 * every page, the model states and the charts share one calendar (fixes the Living Field Model pairing demo dates with
 * real states by index).
 *
 *   rainMm        rain the models use: GPM IMERG, NASA POWER on days IMERG is missing (satellite / model)
 *   rainImergMm   GPM IMERG Final only; null after its record ends (satellite)
 *   et0Mm, tmaxC  NASA POWER (model)
 *   etcMm         the Living Field Model's crop water use for the day, Kc × ET0 (model)
 *   smapVwc       SMAP L3 surface retrieval on overpass days, % (satellite)
 *   ndvi          the field's NDVI source (MODIS 250 m or HLS 30 m) on its observation days (satellite)
 *   storageMm     plant-available water in the root zone from the Living Field Model, TAW − depletion (model)
 *   surfaceVwc, deepVwc, soilTempC, ecDsM
 *                 SIMULATED readings of the planned station (lib/demo/stationModel.ts), driven by the real rain, ETc and
 *                 air temperature. Display-only: labelled "Simulation" (lib/provenance.ts); never in a FieldDay record.
 *   lstC          null (ECOSTRESS is not collected)
 */
import { simulatePlannedStation } from "@/lib/demo/stationModel";
import { seriesOf } from "@/lib/science/discovery/engine";
import type { FieldState } from "@/lib/science/fieldModel/state";
import type { DailyObservation, MonthlyAnomaly } from "@/types";
import type { FieldDay, SourceId } from "@/types/discovery-contract";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function realObservations(
  days: FieldDay[],
  states: FieldState[],
  opts: { ndviSource: SourceId; stationSeed: number },
): DailyObservation[] {
  if (states.length !== days.length || states.some((s, k) => s.date !== days[k].date)) {
    throw new Error("realObservations: field-model states must cover the record's days, in order");
  }
  const imerg = seriesOf(days, "precipitation", "imerg", null);
  const power = seriesOf(days, "precipitation", "power", null);
  const et0 = seriesOf(days, "et0", "power", null);
  const tmax = seriesOf(days, "air_temperature_max", "power", null);
  const smap = seriesOf(days, "soil_moisture", "smap", null);
  const ndvi = seriesOf(days, "ndvi", opts.ndviSource, null);
  const missing = days.filter((_, k) => (imerg[k] ?? power[k]) === null || et0[k] === null || tmax[k] === null).map((d) => d.date);
  if (missing.length) throw new Error(`realObservations: rain, ET0 or air temperature missing on ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`);

  const rain = days.map((_, k) => (imerg[k] ?? power[k]) as number);
  const etc = states.map((s) => s.water.etcMm ?? 0);
  const station = simulatePlannedStation(days.map((d, k) => ({ date: d.date, rainMm: rain[k], etcMm: etc[k], tmaxC: tmax[k] as number })), opts.stationSeed);

  return days.map((d, k) => ({
    date: d.date,
    rainMm: r1(rain[k]),
    rainImergMm: imerg[k] === null ? null : r1(imerg[k] as number),
    et0Mm: r2(et0[k] as number),
    etcMm: r2(etc[k]),
    tmaxC: r1(tmax[k] as number),
    soilTempC: station[k].soilTempC,
    surfaceVwc: station[k].surfaceVwc,
    deepVwc: station[k].deepVwc,
    smapVwc: smap[k] === null ? null : r1((smap[k] as number) * 100),
    ndvi: ndvi[k] === null ? null : Math.round((ndvi[k] as number) * 1000) / 1000,
    lstC: null,
    ecDsM: station[k].ecDsM,
    storageMm: r1(states[k].water.tawMm - states[k].water.depletionMm),
  }));
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Real monthly departures for each complete month of the record: rain (NASA POWER) against the POWER 2001–2023 monthly
 * normal, and mean daily maximum air temperature (POWER) against the field's POWER monthly climatology.
 */
export function realMonthlyAnomalies(days: FieldDay[], rainNormalMm: number[], tmaxClimC: number[]): MonthlyAnomaly[] {
  const power = seriesOf(days, "precipitation", "power", null);
  const tmax = seriesOf(days, "air_temperature_max", "power", null);
  const months = new Map<string, { rain: number; t: number; nT: number; n: number }>();
  days.forEach((d, k) => {
    const key = d.date.slice(0, 7);
    const m = months.get(key) ?? { rain: 0, t: 0, nT: 0, n: 0 };
    m.n++;
    if (power[k] !== null) m.rain += power[k] as number;
    if (tmax[k] !== null) { m.t += tmax[k] as number; m.nT++; }
    months.set(key, m);
  });
  return [...months.entries()]
    .filter(([key, m]) => m.n === new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate() && m.nT > 0)
    .map(([key, m]) => {
      const mi = +key.slice(5, 7) - 1;
      return {
        month: `${MONTH_LABELS[mi]} ${key.slice(2, 4)}`,
        rainAnomalyPct: Math.round((m.rain / rainNormalMm[mi] - 1) * 100),
        tempAnomalyC: r2(m.t / m.nT - tmaxClimC[mi]),
      };
    });
}
