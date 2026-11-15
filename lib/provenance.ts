/**
 * How each column of a field's daily observation rows came to exist, for the provenance tags on every page.
 *
 * - A field with a REAL record (data/nasa/realRecords.ts; rows from lib/adapters/realObservations.ts): rain is GPM
 *   IMERG (satellite) or, on days IMERG is missing, NASA POWER (model); ET0, ETc, air temperature and root-zone storage
 *   are model outputs; SMAP and NDVI are satellite; the station columns are SIMULATED (no device is installed).
 * - A demo field: the labels the pages used before (station columns read as the field station), so demo pages are
 *   unchanged; those fields carry the "Demo" badge.
 */
import { hasRealRecord } from "@/data/nasa/realRecords";
import type { DailyObservation, Field, Provenance } from "@/types";

export type ObsKey = Exclude<keyof DailyObservation, "date">;

const REAL: Record<ObsKey, Provenance> = {
  rainMm: "satellite", rainImergMm: "satellite", et0Mm: "model", etcMm: "model", tmaxC: "model",
  soilTempC: "simulated", surfaceVwc: "simulated", deepVwc: "simulated", smapVwc: "satellite",
  ndvi: "satellite", lstC: "satellite", ecDsM: "simulated", storageMm: "model",
};

const DEMO: Record<ObsKey, Provenance> = {
  rainMm: "measurement", rainImergMm: "satellite", et0Mm: "model", etcMm: "model", tmaxC: "measurement",
  soilTempC: "measurement", surfaceVwc: "measurement", deepVwc: "measurement", smapVwc: "satellite",
  ndvi: "satellite", lstC: "satellite", ecDsM: "measurement", storageMm: "model",
};

/**
 * Provenance of one observation column for a field. Pass the row when it matters for that day: on a real record, rain
 * on a day without IMERG came from NASA POWER, a model.
 */
export function obsProvenance(field: Pick<Field, "id">, key: ObsKey, row?: Pick<DailyObservation, "rainImergMm">): Provenance {
  if (!hasRealRecord(field.id)) return DEMO[key];
  if (key === "rainMm" && row && row.rainImergMm === null) return "model";
  return REAL[key];
}
