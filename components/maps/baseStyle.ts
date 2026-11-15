import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";

/**
 * Clean vector base map drawn from OpenStreetMap data (OpenMapTiles schema, served by
 * OpenFreeMap: free, no key). Soft land and water tints, white roads and quiet labels,
 * in the spirit of consumer map apps. In Hybrid, only the roads and labels are drawn,
 * over satellite imagery. In NASA moisture, the imagery is greyed under NASA's SMAP
 * soil-moisture layer (added by FieldMap as "nasa-smap") with roads and labels on top.
 */
export type Basemap = "map" | "satellite" | "hybrid" | "moisture";

export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const SRC = "openmap";
const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];

const PALETTE = {
  land: "#F3F1EC",
  residential: "#ECE8E2",
  farmland: "#EEF0DD",
  grass: "#DDEBCB",
  wood: "#C9E0B7",
  park: "#D2E7C2",
  water: "#AAD3EF",
  building: "#E4E0D9",
  roadCasing: "#DCD5C8",
  road: "#FFFFFF",
  highway: "#F9D77E",
  label: "#4E5A63",
  labelHalo: "#FFFFFF",
} as const;

const classIs = (...c: string[]): ExpressionSpecification => ["match", ["get", "class"], c, true, false];
const byZoom = (stops: [number, number][]): ExpressionSpecification => ["interpolate", ["exponential", 1.5], ["zoom"], ...stops.flat()];
const ROAD_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "track"];
const ROAD_FACTOR: ExpressionSpecification = ["match", ["get", "class"], ["motorway", "trunk"], 1.6, ["primary"], 1.35, ["secondary", "tertiary"], 1.1, ["minor"], 0.85, 0.55];
const ROAD_STOPS: [number, number][] = [[10, 0.6], [13, 2], [15, 5], [17, 12], [19, 28]];
/** Road width by zoom and class; zoom must stay the top-level input, so the class factor goes inside each stop */
const roadWidth = (scale = 1, extra: (z: number) => number = () => 0): ExpressionSpecification =>
  ["interpolate", ["exponential", 1.5], ["zoom"], ...ROAD_STOPS.flatMap(([z, w]) => [z, ["+", ["*", ROAD_FACTOR, w * scale], extra(z)]])] as ExpressionSpecification;
const roadsFilter: ExpressionSpecification = ["all", ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false], classIs(...ROAD_CLASSES), ["!=", ["get", "brunnel"], "tunnel"]];

/** Layers drawn only in the Map style */
const MAP_ONLY: LayerSpecification[] = [
  { id: "vb-residential", type: "fill", source: SRC, "source-layer": "landuse", filter: classIs("residential", "suburb", "neighbourhood"), paint: { "fill-color": PALETTE.residential } },
  { id: "vb-farmland", type: "fill", source: SRC, "source-layer": "landcover", filter: classIs("farmland"), paint: { "fill-color": PALETTE.farmland } },
  { id: "vb-grass", type: "fill", source: SRC, "source-layer": "landcover", filter: classIs("grass", "wetland"), paint: { "fill-color": PALETTE.grass } },
  { id: "vb-wood", type: "fill", source: SRC, "source-layer": "landcover", filter: classIs("wood", "forest"), paint: { "fill-color": PALETTE.wood } },
  { id: "vb-park", type: "fill", source: SRC, "source-layer": "park", paint: { "fill-color": PALETTE.park } },
  { id: "vb-water", type: "fill", source: SRC, "source-layer": "water", filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": PALETTE.water } },
  { id: "vb-waterway", type: "line", source: SRC, "source-layer": "waterway", paint: { "line-color": PALETTE.water, "line-width": byZoom([[10, 0.6], [14, 1.6], [18, 6]]) } },
  { id: "vb-building", type: "fill", source: SRC, "source-layer": "building", minzoom: 14, paint: { "fill-color": PALETTE.building, "fill-outline-color": "#D6D1C8" } },
  { id: "vb-road-casing", type: "line", source: SRC, "source-layer": "transportation", filter: roadsFilter,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": PALETTE.roadCasing, "line-width": roadWidth(1, (z) => (z <= 12 ? 0.6 : z >= 16 ? 2 : 0.6 + ((z - 12) / 4) * 1.4)) } },
];

/** Roads and labels: drawn in Map, and over imagery in Hybrid */
const SHARED: LayerSpecification[] = [
  { id: "vb-road", type: "line", source: SRC, "source-layer": "transportation", filter: roadsFilter,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["match", ["get", "class"], ["motorway", "trunk"], PALETTE.highway, PALETTE.road], "line-width": roadWidth() } },
  { id: "vb-label-water", type: "symbol", source: SRC, "source-layer": "water_name",
    layout: { "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Italic"], "text-size": 12 },
    paint: { "text-color": "#3E7DAA", "text-halo-color": PALETTE.labelHalo, "text-halo-width": 1.2 } },
  { id: "vb-label-road", type: "symbol", source: SRC, "source-layer": "transportation_name", minzoom: 14,
    filter: classIs("motorway", "trunk", "primary", "secondary", "tertiary", "minor"),
    layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": FONT, "text-size": 11.5, "text-rotation-alignment": "map" },
    paint: { "text-color": PALETTE.label, "text-halo-color": PALETTE.labelHalo, "text-halo-width": 1.6 } },
  { id: "vb-label-place", type: "symbol", source: SRC, "source-layer": "place",
    filter: classIs("city", "town", "village", "suburb", "hamlet", "neighbourhood"),
    layout: {
      "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
      "text-font": ["match", ["get", "class"], ["city", "town"], ["literal", FONT_BOLD], ["literal", FONT]],
      "text-size": ["match", ["get", "class"], "city", 16, "town", 14, "village", 12.5, 11.5],
      "text-max-width": 8,
    },
    paint: { "text-color": "#33414A", "text-halo-color": PALETTE.labelHalo, "text-halo-width": 1.8 } },
];

export function vectorBaseLayers(): LayerSpecification[] {
  return [...MAP_ONLY, ...SHARED];
}

/** Show the layers for a base map, and restyle roads and labels for imagery underneath. */
export function applyBasemap(map: MapLibreMap, basemap: Basemap) {
  const imagery = basemap !== "map";
  const show = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  show("imagery", imagery);
  show("nasa-smap", basemap === "moisture");
  // grey, dimmed imagery so NASA's colours read true over it
  map.setPaintProperty("imagery", "raster-saturation", basemap === "moisture" ? -0.85 : 0);
  map.setPaintProperty("imagery", "raster-brightness-max", basemap === "moisture" ? 0.7 : 1);
  for (const l of MAP_ONLY) show(l.id, !imagery);
  for (const l of SHARED) show(l.id, basemap !== "satellite");
  map.setPaintProperty("background", "background-color", imagery ? "#2E3A2F" : PALETTE.land);
  // Over imagery: thin translucent roads, light text on a dark halo
  map.setPaintProperty("vb-road", "line-opacity", imagery ? 0.55 : 1);
  map.setPaintProperty("vb-road", "line-width", roadWidth(imagery ? 0.45 : 1));
  for (const id of ["vb-label-road", "vb-label-place"]) {
    map.setPaintProperty(id, "text-color", imagery ? "#FFFFFF" : id === "vb-label-place" ? "#33414A" : PALETTE.label);
    map.setPaintProperty(id, "text-halo-color", imagery ? "rgba(0,0,0,0.65)" : PALETTE.labelHalo);
  }
  map.setPaintProperty("buildings-3d", "fill-extrusion-color", imagery ? "#ECE8E1" : "#E9E5DE");
}
