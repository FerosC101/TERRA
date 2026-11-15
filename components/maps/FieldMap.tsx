"use client";

import * as maplibregl from "maplibre-gl";
import { type ExpressionSpecification, type GeoJSONSource, type LngLatBoundsLike, type MapGeoJSONFeature, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { applyBasemap, GLYPHS, vectorBaseLayers, type Basemap } from "./baseStyle";
import type { GibsLayer } from "@/services/nasaGibsService";
import { offset } from "@/data/fields";
import { createIotLayer, hitsStation, probeAt, type IotScreen, type IotState } from "./iotLayer";
import type { MoistureReading, NdviPixel } from "@/lib/demo/spatial";
import { moistureColor, ndviColor } from "@/lib/mapColors";
import type { Field, LatLng } from "@/types";

/**
 * MapLibre loads its tile worker from a file next to its own bundle. Next.js moves the
 * bundle, so the worker is served from public/ instead (copied by `npm install`, see
 * the postinstall script) and its version always matches the installed package.
 */
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type { Basemap } from "./baseStyle";
export type ViewMode = "2d" | "3d";
export type OverlayKey = "boundary" | "station" | "moisture" | "anomalies" | "ndvi" | "smap";
export type Selection =
  | { type: "field" }
  | { type: "station" }
  | { type: "moisture"; id: string }
  | { type: "anomaly"; id: string }
  | { type: "pixel"; id: string }
  | { type: "smap" };

interface Props {
  field: Field;
  basemap: Basemap;
  mode: ViewMode;
  overlays: Record<OverlayKey, boolean>;
  moisture: MoistureReading[];
  pixels: NdviPixel[];
  smapBounds: [LatLng, LatLng];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onTileError: () => void;
  /** Room taken by floating panels, so the field is framed in the visible part of the map */
  padding: { top: number; right: number; bottom: number; left: number };
  /** Filled with camera controls for the page's own buttons */
  apiRef?: React.RefObject<MapApi | null>;
  /** Called as the camera turns or tilts, for the compass */
  onCamera?: (c: { bearing: number; pitch: number }) => void;
  /** NASA SMAP soil-moisture imagery for the "moisture" base map, once known */
  nasaSmap?: GibsLayer | null;
}

/** Half-width of the regional view used for the NASA moisture map, so its 9 km cells show a pattern */
const REGION_HALF_M = 25000;

export interface MapApi {
  zoomIn: () => void;
  zoomOut: () => void;
  resetNorth: () => void;
  /** Frame the field (or the SMAP cell when that layer is on) again */
  recenter: () => void;
}

/**
 * In 3D, NDVI pixels rise by this many metres per unit. Heights encode values, not
 * physical size. NDVI starts from 0.2 (bare soil), so canopy differences stay visible.
 * Soil-moisture probes are drawn as beacons instead (see iotLayer.ts).
 */
export const COLUMN_SCALE = { ndviPerUnit: 350, ndviBase: 0.2 };
export const TERRAIN_EXAGGERATION = 2;

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TERRAIN_ATTRIB = "Elevation: AWS Terrain Tiles (Mapzen/Tilezen; SRTM and others)";
/** Open vector tiles (OpenMapTiles schema) from OpenFreeMap: free, no key. Base map, labels and 3D buildings. */
const OPENFREEMAP = "https://tiles.openfreemap.org/planet";
const OSM_ATTRIB = "© OpenStreetMap contributors, OpenMapTiles, OpenFreeMap";
const SKY = {
  "sky-color": "#A9CDEB", "horizon-color": "#E8F0F4", "fog-color": "#EEF2F0",
  "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.35, "atmosphere-blend": 0.6,
} as const;

const pt = (p: LatLng): [number, number] => [p.lng, p.lat];
const ring = (pts: LatLng[]) => [[...pts.map(pt), pt(pts[0])]];
const box = (sw: LatLng, ne: LatLng) => ring([sw, { lat: sw.lat, lng: ne.lng }, ne, { lat: ne.lat, lng: sw.lng }]);
const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });

function data(props: Pick<Props, "field" | "moisture" | "pixels" | "smapBounds">) {
  const { field, moisture, pixels, smapBounds } = props;
  return {
    field: collection([{ type: "Feature", properties: { label: field.name }, geometry: { type: "Polygon", coordinates: ring(field.boundary) } }]),
    smap: collection([{ type: "Feature", properties: { label: "SMAP grid cell, ~9 km" }, geometry: { type: "Polygon", coordinates: box(smapBounds[0], smapBounds[1]) } }]),
    pixels: collection(pixels.map((p) => ({
      type: "Feature", properties: { id: p.id, value: p.value, color: ndviColor(p.value), label: `NDVI ${p.value.toFixed(2)} · 250 m pixel` },
      geometry: { type: "Polygon", coordinates: box(p.bounds[0], p.bounds[1]) },
    }))),
    probes: collection(moisture.map((m) => ({
      type: "Feature", properties: { id: m.id, value: m.value, color: moistureColor(m.value), label: `${m.label}: ${m.value.toFixed(1)}%` },
      geometry: { type: "Point", coordinates: pt(m.position) },
    }))),
    anomalies: collection(field.points.filter((p) => p.kind === "anomaly").map((a) => ({
      type: "Feature", properties: { id: a.id, label: `Discovery: ${a.label}` }, geometry: { type: "Point", coordinates: pt(a.position) },
    }))),
    station: collection([{ type: "Feature", properties: { label: field.station.name }, geometry: { type: "Point", coordinates: pt(field.station.position) } }]),
  };
}

function initialStyle(): StyleSpecification {
  const empty = collection([]);
  const geo = (d: GeoJSON.FeatureCollection) => ({ type: "geojson" as const, data: d });
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      imagery: { type: "raster", tiles: [ESRI], tileSize: 256, maxzoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics (archive mosaic, not a live observation)" },
      terrain: { type: "raster-dem", tiles: [TERRAIN], tileSize: 256, maxzoom: 15, encoding: "terrarium", attribution: TERRAIN_ATTRIB },
      shade: { type: "raster-dem", tiles: [TERRAIN], tileSize: 256, maxzoom: 15, encoding: "terrarium" },
      openmap: { type: "vector", url: OPENFREEMAP, attribution: OSM_ATTRIB },
      field: geo(empty), smap: geo(empty), pixels: geo(empty), probes: geo(empty), anomalies: geo(empty), station: geo(empty),
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#EEF1EA" } },
      { id: "imagery", type: "raster", source: "imagery" },
      ...vectorBaseLayers(),
      { id: "hillshade", type: "hillshade", source: "shade", layout: { visibility: "none" }, paint: { "hillshade-shadow-color": "#183B2A", "hillshade-exaggeration": 0.35 } },
      // OpenStreetMap buildings, extruded to their mapped height (6 m where none is recorded)
      { id: "buildings-3d", type: "fill-extrusion", source: "openmap", "source-layer": "building", minzoom: 13, layout: { visibility: "none" },
        paint: {
          "fill-extrusion-color": "#E9E6DF",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.92,
          "fill-extrusion-vertical-gradient": true,
        } },
      { id: "smap-fill", type: "fill", source: "smap", paint: { "fill-color": "#B7791F", "fill-opacity": 0.06 } },
      { id: "smap-line", type: "line", source: "smap", paint: { "line-color": "#FFD27A", "line-width": 1.5, "line-dasharray": [3, 3] } },
      { id: "pixels-fill", type: "fill", source: "pixels", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.6 } },
      { id: "pixels-line", type: "line", source: "pixels", paint: { "line-color": "#FFFFFF", "line-width": 0.6, "line-opacity": 0.7 } },
      { id: "pixels-3d", type: "fill-extrusion", source: "pixels", layout: { visibility: "none" },
        paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["*", ["max", 0.02, ["-", ["get", "value"], COLUMN_SCALE.ndviBase]], COLUMN_SCALE.ndviPerUnit], "fill-extrusion-opacity": 0.78 } },
      { id: "boundary-fill", type: "fill", source: "field", paint: { "fill-color": "#8EE39F", "fill-opacity": 0.1 } },
      { id: "boundary-line", type: "line", source: "field", paint: { "line-color": "#8EE39F", "line-width": 2.5 } },
      { id: "probes", type: "circle", source: "probes", paint: { "circle-color": ["get", "color"], "circle-radius": 7, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2, "circle-pitch-alignment": "map" } },
      { id: "anomalies", type: "circle", source: "anomalies",
        paint: { "circle-color": "#B7791F", "circle-opacity": 0.18, "circle-radius": 16, "circle-stroke-color": "#FFD27A", "circle-stroke-width": 2, "circle-pitch-alignment": "map" } },
      { id: "station", type: "circle", source: "station",
        paint: { "circle-color": "#183B2A", "circle-radius": 7, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 3, "circle-pitch-alignment": "map" } },
    ],
  };
}

/** Clickable layers, most specific first: the first one under the pointer wins. */
const PICK_ORDER = ["station", "probes", "anomalies", "pixels-3d", "pixels-fill", "boundary-fill", "smap-fill"] as const;

function selectionOf(f: MapGeoJSONFeature): Selection {
  const id = String(f.properties?.id ?? "");
  switch (f.layer.id) {
    case "station": return { type: "station" };
    case "probes": return { type: "moisture", id };
    case "anomalies": return { type: "anomaly", id };
    case "pixels-3d": case "pixels-fill": return { type: "pixel", id };
    case "smap-fill": return { type: "smap" };
    default: return { type: "field" };
  }
}

function boundsOf(points: LatLng[]): LngLatBoundsLike {
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

/**
 * Keep one small value tag above each beacon. Updated straight in the DOM on every
 * frame (no React render), and hidden when the beacon is off screen.
 */
function placeLabels(layer: HTMLDivElement | null, screen: IotScreen, state: IotState) {
  if (!layer) return;
  const seen = new Set<string>();
  for (const p of state.probes) {
    const at = screen.probes[p.id]?.label;
    let tag = layer.querySelector<HTMLSpanElement>(`[data-probe="${p.id}"]`);
    if (!at || !at.visible) { if (tag) tag.style.display = "none"; continue; }
    seen.add(p.id);
    if (!tag) {
      tag = document.createElement("span");
      tag.dataset.probe = p.id;
      tag.className = "terra-beacon-tag";
      layer.appendChild(tag);
    }
    const text = `${p.value.toFixed(1)}%`;
    if (tag.textContent !== text) tag.textContent = text;
    tag.classList.toggle("is-selected", state.selectedProbe === p.id);
    tag.style.setProperty("--dot", p.color);
    tag.style.display = "";
    tag.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -100%)`;
  }
  layer.querySelectorAll<HTMLSpanElement>("[data-probe]").forEach((t) => { if (!seen.has(t.dataset.probe ?? "")) t.style.display = "none"; });
}

export default function FieldMap(props: Props) {
  const { field, basemap, mode, overlays, moisture, pixels, smapBounds, selection, onSelect, onTileError, padding, apiRef, onCamera, nasaSmap } = props;
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  const onTileErrorRef = useRef(onTileError);
  const onCameraRef = useRef(onCamera);
  const frameRef = useRef(() => {});
  useEffect(() => { onSelectRef.current = onSelect; onTileErrorRef.current = onTileError; onCameraRef.current = onCamera; });
  // Read by the 3D device layer (station and moisture beacons) on every frame
  const labelsRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<IotScreen>({ probes: {} });
  const iotRef = useRef<IotState>({
    station: { name: field.station.name, position: field.station.position, visible: overlays.station },
    probes: [], showProbes: false, selectedProbe: null, terrain: 0, reduceMotion: false,
  });
  useEffect(() => {
    iotRef.current = {
      station: { name: field.station.name, position: field.station.position, visible: overlays.station },
      probes: moisture.map((m) => ({ id: m.id, label: m.label, position: m.position, value: m.value, color: moistureColor(m.value) })),
      showProbes: overlays.moisture,
      selectedProbe: selection.type === "moisture" ? selection.id : null,
      terrain: mode === "3d" ? TERRAIN_EXAGGERATION : 0,
      reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
    mapRef.current?.triggerRepaint();
  }, [field, moisture, overlays.station, overlays.moisture, selection, mode]);

  // Create the map once
  useEffect(() => {
    if (!host.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: host.current, style: initialStyle(), center: pt(field.center), zoom: 14, maxZoom: 18.5, minZoom: 8,
        maxPitch: 75, attributionControl: { compact: true },
      });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL unavailable
      setFailed(true);
      return;
    }
    mapRef.current = map;
    // Development only: lets browser tests steer the camera
    if (process.env.NODE_ENV === "development") (window as unknown as { __terraMap?: maplibregl.Map }).__terraMap = map;
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (apiRef) apiRef.current = {
      zoomIn: () => map.zoomIn({ duration: reduce() ? 0 : 300 }),
      zoomOut: () => map.zoomOut({ duration: reduce() ? 0 : 300 }),
      resetNorth: () => map.easeTo({ bearing: 0, duration: reduce() ? 0 : 500 }),
      recenter: () => frameRef.current(),
    };
    map.on("rotate", () => onCameraRef.current?.({ bearing: map.getBearing(), pitch: map.getPitch() }));
    map.on("pitch", () => onCameraRef.current?.({ bearing: map.getBearing(), pitch: map.getPitch() }));

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "terra-pop", offset: 12 });
    // Beacon names sit below the beacon's foot, so they never cover its value tag
    const beaconPop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "terra-pop", offset: 10, anchor: "top" });
    const pickable = () => PICK_ORDER.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
    const topFeature = (point: maplibregl.Point) => {
      const hits = map.queryRenderedFeatures(point, { layers: pickable() });
      return PICK_ORDER.map((id) => hits.find((h) => h.layer.id === id)).find(Boolean);
    };
    const beaconAt = (point: maplibregl.Point) => {
      const id = probeAt(screenRef.current, point);
      return id ? iotRef.current.probes.find((p) => p.id === id) : undefined;
    };
    map.on("mousemove", (e) => {
      const beacon = beaconAt(e.point);
      if (beacon) {
        map.getCanvas().style.cursor = "pointer";
        popup.remove();
        beaconPop.setLngLat(pt(beacon.position)).setText(`${beacon.label} · soil moisture`).addTo(map);
        return;
      }
      beaconPop.remove();
      if (hitsStation(screenRef.current, e.point)) {
        map.getCanvas().style.cursor = "pointer";
        popup.setLngLat(e.lngLat).setText(`${iotRef.current.station.name} (model shown enlarged)`).addTo(map);
        return;
      }
      const f = topFeature(e.point);
      map.getCanvas().style.cursor = f ? "pointer" : "";
      if (f && f.layer.id !== "boundary-fill" && f.layer.id !== "smap-fill") popup.setLngLat(e.lngLat).setText(String(f.properties?.label ?? "")).addTo(map);
      else popup.remove();
    });
    map.on("mouseout", () => { popup.remove(); beaconPop.remove(); });
    map.on("click", (e) => {
      const beacon = beaconAt(e.point);
      if (beacon) {
        onSelectRef.current({ type: "moisture", id: beacon.id });
        return;
      }
      if (hitsStation(screenRef.current, e.point)) {
        onSelectRef.current({ type: "station" });
        return;
      }
      const f = topFeature(e.point);
      if (f) onSelectRef.current(selectionOf(f));
    });
    let tileErrorSent = false;
    map.on("error", (e) => {
      const source = (e as unknown as { sourceId?: string }).sourceId;
      if (!tileErrorSent && source === "imagery") { tileErrorSent = true; onTileErrorRef.current(); }
    });
    map.on("load", () => {
      // Soft directional light, so 3D buildings read like a map app's
      map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.38, position: [1.2, 200, 35] });
      // Keep the attribution folded behind its "i" button so it never covers the legend
      host.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      // The field station and the soil-moisture beacons, drawn in 3D on top of the map layers
      map.addLayer(createIotLayer(() => iotRef.current, (screen) => {
        screenRef.current = screen;
        placeLabels(labelsRef.current, screen, iotRef.current);
      }));
      setReady(true);
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(host.current);
    return () => { ro.disconnect(); popup.remove(); beaconPop.remove(); map.remove(); mapRef.current = null; if (apiRef) apiRef.current = null; };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const d = data({ field, moisture, pixels, smapBounds });
    (Object.keys(d) as (keyof typeof d)[]).forEach((k) => (map.getSource(k) as GeoJSONSource).setData(d[k]));
  }, [ready, field, moisture, pixels, smapBounds]);

  // NASA SMAP imagery, added once its latest date is known
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !nasaSmap) return;
    if (map.getLayer("nasa-smap")) map.removeLayer("nasa-smap");
    if (map.getSource("nasa-smap")) map.removeSource("nasa-smap");
    map.addSource("nasa-smap", {
      type: "raster", tiles: [nasaSmap.tiles], tileSize: 256, maxzoom: nasaSmap.maxZoom,
      attribution: `Soil moisture: NASA SMAP L4 (SPL4SMGP v8, doi:${nasaSmap.doi}), ${nasaSmap.date}, via NASA GIBS`,
    });
    // nearest-neighbour keeps the 9 km grid cells visible instead of blurring them
    map.addLayer({ id: "nasa-smap", type: "raster", source: "nasa-smap", layout: { visibility: basemap === "moisture" ? "visible" : "none" },
      paint: { "raster-opacity": 0.82, "raster-resampling": "nearest", "raster-fade-duration": 0 } }, "vb-road");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibility is kept current by the base-map effect
  }, [ready, nasaSmap]);

  // Base map, layers and 2D / 3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const three = mode === "3d";
    const show = (id: string, on: boolean) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    applyBasemap(map, basemap);
    show("hillshade", three);
    map.setPaintProperty("hillshade", "hillshade-exaggeration", basemap === "map" ? 0.4 : 0.25);
    show("buildings-3d", three);
    // flat footprints in 2D, extruded buildings in 3D
    show("vb-building", basemap === "map" && !three);
    show("smap-fill", overlays.smap); show("smap-line", overlays.smap);
    show("pixels-fill", overlays.ndvi && !three); show("pixels-line", overlays.ndvi && !three); show("pixels-3d", overlays.ndvi && three);
    show("boundary-fill", overlays.boundary); show("boundary-line", overlays.boundary);
    // In 3D the probes are drawn as beacons by the device layer
    show("probes", overlays.moisture && !three);
    show("anomalies", overlays.anomalies);
    show("station", overlays.station);

    // Outlines change colour so they stay visible on dark imagery and on light maps
    const onImagery = basemap !== "map";
    map.setPaintProperty("boundary-line", "line-color", onImagery ? "#8EE39F" : "#37864A");
    map.setPaintProperty("boundary-fill", "fill-color", onImagery ? "#8EE39F" : "#37864A");
    map.setPaintProperty("smap-line", "line-color", onImagery ? "#FFD27A" : "#9A6410");
    map.setPaintProperty("anomalies", "circle-stroke-color", onImagery ? "#FFD27A" : "#9A6410");
    map.setPaintProperty("pixels-line", "line-color", onImagery ? "#FFFFFF" : "#183B2A");
    map.setPaintProperty("probes", "circle-stroke-color", onImagery ? "#FFFFFF" : "#183B2A");

    map.setTerrain(three ? { source: "terrain", exaggeration: TERRAIN_EXAGGERATION } : null);
    map.setSky(three ? { ...SKY } : {});
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({ pitch: three ? 64 : 0, bearing: three ? -24 : 0, duration: reduce ? 0 : 900, padding });
    // `padding` is applied on the framing effect; it is read here only for the transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, basemap, mode, overlays]);

  // Selection highlight
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const id = "id" in selection ? selection.id : "";
    const is = (type: Selection["type"]): ExpressionSpecification => ["==", ["literal", selection.type === type ? id : "__none__"], ["get", "id"]];
    map.setPaintProperty("pixels-line", "line-width", ["case", is("pixel"), 3, 0.6]);
    map.setPaintProperty("probes", "circle-radius", ["case", is("moisture"), 11, 7]);
    map.setPaintProperty("anomalies", "circle-opacity", ["case", is("anomaly"), 0.4, 0.18]);
    map.setPaintProperty("station", "circle-radius", selection.type === "station" ? 10 : 7);
    map.setPaintProperty("boundary-line", "line-width", selection.type === "field" ? 3.5 : 2.5);
    map.setPaintProperty("smap-line", "line-width", selection.type === "smap" ? 3 : 1.5);
  }, [ready, selection]);

  // Framing: the field, or the whole SMAP cell when that layer is on
  useEffect(() => {
    frameRef.current = () => {
      const map = mapRef.current;
      if (!map) return;
      const target = basemap === "moisture"
        ? [offset(field.center, -REGION_HALF_M, -REGION_HALF_M), offset(field.center, REGION_HALF_M, REGION_HALF_M)]
        : overlays.smap ? [smapBounds[0], smapBounds[1]] : field.boundary;
      map.fitBounds(boundsOf(target), { padding, pitch: mode === "3d" ? 64 : 0, bearing: mode === "3d" ? -24 : 0, duration: 700, maxZoom: 16.5 });
    };
  }, [field, overlays.smap, smapBounds, padding, mode, basemap]);
  const regional = basemap === "moisture";
  useEffect(() => {
    if (ready) frameRef.current();
  }, [ready, field, overlays.smap, smapBounds, regional]);

  if (failed) {
    return <div className="flex h-full items-center justify-center bg-sunken p-6 text-center text-sm text-muted">This browser cannot show the interactive map (WebGL is unavailable).</div>;
  }
  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full" role="region" aria-label={`Map of ${field.name}`} />
      {/* Value tags above the 3D beacons, placed every frame by the device layer */}
      <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
    </div>
  );
}
