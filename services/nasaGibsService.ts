import { addDays } from "@/lib/dates";
import { latestDateFromDomain, SMAP_L4_DOI, SMAP_L4_LAYER, SMAP_L4_MAX_ZOOM, smapDomainUrl, smapTileUrl } from "@/lib/data/gibs";

/**
 * Live NASA map imagery from GIBS (no key needed). This is the one place the web
 * app calls a NASA service directly: it fetches pictures for the map, not values
 * that enter TERRA's calculations.
 */
export interface GibsLayer {
  layer: string;
  /** Day of the image (YYYY-MM-DD), the latest NASA had published when asked */
  date: string;
  tiles: string;
  maxZoom: number;
  doi: string;
}

/** The newest daily SMAP L4 surface soil moisture image, looked up within the last month. */
export async function getSmapSoilMoistureLayer(now = new Date()): Promise<GibsLayer> {
  const today = now.toISOString().slice(0, 10);
  const res = await fetch(smapDomainUrl(addDays(today, -30), today), { cache: "no-store" });
  if (!res.ok) throw new Error(`NASA GIBS answered ${res.status}`);
  const date = latestDateFromDomain(await res.text());
  if (!date) throw new Error("NASA GIBS listed no recent SMAP image");
  return { layer: SMAP_L4_LAYER, date, tiles: smapTileUrl(date), maxZoom: SMAP_L4_MAX_ZOOM, doi: SMAP_L4_DOI };
}
