/**
 * NASA GIBS (Global Imagery Browse Services) layer for SMAP Level-4 surface soil moisture.
 *
 * Checked 2026-11-15 against the GIBS WMTS capabilities
 * (https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml):
 *   layer  SMAP_L4_Analyzed_Surface_Soil_Moisture
 *   title  "Surface Soil Moisture (L4, 12z Instantaneous, Model Value-Added, SMAP)"
 *   tiles  GoogleMapsCompatible_Level6 (web mercator, zoom 0–6), PNG, one image per day
 *   colour map  https://gibs.earthdata.nasa.gov/colormaps/v1.3/SMAP_Analyzed_Soil_Moisture.xml (m³/m³, 0 to ≥ 0.70)
 * Product (NSIDC, https://nsidc.org/data/spl4smgp/versions/8): SPL4SMGP Version 8,
 * DOI 10.5067/T5RUATAQREF8, 9 km EASE-Grid 2.0, 3-hourly; SMAP L-band brightness
 * temperatures assimilated into the GEOS-5 land model, so it is a modelled analysis.
 * Soil depth of the "surface" layer: UNVERIFIED in the pages above; not shown in the UI.
 */
export const SMAP_L4_LAYER = "SMAP_L4_Analyzed_Surface_Soil_Moisture";
const BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
export const SMAP_L4_MAX_ZOOM = 6;
export const SMAP_L4_DOI = "10.5067/T5RUATAQREF8";

export function smapTileUrl(date: string): string {
  return `${BASE}/${SMAP_L4_LAYER}/default/${date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
}

/** GIBS "Domains" request listing the dates available between two days (YYYY-MM-DD). */
export function smapDomainUrl(from: string, to: string): string {
  return `${BASE}/1.0.0/${SMAP_L4_LAYER}/default/GoogleMapsCompatible_Level6/all/${from}--${to}.xml`;
}

/**
 * Latest available date in a GIBS Domains response. The time domain is a comma list of
 * single dates or ISO ranges, e.g. "2026-10-25/2026-11-06/P1D,2026-11-08/2026-11-10/P1D".
 */
export function latestDateFromDomain(xml: string): string | null {
  const match = xml.match(/<Domain>([^<]*)<\/Domain>/);
  if (!match) return null;
  const dates = match[1].split(",").flatMap((part) => part.trim().split("/")).filter((s) => /^\d{4}-\d{2}-\d{2}/.test(s));
  if (!dates.length) return null;
  return dates.map((d) => d.slice(0, 10)).sort().at(-1)!;
}

/** NASA's colour ramp for this layer (value in m³/m³ → colour), sampled from the GIBS colour map above. */
export const SMAP_L4_RAMP: [number, string][] = [
  [0, "rgb(255,162,0)"], [0.113, "rgb(255,255,0)"], [0.171, "rgb(136,195,0)"], [0.229, "rgb(12,133,0)"],
  [0.287, "rgb(0,186,118)"], [0.344, "rgb(0,252,249)"], [0.402, "rgb(0,148,255)"], [0.46, "rgb(0,24,255)"],
  [0.518, "rgb(0,0,194)"], [0.576, "rgb(0,0,118)"], [0.634, "rgb(32,32,100)"], [0.7, "rgb(80,80,80)"],
];
export const SMAP_L4_MAX_VALUE = 0.7;
