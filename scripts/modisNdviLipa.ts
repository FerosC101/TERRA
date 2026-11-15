/**
 * Field-mean MODIS NDVI for Lipa (scripts/process-modis-ndvi-lipa.py, DATA-MANIFEST.md section 6) as
 * contract values, for mergeValues(). Returns [] when the CSV has not been produced yet.
 */
import { existsSync, readFileSync } from "node:fs";
import { modisNdviToValues, parseModisNdviCsv } from "@/lib/adapters/modisNdvi";
import type { AnyObservationValue } from "@/types/discovery-contract";

export const MODIS_NDVI_CSV = "docs/Data Pipeline/data/external/modis_ndvi/modis_ndvi_lipa.csv";

export function loadModisNdviValues(timeZone: string): AnyObservationValue[] {
  if (!existsSync(MODIS_NDVI_CSV)) return [];
  return modisNdviToValues(parseModisNdviCsv(readFileSync(MODIS_NDVI_CSV, "utf8")), timeZone);
}
