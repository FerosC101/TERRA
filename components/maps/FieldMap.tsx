"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polygon, Rectangle, ScaleControl, TileLayer, Tooltip, useMap } from "react-leaflet";
import { moistureColor, ndviColor } from "@/lib/mapColors";
import type { Field, LatLng } from "@/types";

export type Basemap = "satellite" | "street" | "schematic";
export type OverlayKey = "boundary" | "station" | "moisture" | "anomalies" | "ndvi" | "smap";

import type { MoistureReading, NdviPixel } from "@/lib/demo/spatial";
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
  overlays: Record<OverlayKey, boolean>;
  moisture: MoistureReading[];
  pixels: NdviPixel[];
  smapBounds: [LatLng, LatLng];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onTileError: () => void;
}

const BASEMAPS = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics — archive mosaic, not a live observation",
    maxNativeZoom: 18,
  },
  street: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxNativeZoom: 19,
  },
};

const ll = (p: LatLng): [number, number] => [p.lat, p.lng];

function Viewport({ field, showSmap, smapBounds }: { field: Field; showSmap: boolean; smapBounds: [LatLng, LatLng] }) {
  const map = useMap();
  useEffect(() => {
    const bounds = showSmap
      ? L.latLngBounds(ll(smapBounds[0]), ll(smapBounds[1]))
      : L.latLngBounds(field.boundary.map(ll));
    map.fitBounds(bounds, { padding: showSmap ? [24, 24] : [48, 48], animate: true });
  }, [map, field, showSmap, smapBounds]);
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export default function FieldMap({ field, basemap, overlays, moisture, pixels, smapBounds, selection, onSelect, onTileError }: Props) {
  const boundary = useMemo(() => field.boundary.map(ll), [field]);
  const anomalies = field.points.filter((p) => p.kind === "anomaly");

  const tiles = basemap === "schematic" ? null : BASEMAPS[basemap];
  // Satellite imagery is dark, the other base maps are light: outlines switch to stay visible
  const onImagery = basemap === "satellite";
  const outline = onImagery ? "#FFFFFF" : "#183B2A";
  const fieldLine = onImagery ? "#8EE39F" : "#37864A";

  return (
    <MapContainer center={ll(field.center)} zoom={16} minZoom={9} maxZoom={19} scrollWheelZoom className="h-full w-full" attributionControl>
      {tiles && (
        <TileLayer key={basemap} url={tiles.url} attribution={tiles.attribution} maxNativeZoom={tiles.maxNativeZoom} maxZoom={19}
          eventHandlers={{ tileerror: onTileError }} />
      )}
      <ScaleControl position="bottomleft" imperial={false} />
      <Viewport field={field} showSmap={overlays.smap} smapBounds={smapBounds} />

      {overlays.smap && (
        <Rectangle bounds={[ll(smapBounds[0]), ll(smapBounds[1])]}
          pathOptions={{ color: onImagery ? "#FFD27A" : "#9A6410", weight: selection.type === "smap" ? 3 : 1.5, dashArray: "6 6", fillColor: "#B7791F", fillOpacity: 0.05 }}
          eventHandlers={{ click: () => onSelect({ type: "smap" }) }}>
          <Tooltip sticky className="terra-tip">SMAP grid cell, ~9 km</Tooltip>
        </Rectangle>
      )}

      {overlays.ndvi && pixels.map((p) => (
        <Rectangle key={p.id} bounds={[ll(p.bounds[0]), ll(p.bounds[1])]}
          pathOptions={{ color: selection.type === "pixel" && selection.id === p.id ? outline : onImagery ? "rgba(255,255,255,0.55)" : "rgba(24,59,42,0.35)", weight: selection.type === "pixel" && selection.id === p.id ? 2.5 : 1, fillColor: ndviColor(p.value), fillOpacity: 0.6 }}
          eventHandlers={{ click: () => onSelect({ type: "pixel", id: p.id }) }}>
          <Tooltip sticky className="terra-tip">NDVI {p.value.toFixed(2)} · 250 m pixel</Tooltip>
        </Rectangle>
      ))}

      {overlays.boundary && (
        <Polygon positions={boundary}
          pathOptions={{ color: fieldLine, weight: selection.type === "field" ? 3.5 : 2.5, fillColor: fieldLine, fillOpacity: overlays.ndvi ? 0 : onImagery ? 0.08 : 0.12 }}
          eventHandlers={{ click: () => onSelect({ type: "field" }) }} />
      )}

      {overlays.moisture && moisture.map((m) => {
        const active = selection.type === "moisture" && selection.id === m.id;
        return (
          <CircleMarker key={m.id} center={ll(m.position)} radius={active ? 11 : 8}
            pathOptions={{ color: outline, weight: active ? 3 : 2, fillColor: moistureColor(m.value), fillOpacity: 1 }}
            eventHandlers={{ click: () => onSelect({ type: "moisture", id: m.id }) }}>
            <Tooltip direction="top" offset={[0, -8]} className="terra-tip">{m.label}: {m.value.toFixed(1)}%</Tooltip>
          </CircleMarker>
        );
      })}

      {overlays.anomalies && anomalies.map((a) => {
        const active = selection.type === "anomaly" && selection.id === a.id;
        return (
          <CircleMarker key={a.id} center={ll(a.position)} radius={active ? 20 : 16}
            pathOptions={{ color: onImagery ? "#FFD27A" : "#9A6410", weight: 2, dashArray: "4 4", fillColor: "#B7791F", fillOpacity: active ? 0.35 : 0.18 }}
            eventHandlers={{ click: () => onSelect({ type: "anomaly", id: a.id }) }}>
            <Tooltip direction="top" offset={[0, -14]} className="terra-tip">Discovery: {a.label}</Tooltip>
          </CircleMarker>
        );
      })}

      {overlays.station && (
        <CircleMarker center={ll(field.station.position)} radius={selection.type === "station" ? 9 : 7}
          pathOptions={{ color: "#FFFFFF", weight: 3, fillColor: "#183B2A", fillOpacity: 1 }}
          eventHandlers={{ click: () => onSelect({ type: "station" }) }}>
          <Tooltip direction="top" offset={[0, -8]} className="terra-tip">{field.station.name}</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
