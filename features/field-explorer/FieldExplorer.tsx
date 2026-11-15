"use client";

import clsx from "clsx";
import { ArrowRight, Eye, EyeOff, Layers, LocateFixed, MapPin, Minus, Navigation2, Plus, TriangleAlert, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { COLUMN_SCALE, TERRAIN_EXAGGERATION, type Basemap, type MapApi, type OverlayKey, type Selection, type ViewMode } from "@/components/maps/FieldMap";
import { BEACON_FULL_VWC, STATION_MODEL_SCALE } from "@/components/maps/iotLayer";
import { DetailRow, ErrorState, LINK, Loading, SourceTag } from "@/components/ui";
import { InfoTip } from "@/components/visual/InfoTip";
import { ndviPixels, probeReadings, smapCell } from "@/lib/demo/spatial";
import { summariseField } from "@/lib/fieldSummary";
import { coord, fmt } from "@/lib/format";
import { MOISTURE_RAMP, MOISTURE_RANGE, NDVI_RAMP, NDVI_RANGE, moistureColor, ndviColor } from "@/lib/mapColors";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getObservations } from "@/services/fieldSensorService";
import { getSmapSoilMoistureLayer } from "@/services/nasaGibsService";
import { SMAP_L4_MAX_VALUE, SMAP_L4_RAMP } from "@/lib/data/gibs";
import { longDate } from "@/lib/dates";
import type { LatLng } from "@/types";
import { describeSelection, formatWhen } from "./selection";

const FieldMap = dynamic(() => import("@/components/maps/FieldMap"), { ssr: false, loading: () => <Loading label="Loading map" /> });

const LAYERS: { key: OverlayKey; label: string; hint?: string; group: "Field" | "Satellite"; swatch: React.ReactNode }[] = [
  { key: "boundary", group: "Field", label: "Field boundary", swatch: <span className="h-0.5 w-4 rounded bg-green" /> },
  { key: "station", group: "Field", label: "Field station", hint: "3D model", swatch: <span className="h-2.5 w-2.5 rounded-full bg-ink ring-2 ring-surface" /> },
  { key: "moisture", group: "Field", label: "Soil measurement points", swatch: <span className="h-2.5 w-2.5 rounded-full" style={{ background: MOISTURE_RAMP[3] }} /> },
  { key: "anomalies", group: "Field", label: "Discovery locations", swatch: <span className="h-3 w-3 rounded-full border border-dashed border-amber bg-amber-soft" /> },
  { key: "ndvi", group: "Satellite", label: "Vegetation index", hint: "MODIS · 250 m", swatch: <span className="h-2.5 w-2.5 rounded-sm" style={{ background: NDVI_RAMP[3] }} /> },
  { key: "smap", group: "Satellite", label: "Soil moisture footprint", hint: "SMAP · ~9 km", swatch: <span className="h-2.5 w-3 rounded-sm border border-dashed border-amber" /> },
];
const DEFAULT_LAYERS: Record<OverlayKey, boolean> = { boundary: true, station: true, moisture: true, anomalies: true, ndvi: false, smap: false };

/** Frosted floating surface shared by every widget on the map */
const GLASS = "border border-white/60 bg-white/80 shadow-[0_6px_24px_rgba(24,59,42,0.14),0_1px_2px_rgba(24,59,42,0.08)] backdrop-blur-xl backdrop-saturate-150";
const STACK_BTN = "flex h-10 w-10 items-center justify-center text-ink-soft transition-colors hover:bg-black/5 hover:text-ink disabled:opacity-40";

function Ramp({ colors, range, unit }: { colors: string[]; range: [number, number]; unit: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{range[0]}</span>
      <span className="flex overflow-hidden rounded-full">{colors.map((c) => <span key={c} className="h-1.5 w-3" style={{ background: c }} />)}</span>
      <span className="tabular">{range[1]}{unit}</span>
    </span>
  );
}

/** Web-mercator tile holding a point, for the map-style previews */
function tileAt(p: LatLng, z: number) {
  const n = 2 ** z;
  const lat = (p.lat * Math.PI) / 180;
  return { z, x: Math.floor(((p.lng + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n) };
}

function StylePreview({ kind, center, place, nasaTiles }: { kind: Basemap; center: LatLng; place: string; nasaTiles?: string }) {
  const t = tileAt(center, 15);
  const imagery = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${t.z}/${t.y}/${t.x}`;
  // NASA's own tile around the field, at its finest zoom
  const n = tileAt(center, 6);
  const nasa = nasaTiles?.replace("{z}", "6").replace("{y}", String(n.y)).replace("{x}", String(n.x));
  return (
    <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#F3F1EC]">
      {kind !== "map" && kind !== "moisture" && (
        // eslint-disable-next-line @next/next/no-img-element -- a single map tile as a preview
        <img src={imagery} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      )}
      {kind === "moisture" && (nasa
        // eslint-disable-next-line @next/next/no-img-element -- a single NASA tile as a preview
        ? <img src={nasa} alt="" className="absolute inset-0 h-full w-full scale-[2.5] object-cover [image-rendering:pixelated]" loading="lazy" />
        : <span className="absolute inset-0 bg-gradient-to-br from-[#00FCF9] via-[#0094FF] to-[#000076]" />)}
      <svg viewBox="0 0 80 60" className="absolute inset-0 h-full w-full" aria-hidden>
        {kind === "map" && <>
          <path d="M0 42 C18 36 26 50 44 46 S70 34 80 38 V60 H0Z" fill="#AAD3EF" />
          <rect x="50" y="6" width="22" height="16" rx="3" fill="#D2E7C2" />
          <rect x="8" y="8" width="18" height="12" rx="2" fill="#ECE8E2" />
        </>}
        {kind !== "satellite" && kind !== "moisture" && <>
          {kind === "map" && <path d="M-2 28 L82 18" stroke="#DCD5C8" strokeWidth="6" />}
          <path d="M-2 28 L82 18" stroke={kind === "map" ? "#F9D77E" : "rgba(255,255,255,0.75)"} strokeWidth={kind === "map" ? 4 : 1.6} />
          <path d="M34 -2 L40 62" stroke={kind === "map" ? "#fff" : "rgba(255,255,255,0.6)"} strokeWidth={kind === "map" ? 3 : 1.2} />
          <text x="44" y="34" fontSize="7" fontWeight="600" fill={kind === "map" ? "#33414A" : "#fff"} style={{ paintOrder: "stroke" }}
            stroke={kind === "map" ? "#fff" : "rgba(0,0,0,0.5)"} strokeWidth="1.5">{place}</text>
        </>}
      </svg>
    </span>
  );
}

function Switch({ on, onChange, label, children }: { on: boolean; onChange: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-black/[0.04]">
      {children}
      <span className={clsx("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors", on ? "bg-green" : "bg-black/15")}>
        <span className={clsx("absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

/** True on wide screens, where cards float beside the map rather than as a sheet. */
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
  const smapQ = useService("gibs:smap-l4", () => getSmapSoilMoistureLayer());
  const wide = useWide();
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [mode, setMode] = useState<ViewMode>("2d");
  const [tileError, setTileError] = useState(false);
  const [overlays, setOverlays] = useState(DEFAULT_LAYERS);
  const [selection, setSelection] = useState<Selection>({ type: "field" });
  const [detailOpen, setDetailOpen] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [camera, setCamera] = useState({ bearing: 0, pitch: 0 });
  const api = useRef<MapApi | null>(null);
  const styleButton = useRef<HTMLButtonElement>(null);
  const stylePop = useRef<HTMLDivElement>(null);
  const [fieldId, setFieldId] = useState(field.id);
  if (fieldId !== field.id) {
    setFieldId(field.id);
    setSelection({ type: "field" });
  }

  // "H" hides or shows every widget, for a clean view of the map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
      if (e.key.toLowerCase() !== "h" || e.metaKey || e.ctrlKey || e.altKey || typing) return;
      setChrome((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const obs = obsQ.data;
  const summary = useMemo(() => (obs && obs.length > 15 ? summariseField(field, obs) : null), [field, obs]);
  const moisture = useMemo(() => (summary ? probeReadings(field, summary.latest.surfaceVwc) : []), [field, summary]);
  const pixels = useMemo(() => (summary?.lastNdvi ? ndviPixels(field, summary.lastNdvi.ndvi as number) : []), [field, summary]);
  const smapBounds = useMemo(() => smapCell(field), [field]);
  const padding = useMemo(() => (wide ? { top: 120, left: 120, right: 120, bottom: 90 } : { top: 150, left: 24, right: 72, bottom: 110 }), [wide]);

  if (obsQ.error) return <div className="p-6"><ErrorState message={obsQ.error} /></div>;

  const select = (s: Selection) => { setSelection(s); setDetailOpen(true); };
  const toggle = (k: OverlayKey) => {
    setOverlays((o) => ({ ...o, [k]: !o[k] }));
    const owns: Partial<Record<OverlayKey, Selection["type"]>> = { ndvi: "pixel", smap: "smap", moisture: "moisture", anomalies: "anomaly", station: "station" };
    if (overlays[k] && owns[k] === selection.type) setSelection({ type: "field" });
  };
  const discoveries = discQ.data ?? [];
  const detail = summary ? describeSelection(selection, { field, summary, moisture, pixels, discoveries }) : null;
  const effectiveBase: Basemap = tileError ? "map" : basemap;
  const three = mode === "3d";
  const openCount = discoveries.filter((d) => d.status !== "resolved").length;

  const placeStylePop = () => {
    const b = styleButton.current?.getBoundingClientRect();
    const p = stylePop.current;
    if (!b || !p) return;
    const width = Math.min(344, window.innerWidth - 24);
    p.style.width = `${width}px`;
    p.style.left = `${Math.max(12, b.left - width - 10)}px`;
    p.style.top = `${Math.min(b.top, window.innerHeight - p.offsetHeight - 12)}px`;
  };

  const detailCard = detail && detailOpen && (
    <section aria-live="polite" aria-label="Selected observation"
      className={clsx(GLASS, "pointer-events-auto overflow-y-auto rounded-2xl p-4", wide ? "max-h-[calc(100dvh-16rem)]" : "max-h-[48dvh]")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">{detail.type}</p>
          <h2 className="mt-0.5 text-base font-semibold leading-snug text-ink">{detail.title}</h2>
          <p className="tabular text-xs text-faint">{coord(detail.position.lat, detail.position.lng)}</p>
        </div>
        <button type="button" onClick={() => setDetailOpen(false)} aria-label="Close details" className="rounded-full bg-black/5 p-1.5 text-muted hover:bg-black/10 hover:text-ink"><X size={14} /></button>
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
  );

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden bg-sunken">
      <h1 className="sr-only">Field Explorer: {field.name}</h1>
      {!summary ? <Loading label="Loading field data" /> : (
        <FieldMap field={field} basemap={effectiveBase} mode={mode} overlays={overlays} moisture={moisture} pixels={pixels} smapBounds={smapBounds}
          selection={selection} onSelect={select} onTileError={() => setTileError(true)} padding={padding} apiRef={api} onCamera={setCamera} nasaSmap={smapQ.data ?? null} />
      )}

      {!chrome ? (
        <button type="button" onClick={() => setChrome(true)} aria-label="Show map controls (H)" title="Show controls (H)"
          className={clsx(GLASS, "absolute right-3 top-3 z-10 inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium text-ink")}>
          <Eye size={16} aria-hidden /> Show controls
        </button>
      ) : (<>
        {/* Left: the place card, and details of what is selected */}
        <div className={clsx("pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2", wide ? "w-[340px]" : "right-[64px]")}>
          <button type="button" onClick={() => { setSelection({ type: "field" }); setDetailOpen(selection.type !== "field" || !detailOpen); }}
            aria-expanded={detailOpen && selection.type === "field"} aria-label={`${field.name}: field summary`} data-tour="place-card"
            className={clsx(GLASS, "pointer-events-auto flex items-start gap-3 rounded-2xl p-3 text-left")}>
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green text-white"><MapPin size={17} aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-tight text-ink">{field.name}</span>
              <span className="block truncate text-xs text-muted">{field.location}</span>
              {summary && (
                <span className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] font-medium text-ink-soft">
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 tabular">{fmt(field.areaHa, 1)} ha</span>
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5">{summary.crop.name}, day {summary.dap}</span>
                  {openCount > 0 && <span className="rounded-full bg-amber-soft px-2 py-0.5 text-amber">{openCount} open {openCount === 1 ? "discovery" : "discoveries"}</span>}
                </span>
              )}
            </span>
          </button>
          {wide && detailCard}
        </div>
        {!wide && detailCard && <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">{detailCard}</div>}

        {/* Right: one slim stack of map controls */}
        <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2" data-tour="map-controls">
          <div className={clsx(GLASS, "flex flex-col overflow-hidden rounded-xl")}>
            <button ref={styleButton} type="button" popoverTarget="map-style" aria-label="Map style and layers" title="Map style and layers" className={STACK_BTN}>
              <Layers size={18} aria-hidden />
            </button>
            <span className="mx-2 h-px bg-black/10" aria-hidden />
            <button type="button" onClick={() => setMode(three ? "2d" : "3d")} aria-pressed={three} aria-label="3D view" title={three ? "Switch to 2D" : "Switch to 3D"}
              className={clsx(STACK_BTN, "text-[13px] font-bold", three && "bg-green! text-white!")}>
              3D
            </button>
          </div>
          <div className={clsx(GLASS, "flex flex-col overflow-hidden rounded-xl")}>
            <button type="button" onClick={() => api.current?.resetNorth()} aria-label={`Compass, ${Math.round(camera.bearing)}°. Reset to north`} title="Reset to north" className={STACK_BTN}>
              <Navigation2 size={17} className="fill-red-500/80 stroke-red-600 transition-transform" style={{ transform: `rotate(${-camera.bearing}deg)` }} aria-hidden />
            </button>
            <span className="mx-2 h-px bg-black/10" aria-hidden />
            <button type="button" onClick={() => api.current?.zoomIn()} aria-label="Zoom in" title="Zoom in" className={STACK_BTN}><Plus size={18} aria-hidden /></button>
            <span className="mx-2 h-px bg-black/10" aria-hidden />
            <button type="button" onClick={() => api.current?.zoomOut()} aria-label="Zoom out" title="Zoom out" className={STACK_BTN}><Minus size={18} aria-hidden /></button>
          </div>
          <div className={clsx(GLASS, "flex flex-col overflow-hidden rounded-xl")}>
            <button type="button" onClick={() => api.current?.recenter()} aria-label="Frame the field" title="Frame the field" className={STACK_BTN}><LocateFixed size={17} aria-hidden /></button>
            <span className="mx-2 h-px bg-black/10" aria-hidden />
            <button type="button" onClick={() => setChrome(false)} aria-label="Hide map controls (H)" title="Hide controls (H)" className={STACK_BTN}><EyeOff size={17} aria-hidden /></button>
          </div>
        </div>

        {/* Map style and layers */}
        <div ref={stylePop} id="map-style" popover="auto" onToggle={(e) => { if (e.newState === "open") placeStylePop(); }}
          className={clsx(GLASS, "fixed m-0 rounded-2xl bg-white/90 p-3 text-ink")}>
          <p className="px-1 text-[13px] font-semibold">Map style</p>
          <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-label="Map style">
            {([["map", "Map"], ["satellite", "Satellite"], ["hybrid", "Hybrid"], ["moisture", "NASA moisture"]] as const).map(([value, label]) => {
              const on = effectiveBase === value;
              const unavailable = value === "moisture" && !smapQ.data;
              return (
                <button key={value} type="button" aria-pressed={on} disabled={unavailable} onClick={() => { setBasemap(value); setTileError(false); }}
                  title={unavailable ? (smapQ.error ? "NASA imagery could not be loaded" : "Loading NASA imagery") : undefined}
                  className="group flex flex-col items-center gap-1 text-center disabled:opacity-50">
                  <span className={clsx("block w-full rounded-[10px] p-0.5 ring-2 transition", on ? "ring-green" : "ring-transparent group-hover:ring-black/10")}>
                    <StylePreview kind={value} center={field.center} place={field.location.split(/[ ,]/)[0]} nasaTiles={smapQ.data?.tiles} />
                  </span>
                  <span className={clsx("text-[11.5px] leading-tight", on ? "font-semibold text-green-strong" : "text-ink-soft")}>{label}</span>
                </button>
              );
            })}
          </div>
          {smapQ.error && <p className="mt-1.5 px-1 text-[11px] text-muted">NASA moisture is unavailable: the NASA imagery service could not be reached.</p>}
          {(["Field", "Satellite"] as const).map((group) => (
            <div key={group} className="mt-3">
              <p className="px-1 text-xs font-medium text-muted">{group === "Field" ? "On the field" : "Satellite layers"}</p>
              <div className="mt-1">
                {LAYERS.filter((l) => l.group === group).map((l) => (
                  <Switch key={l.key} on={overlays[l.key]} onChange={() => toggle(l.key)} label={l.label}>
                    <span className="flex w-4 justify-center" aria-hidden>{l.swatch}</span>
                    <span className="min-w-0 flex-1 text-[13px] text-ink">{l.label}{l.hint && <span className="block text-[11px] text-faint">{l.hint}</span>}</span>
                  </Switch>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-2 px-1 text-[11px] text-muted">Satellite layers cover more than this field.</p>
        </div>

        {/* Bottom left: a compact key, only for what is on the map */}
        {(wide || !detailCard) && (
          <div data-tour="map-key" className={clsx(GLASS, "absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3.5 py-1.5 sm:rounded-full text-[11.5px] text-ink-soft sm:max-w-[640px]")}>
            {tileError ? (
              <span className="inline-flex items-center gap-1 text-amber"><TriangleAlert size={12} aria-hidden /> Imagery could not load; showing the map</span>
            ) : effectiveBase !== "map" && (
              <span className="inline-flex items-center gap-1">Imagery<InfoTip label="imagery">Archive satellite mosaic of unknown date (Esri, Maxar, Earthstar Geographics): context only, not a live observation.</InfoTip></span>
            )}
            {effectiveBase === "moisture" && smapQ.data && (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-medium text-ink">NASA soil moisture</span>
                <span className="tabular">{longDate(smapQ.data.date)}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="tabular">dry</span>
                  <span className="h-1.5 w-20 rounded-full" style={{ background: `linear-gradient(90deg, ${SMAP_L4_RAMP.map(([v, c]) => `${c} ${(v / SMAP_L4_MAX_VALUE) * 100}%`).join(", ")})` }} />
                  <span className="tabular">wet</span>
                </span>
                <SourceTag kind="model" short className="text-[11px]!" />
                <InfoTip label="NASA soil moisture">
                  NASA SMAP Level 4 surface soil moisture (SPL4SMGP version 8, doi:{smapQ.data.doi}), the daily 12:00 UTC analysis for {longDate(smapQ.data.date)},
                  loaded live from NASA GIBS. It assimilates SMAP satellite radiometer observations into a land model, so it is a model analysis, not a direct
                  measurement. Colours run from 0 (orange, dry) through green and cyan to {SMAP_L4_MAX_VALUE} m³/m³ or more (deep blue, wet). Each square is a
                  9 km grid cell, so the whole field sits inside one or two cells. Squares with no estimate (open water, for example) show the greyed photo underneath. NASA notes a geolocation issue for 14 May to 28 July 2026, being reprocessed.
                </InfoTip>
              </span>
            )}
            {overlays.moisture && (
              <span className="inline-flex items-center gap-1.5">
                {effectiveBase === "moisture" ? "Probes" : "Soil moisture"} <Ramp colors={MOISTURE_RAMP} range={MOISTURE_RANGE} unit=" %" />
                {three && (
                  <InfoTip label="moisture beacons">
                    Each probe point is a beacon: a stake where the reading was taken, a droplet filled to the measured moisture
                    (full at {BEACON_FULL_VWC} %), a ground ring that widens with it, and the value on its tag. The beacon&apos;s height
                    does not encode anything. Select one to see its reading.
                  </InfoTip>
                )}
              </span>
            )}
            {overlays.ndvi && <span className="inline-flex items-center gap-1.5">NDVI <Ramp colors={NDVI_RAMP} range={NDVI_RANGE} unit="" /></span>}
            {overlays.station && (
              <span className="inline-flex items-center gap-1">
                Station ×{STATION_MODEL_SCALE}
                <InfoTip label="station model">The field station is drawn as its 3D model at its real position, enlarged {STATION_MODEL_SCALE} times so it can be seen at field scale. The real pod is about 1.2 m tall. Select it to see its readings.</InfoTip>
              </span>
            )}
            {three && (
              <span className="inline-flex items-center gap-1">
                Terrain ×{TERRAIN_EXAGGERATION}
                <InfoTip label="3D view">
                  Ground relief comes from a global elevation model (AWS Terrain Tiles, about 30 m) and is exaggerated ×{TERRAIN_EXAGGERATION}.
                  The land here is a gently sloping plateau, so relief is subtle. Buildings are OpenStreetMap footprints at their mapped height, or 6 m where none is recorded.
                  NDVI pixel heights encode values, not physical size: {COLUMN_SCALE.ndviPerUnit / 10} m per 0.1 NDVI above {COLUMN_SCALE.ndviBase} (bare soil).
                  Right-drag or two-finger drag to tilt and turn.
                </InfoTip>
              </span>
            )}
          </div>
        )}
      </>)}
    </div>
  );
}
