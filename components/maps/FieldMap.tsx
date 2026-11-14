"use client";

import * as maplibregl from "maplibre-gl";
import { type ExpressionSpecification, type GeoJSONSource, type LngLatBoundsLike, type MapGeoJSONFeature, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { offset } from "@/data/fields";
import { createStationLayer, hitsStation, type StationLayerState } from "./stationLayer";
import type { MoistureReading, NdviPixel } from "@/lib/demo/spatial";
import { moistureColor, ndviColor } from "@/lib/mapColors";
import type { Field, LatLng } from "@/types";

/**
 * MapLibre loads its tile worker from a file next to its own bundle. Next.js moves the
 * bundle, so the worker is served from public/ instead (copied by `npm install`, see
 * the postinstall script) and its version always matches the installed package.
 */
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type Basemap = "satellite" | "street" | "schematic";
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
}

/**
 * In 3D, value columns rise by this many metres per unit. Heights encode values, not
 * physical size. NDVI starts from 0.2 (bare soil), so canopy differences stay visible.
 */
export const COLUMN_SCALE = { moisturePerPct: 9, ndviPerUnit: 350, ndviBase: 0.2 };
export const TERRAIN_EXAGGERATION = 2;

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const TERRAIN_ATTRIB = "Elevation: AWS Terrain Tiles (Mapzen/Tilezen; SRTM and others)";
/** Open vector tiles (OpenMapTiles schema) from OpenFreeMap: free, no key. Used for OpenStreetMap 3D buildings. */
const OPENFREEMAP = "https://tiles.openfreemap.org/planet";
const OSM_ATTRIB = "Buildings: © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap";
const SKY = {
  "sky-color": "#A9CDEB", "horizon-color": "#E8F0F4", "fog-color": "#EEF2F0",
  "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.7, "fog-ground-blend": 0.35, "atmosphere-blend": 0.6,
} as const;

const pt = (p: LatLng): [number, number] => [p.lng, p.lat];
const ring = (pts: LatLng[]) => [[...pts.map(pt), pt(pts[0])]];
const box = (sw: LatLng, ne: LatLng) => ring([sw, { lat: sw.lat, lng: ne.lng }, ne, { lat: ne.lat, lng: sw.lng }]);
const square = (c: LatLng, half: number) => box(offset(c, -half, -half), offset(c, half, half));
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
    columns: collection(moisture.map((m) => ({
      type: "Feature", properties: { id: m.id, value: m.value, color: moistureColor(m.value), label: `${m.label}: ${m.value.toFixed(1)}%` },
      geometry: { type: "Polygon", coordinates: square(m.position, 22) },
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
    sources: {
      imagery: { type: "raster", tiles: [ESRI], tileSize: 256, maxzoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics (archive mosaic, not a live observation)" },
      street: { type: "raster", tiles: [OSM], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" },
      terrain: { type: "raster-dem", tiles: [TERRAIN], tileSize: 256, maxzoom: 15, encoding: "terrarium", attribution: TERRAIN_ATTRIB },
      shade: { type: "raster-dem", tiles: [TERRAIN], tileSize: 256, maxzoom: 15, encoding: "terrarium" },
      openmap: { type: "vector", url: OPENFREEMAP, attribution: OSM_ATTRIB },
      field: geo(empty), smap: geo(empty), pixels: geo(empty), probes: geo(empty), columns: geo(empty), anomalies: geo(empty), station: geo(empty),
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#EEF1EA" } },
      { id: "imagery", type: "raster", source: "imagery" },
      { id: "street", type: "raster", source: "street", layout: { visibility: "none" } },
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
      { id: "columns-3d", type: "fill-extrusion", source: "columns", layout: { visibility: "none" },
        paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["*", ["get", "value"], COLUMN_SCALE.moisturePerPct], "fill-extrusion-opacity": 0.95 } },
      { id: "probes", type: "circle", source: "probes", paint: { "circle-color": ["get", "color"], "circle-radius": 7, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2, "circle-pitch-alignment": "map" } },
      { id: "anomalies", type: "circle", source: "anomalies",
        paint: { "circle-color": "#B7791F", "circle-opacity": 0.18, "circle-radius": 16, "circle-stroke-color": "#FFD27A", "circle-stroke-width": 2, "circle-pitch-alignment": "map" } },
      { id: "station", type: "circle", source: "station",
        paint: { "circle-color": "#183B2A", "circle-radius": 7, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 3, "circle-pitch-alignment": "map" } },
    ],
  };
}

/** Clickable layers, most specific first: the first one under the pointer wins. */
const PICK_ORDER = ["station", "probes", "columns-3d", "anomalies", "pixels-3d", "pixels-fill", "boundary-fill", "smap-fill"] as const;

function selectionOf(f: MapGeoJSONFeature): Selection {
  const id = String(f.properties?.id ?? "");
  switch (f.layer.id) {
    case "station": return { type: "station" };
    case "probes": case "columns-3d": return { type: "moisture", id };
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

export default function FieldMap(props: Props) {
  const { field, basemap, mode, overlays, moisture, pixels, smapBounds, selection, onSelect, onTileError, padding } = props;
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  const onTileErrorRef = useRef(onTileError);
  useEffect(() => { onSelectRef.current = onSelect; onTileErrorRef.current = onTileError; });
  // Read by the 3D station layer on every frame
  const stationRef = useRef<StationLayerState>({ name: field.station.name, position: field.station.position, visible: overlays.station, terrain: 0 });
  useEffect(() => {
    stationRef.current = { name: field.station.name, position: field.station.position, visible: overlays.station, terrain: mode === "3d" ? TERRAIN_EXAGGERATION : 0 };
    mapRef.current?.triggerRepaint();
  }, [field, overlays.station, mode]);

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
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "terra-pop", offset: 12 });
    const pickable = () => PICK_ORDER.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
    const topFeature = (point: maplibregl.Point) => {
      const hits = map.queryRenderedFeatures(point, { layers: pickable() });
      return PICK_ORDER.map((id) => hits.find((h) => h.layer.id === id)).find(Boolean);
    };
    map.on("mousemove", (e) => {
      if (hitsStation(map, stationRef.current, e.point)) {
        map.getCanvas().style.cursor = "pointer";
        popup.setLngLat(e.lngLat).setText(`${stationRef.current.name} (model shown enlarged)`).addTo(map);
        return;
      }
      const f = topFeature(e.point);
      map.getCanvas().style.cursor = f ? "pointer" : "";
      if (f && f.layer.id !== "boundary-fill" && f.layer.id !== "smap-fill") popup.setLngLat(e.lngLat).setText(String(f.properties?.label ?? "")).addTo(map);
      else popup.remove();
    });
    map.on("mouseout", () => popup.remove());
    map.on("click", (e) => {
      if (hitsStation(map, stationRef.current, e.point)) {
        onSelectRef.current({ type: "station" });
        return;
      }
      const f = topFeature(e.point);
      if (f) onSelectRef.current(selectionOf(f));
    });
    let tileErrorSent = false;
    map.on("error", (e) => {
      const source = (e as unknown as { sourceId?: string }).sourceId;
      if (!tileErrorSent && (source === "imagery" || source === "street")) { tileErrorSent = true; onTileErrorRef.current(); }
    });
    map.on("load", () => {
      // Keep the attribution folded behind its "i" button so it never covers the legend
      host.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      // The IoT field station, drawn as its 3D model on top of the map layers
      map.addLayer(createStationLayer(() => stationRef.current));
      setReady(true);
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(host.current);
    return () => { ro.disconnect(); popup.remove(); map.remove(); mapRef.current = null; };
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

  // Base map, layers and 2D / 3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const three = mode === "3d";
    const show = (id: string, on: boolean) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    show("imagery", basemap === "satellite");
    show("street", basemap === "street");
    show("hillshade", three);
    map.setPaintProperty("hillshade", "hillshade-exaggeration", basemap === "satellite" ? 0.25 : 0.4);
    show("buildings-3d", three);
    show("smap-fill", overlays.smap); show("smap-line", overlays.smap);
    show("pixels-fill", overlays.ndvi && !three); show("pixels-line", overlays.ndvi && !three); show("pixels-3d", overlays.ndvi && three);
    show("boundary-fill", overlays.boundary); show("boundary-line", overlays.boundary);
    show("probes", overlays.moisture); show("columns-3d", overlays.moisture && three);
    show("anomalies", overlays.anomalies);
    show("station", overlays.station);

    // Outlines change colour so they stay visible on dark imagery and on light maps
    const onImagery = basemap === "satellite";
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
    map.setPaintProperty("columns-3d", "fill-extrusion-opacity", 0.95);
    map.setPaintProperty("anomalies", "circle-opacity", ["case", is("anomaly"), 0.4, 0.18]);
    map.setPaintProperty("station", "circle-radius", selection.type === "station" ? 10 : 7);
    map.setPaintProperty("boundary-line", "line-width", selection.type === "field" ? 3.5 : 2.5);
    map.setPaintProperty("smap-line", "line-width", selection.type === "smap" ? 3 : 1.5);
  }, [ready, selection]);

  // Framing: the field, or the whole SMAP cell when that layer is on
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const target = overlays.smap ? [smapBounds[0], smapBounds[1]] : field.boundary;
    map.fitBounds(boundsOf(target), { padding, pitch: mode === "3d" ? 64 : 0, bearing: mode === "3d" ? -24 : 0, duration: 700, maxZoom: 16.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, field, overlays.smap, smapBounds]);

  if (failed) {
    return <div className="flex h-full items-center justify-center bg-sunken p-6 text-center text-sm text-muted">This browser cannot show the interactive map (WebGL is unavailable).</div>;
  }
  return <div ref={host} className="h-full w-full" role="region" aria-label={`Map of ${field.name}`} />;
}
