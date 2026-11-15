"use client";

import clsx from "clsx";
import { ArrowRight, Box, Layers, Map as MapIcon, TriangleAlert, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { COLUMN_SCALE, TERRAIN_EXAGGERATION, type Basemap, type OverlayKey, type Selection, type ViewMode } from "@/components/maps/FieldMap";
import { BEACON_FULL_VWC, STATION_MODEL_SCALE } from "@/components/maps/iotLayer";
import { DetailRow, ErrorState, LINK, Loading, Segmented, SourceTag } from "@/components/ui";
import { InfoTip } from "@/components/visual/InfoTip";
import { ndviPixels, probeReadings, smapCell } from "@/lib/demo/spatial";
import { summariseField } from "@/lib/fieldSummary";
import { coord } from "@/lib/format";
import { MOISTURE_RAMP, MOISTURE_RANGE, NDVI_RAMP, NDVI_RANGE, moistureColor, ndviColor } from "@/lib/mapColors";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getObservations } from "@/services/fieldSensorService";
import { describeSelection, formatWhen } from "./selection";

const FieldMap = dynamic(() => import("@/components/maps/FieldMap"), { ssr: false, loading: () => <Loading label="Loading map" /> });

const LAYER_GROUPS: { title: string; layers: { key: OverlayKey; label: string; hint?: string; swatch: React.ReactNode }[] }[] = [
  { title: "Field", layers: [
    { key: "boundary", label: "Field boundary", swatch: <span className="h-0.5 w-4 rounded bg-green" /> },
    { key: "station", label: "Field station", hint: "3D model", swatch: <span className="h-2.5 w-2.5 rounded-full bg-ink ring-2 ring-surface" /> },
    { key: "moisture", label: "Soil measurement points", swatch: <span className="h-2.5 w-2.5 rounded-full" style={{ background: MOISTURE_RAMP[3] }} /> },
    { key: "anomalies", label: "Discovery locations", swatch: <span className="h-3 w-3 rounded-full border border-dashed border-amber bg-amber-soft" /> },
  ] },
  { title: "Satellite", layers: [
    { key: "ndvi", label: "Vegetation index", hint: "MODIS · 250 m", swatch: <span className="h-2.5 w-2.5 rounded-sm" style={{ background: NDVI_RAMP[3] }} /> },
    { key: "smap", label: "Soil moisture footprint", hint: "SMAP · ~9 km", swatch: <span className="h-2.5 w-3 rounded-sm border border-dashed border-amber" /> },
  ] },
];

const DEFAULT_LAYERS: Record<OverlayKey, boolean> = { boundary: true, station: true, moisture: true, anomalies: true, ndvi: false, smap: false };
const PANEL = "rounded-xl border border-line bg-surface/95 shadow-pop backdrop-blur";

function Ramp({ colors, range, unit }: { colors: string[]; range: [number, number]; unit: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{range[0]}</span>
      <span className="flex overflow-hidden rounded-sm">{colors.map((c) => <span key={c} className="h-2 w-3.5" style={{ background: c }} />)}</span>
      <span className="tabular">{range[1]}{unit}</span>
    </span>
  );
}

/** True on wide screens, where panels float open beside the map. */
function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

export function FieldExplorer() {
  const { field, followUps } = useApp();
  const obsQ = useService(`obs:${field.id}`, () => getObservations(field.id));
  const discQ = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));
  const wide = useWide();
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [mode, setMode] = useState<ViewMode>("2d");
  const [tileError, setTileError] = useState(false);
  const [overlays, setOverlays] = useState(DEFAULT_LAYERS);
  const [selection, setSelection] = useState<Selection>({ type: "field" });
  const [layersOpen, setLayersOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(true);
  const [fieldId, setFieldId] = useState(field.id);
  if (fieldId !== field.id) {
    setFieldId(field.id);
    setSelection({ type: "field" });
  }
  // Panels start closed on small screens so the map stays visible
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the screen size
    setLayersOpen(wide);
    setDetailOpen(wide);
  }, [wide]);

  const obs = obsQ.data;
  const summary = useMemo(() => (obs && obs.length > 15 ? summariseField(field, obs) : null), [field, obs]);
  const moisture = useMemo(() => (summary ? probeReadings(field, summary.latest.surfaceVwc) : []), [field, summary]);
  const pixels = useMemo(() => (summary?.lastNdvi ? ndviPixels(field, summary.lastNdvi.ndvi as number) : []), [field, summary]);
  const smapBounds = useMemo(() => smapCell(field), [field]);
  const padding = useMemo(() => (wide ? { top: 90, left: 330, right: 370, bottom: 80 } : { top: 130, left: 24, right: 24, bottom: 120 }), [wide]);

  if (obsQ.error) return <div className="p-6"><ErrorState message={obsQ.error} /></div>;

  const select = (s: Selection) => { setSelection(s); setDetailOpen(true); };
  const toggle = (k: OverlayKey) => {
    setOverlays((o) => ({ ...o, [k]: !o[k] }));
    const owns: Partial<Record<OverlayKey, Selection["type"]>> = { ndvi: "pixel", smap: "smap", moisture: "moisture", anomalies: "anomaly", station: "station" };
    if (overlays[k] && owns[k] === selection.type) setSelection({ type: "field" });
  };
  const detail = summary ? describeSelection(selection, { field, summary, moisture, pixels, discoveries: discQ.data ?? [] }) : null;
  const effectiveBase = tileError ? "schematic" : basemap;
  const three = mode === "3d";

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-sunken">
      <h1 className="sr-only">Field Explorer: {field.name}</h1>
      {!summary ? <Loading label="Loading field data" /> : (
        <FieldMap field={field} basemap={effectiveBase} mode={mode} overlays={overlays} moisture={moisture} pixels={pixels} smapBounds={smapBounds}
          selection={selection} onSelect={select} onTileError={() => setTileError(true)} padding={padding} />
      )}

      {/* Top left: title and layers */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] flex-col gap-2 sm:w-[296px]">
        <div className={clsx(PANEL, "pointer-events-auto flex items-center gap-2 px-3 py-2")}>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-tight text-ink">Field Explorer</p>
            <p className="truncate text-xs text-muted">{field.name}</p>
          </div>
          <button type="button" onClick={() => setLayersOpen(!layersOpen)} aria-expanded={layersOpen} aria-controls="layers-panel"
            className={clsx("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium", layersOpen ? "bg-green-soft text-green-strong" : "text-ink-soft hover:bg-sunken")}>
            <Layers size={15} aria-hidden /> Layers
          </button>
        </div>
        {layersOpen && (
          <div id="layers-panel" className={clsx(PANEL, "pointer-events-auto overflow-y-auto p-3")}>
            {LAYER_GROUPS.map((group) => (
              <fieldset key={group.title} className="mb-2 last:mb-0">
                <legend className="px-1 text-xs font-medium text-muted">{group.title}</legend>
                <ul className="mt-1">
                  {group.layers.map((o) => (
                    <li key={o.key}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-sunken">
                        <input type="checkbox" checked={overlays[o.key]} onChange={() => toggle(o.key)} className="h-4 w-4" />
                        <span className="flex w-4 justify-center" aria-hidden>{o.swatch}</span>
                        <span className="min-w-0 flex-1 text-sm text-ink">{o.label}</span>
                        {o.hint && <span className="text-xs text-faint">{o.hint}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
            <p className="mt-2 border-t border-line px-1 pt-2 text-xs text-muted">Satellite layers cover more than this field.</p>
          </div>
        )}
      </div>

      {/* Top right: view controls */}
      <div className={clsx(PANEL, "absolute right-3 z-10 flex flex-wrap items-center gap-1.5 p-1.5", wide ? "top-3" : "top-[76px]")}>
        <div role="group" aria-label="2D or 3D view" className="inline-flex rounded-lg bg-sunken p-0.5">
          {([["2d", "2D", MapIcon], ["3d", "3D", Box]] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}
              className={clsx("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors", mode === value ? "bg-green text-white shadow-card" : "text-muted hover:text-ink")}>
              <Icon size={14} aria-hidden />{label}
            </button>
          ))}
        </div>
        <Segmented label="Base map" value={basemap} onChange={(b) => { setBasemap(b); setTileError(false); }}
          options={[{ value: "satellite", label: "Imagery" }, { value: "street", label: "Street" }, { value: "schematic", label: "Plain" }]} />
      </div>

      {/* Right: what is selected */}
      {detail && (detailOpen ? (
        <section aria-live="polite" aria-label="Selected observation"
          className={clsx(PANEL, "absolute z-10 overflow-y-auto p-4", wide ? "right-3 top-[68px] max-h-[calc(100%-150px)] w-[340px]" : "inset-x-3 bottom-3 max-h-[46%]")}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">{detail.type}</p>
              <h2 className="mt-0.5 text-base font-semibold leading-snug text-ink">{detail.title}</h2>
              <p className="tabular text-xs text-faint">{coord(detail.position.lat, detail.position.lng)}</p>
            </div>
            <button type="button" onClick={() => setDetailOpen(false)} aria-label="Close details" className="rounded-md p-1 text-muted hover:bg-sunken hover:text-ink"><X size={16} /></button>
          </div>
          <dl className="mt-3">
            {detail.values.map((v) => (
              <DetailRow key={v.label} label={v.label}>
                <span className="inline-flex items-center gap-2">
                  {v.swatch && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.swatch.kind === "moisture" ? moistureColor(v.swatch.value) : ndviColor(v.swatch.value) }} aria-hidden />}
                  {v.value}
                </span>
              </DetailRow>
            ))}
            {detail.date && <DetailRow label="Date">{formatWhen(detail.date)}</DetailRow>}
            <DetailRow label="Source">{detail.sourceName}</DetailRow>
            <DetailRow label="Coverage"><span className="font-normal">{detail.coverage}</span></DetailRow>
          </dl>
          {detail.source && <SourceTag kind={detail.source} className="mt-3" />}
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{detail.note}</p>
          {detail.link && <Link href={detail.link.href} className={clsx(LINK, "mt-2")}>{detail.link.label} <ArrowRight size={15} aria-hidden /></Link>}
          {selection.type !== "field" && (
            <button type="button" onClick={() => setSelection({ type: "field" })} className="mt-2 block text-[13px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline">Back to field summary</button>
          )}
        </section>
      ) : (
        <button type="button" onClick={() => setDetailOpen(true)}
          className={clsx(PANEL, "absolute z-10 px-3 py-2 text-[13px] font-medium text-ink", wide ? "right-3 top-[68px]" : "bottom-3 right-3")}>
          Details: {detail.title}
        </button>
      ))}

      {/* Bottom left: legend and how to read the view */}
      {(wide || !detailOpen) && (
        <div className={clsx(PANEL, "absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] px-3 py-2 sm:max-w-[560px]", !wide && "bottom-14")}>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
            {overlays.station && (
              <li className="inline-flex items-center gap-1">
                Station model ×{STATION_MODEL_SCALE}
                <InfoTip label="station model">The field station is drawn as its 3D model at its real position, enlarged {STATION_MODEL_SCALE} times so it can be seen at field scale. The real pod is about 1.2 m tall. Select it to see its readings.</InfoTip>
              </li>
            )}
            {overlays.moisture && (
              <li className="inline-flex items-center gap-1.5">
                Soil moisture <Ramp colors={MOISTURE_RAMP} range={MOISTURE_RANGE} unit=" %" />
                {three && (
                  <InfoTip label="moisture beacons">
                    Each probe point is a beacon: a stake where the reading was taken, a droplet filled to the measured moisture
                    (full at {BEACON_FULL_VWC} %), a ground ring that widens with it, and the value on its tag. The beacon&apos;s height
                    does not encode anything. Select one to see its reading.
                  </InfoTip>
                )}
              </li>
            )}
            {overlays.ndvi && <li className="inline-flex items-center gap-1.5">NDVI <Ramp colors={NDVI_RAMP} range={NDVI_RANGE} unit="" /></li>}
            {three && (
              <li className="inline-flex items-center gap-1">
                3D terrain ×{TERRAIN_EXAGGERATION}
                <InfoTip label="3D view">
                  Ground relief comes from a global elevation model (AWS Terrain Tiles, about 30 m) and is exaggerated ×{TERRAIN_EXAGGERATION}.
                  The land here is a gently sloping plateau, so relief is subtle. Buildings are OpenStreetMap footprints at their mapped height, or 6 m where none is recorded.
                  NDVI pixel heights encode values, not physical size: {COLUMN_SCALE.ndviPerUnit / 10} m per 0.1 NDVI above {COLUMN_SCALE.ndviBase} (bare soil).
                  Drag with the right mouse button, or two fingers, to tilt and turn.
                </InfoTip>
              </li>
            )}
          </ul>
          <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-muted">
            {tileError && <TriangleAlert size={12} className="mt-px shrink-0 text-amber" aria-hidden />}
            {tileError ? "Base map could not load, so a plain map is shown." : effectiveBase === "satellite" ? "Archive imagery of unknown date: context only." : effectiveBase === "street" ? "Street map for orientation." : "Plain map without imagery."}
            {three && " Right-drag or two-finger drag to tilt."}
          </p>
        </div>
      )}
    </div>
  );
}
