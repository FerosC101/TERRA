"use client";

import clsx from "clsx";
import { ArrowRight, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Basemap, OverlayKey, Selection } from "@/components/maps/FieldMap";
import { Card, DetailRow, ErrorState, LINK, Loading, PageHeader, Segmented, SourceTag } from "@/components/ui";
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

const LAYER_GROUPS: { title: string; layers: { key: OverlayKey; label: string; hint: string }[] }[] = [
  { title: "Field", layers: [
    { key: "boundary", label: "Field boundary", hint: "Outline from the field record" },
    { key: "station", label: "Field station", hint: "Where the sensors are" },
    { key: "moisture", label: "Soil measurement points", hint: "Handheld probe readings" },
    { key: "anomalies", label: "Discovery locations", hint: "Where open discoveries were observed" },
  ] },
  { title: "Satellite", layers: [
    { key: "ndvi", label: "Vegetation index", hint: "MODIS, 250 m pixels" },
    { key: "smap", label: "Soil moisture footprint", hint: "SMAP, one ~9 km cell" },
  ] },
];

const DEFAULT_LAYERS: Record<OverlayKey, boolean> = { boundary: true, station: true, moisture: false, anomalies: true, ndvi: false, smap: false };

function Ramp({ colors, range, unit }: { colors: string[]; range: [number, number]; unit: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular">{range[0]}</span>
      <span className="flex overflow-hidden rounded-sm">{colors.map((c) => <span key={c} className="h-2.5 w-4" style={{ background: c }} />)}</span>
      <span className="tabular">{range[1]}{unit}</span>
    </span>
  );
}

function Legend({ overlays }: { overlays: Record<OverlayKey, boolean> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
      {overlays.boundary && <li className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-green" /> Field boundary</li>}
      {overlays.station && <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink ring-2 ring-surface" /> Station</li>}
      {overlays.anomalies && <li className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-dashed border-amber bg-amber-soft" /> Discovery</li>}
      {overlays.moisture && <li className="inline-flex items-center gap-1.5">Soil moisture <Ramp colors={MOISTURE_RAMP} range={MOISTURE_RANGE} unit=" %" /></li>}
      {overlays.ndvi && <li className="inline-flex items-center gap-1.5">NDVI <Ramp colors={NDVI_RAMP} range={NDVI_RANGE} unit="" /></li>}
      {overlays.smap && <li className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-sm border border-dashed border-amber" /> SMAP cell</li>}
    </ul>
  );
}

export function FieldExplorer() {
  const { field, followUps } = useApp();
  const obsQ = useService(`obs:${field.id}`, () => getObservations(field.id));
  const discQ = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [tileError, setTileError] = useState(false);
  const [overlays, setOverlays] = useState(DEFAULT_LAYERS);
  const [selection, setSelection] = useState<Selection>({ type: "field" });
  const [fieldId, setFieldId] = useState(field.id);
  if (fieldId !== field.id) {
    setFieldId(field.id);
    setSelection({ type: "field" });
  }

  const obs = obsQ.data;
  const summary = useMemo(() => (obs && obs.length > 15 ? summariseField(field, obs) : null), [field, obs]);
  const moisture = useMemo(() => (summary ? probeReadings(field, summary.latest.surfaceVwc) : []), [field, summary]);
  const pixels = useMemo(() => (summary?.lastNdvi ? ndviPixels(field, summary.lastNdvi.ndvi as number) : []), [field, summary]);
  const smapBounds = useMemo(() => smapCell(field), [field]);

  if (obsQ.error) return <ErrorState message={obsQ.error} />;
  if (!obs || !summary) return <Loading />;

  const toggle = (k: OverlayKey) => {
    setOverlays((o) => ({ ...o, [k]: !o[k] }));
    // A layer that is switched off cannot stay selected
    if (overlays[k] && ((k === "ndvi" && selection.type === "pixel") || (k === "smap" && selection.type === "smap") || (k === "moisture" && selection.type === "moisture") || (k === "anomalies" && selection.type === "anomaly") || (k === "station" && selection.type === "station"))) setSelection({ type: "field" });
  };
  const detail = describeSelection(selection, { field, summary, moisture, pixels, discoveries: discQ.data ?? [] });
  const schematic = basemap === "schematic" || tileError;

  return (
    <div>
      <PageHeader title="Field Explorer" lead="See where each observation was made, and how much ground it describes." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Card className="overflow-hidden">
            <div className="relative h-[56vh] min-h-[420px] w-full xl:h-[calc(100vh-290px)]">
              <FieldMap field={field} basemap={tileError ? "schematic" : basemap} overlays={overlays} moisture={moisture} pixels={pixels} smapBounds={smapBounds}
                selection={selection} onSelect={setSelection} onTileError={() => setTileError(true)} />
              <div className="absolute right-3 top-3 z-[500] rounded-lg bg-surface p-0.5 shadow-pop">
                <Segmented label="Base map" value={basemap} onChange={(b) => { setBasemap(b); setTileError(false); }}
                  options={[{ value: "satellite", label: "Imagery" }, { value: "street", label: "Street" }, { value: "schematic", label: "Plain" }]} />
              </div>
            </div>
            <div className="space-y-2 border-t border-line px-4 py-3">
              <Legend overlays={overlays} />
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                {tileError && <TriangleAlert size={13} className="mt-0.5 shrink-0 text-amber" aria-hidden />}
                {schematic
                  ? tileError ? "The base map could not be loaded, so a plain map is shown." : "Plain map without imagery."
                  : basemap === "satellite"
                    ? "Base imagery is an archive mosaic of unknown date. It gives context only and is not a current observation of this field."
                    : "Street map for orientation."}
              </p>
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="p-4">
            <h2 className="px-1 text-[15px] font-semibold text-ink">Layers</h2>
            {LAYER_GROUPS.map((group) => (
              <fieldset key={group.title} className="mt-3">
                <legend className="px-1 text-xs font-medium text-muted">{group.title}</legend>
                <ul className="mt-1">
                  {group.layers.map((o) => (
                    <li key={o.key}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-sunken">
                        <input type="checkbox" checked={overlays[o.key]} onChange={() => toggle(o.key)} className="mt-0.5 h-4 w-4" />
                        <span className="min-w-0">
                          <span className="block text-sm text-ink">{o.label}</span>
                          <span className="block text-xs text-muted">{o.hint}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
            <p className="mt-3 border-t border-line px-1 pt-3 text-xs leading-relaxed text-muted">Satellite layers cover areas larger than a plot. They are not plot-level observations.</p>
          </Card>

          <Card className="p-5" as="div">
            <div aria-live="polite">
              <p className="text-xs font-medium text-muted">{detail.type}</p>
              <h2 className="mt-1 text-[17px] font-semibold leading-snug text-ink">{detail.title}</h2>
              <p className="tabular mt-0.5 text-xs text-faint">{coord(detail.position.lat, detail.position.lng)}</p>

              <dl className="mt-4">
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
              <p className={clsx("text-[13px] leading-relaxed text-muted", "mt-3")}>{detail.note}</p>
              {detail.link && <Link href={detail.link.href} className={clsx(LINK, "mt-3")}>{detail.link.label} <ArrowRight size={15} aria-hidden /></Link>}
              {selection.type !== "field" && (
                <button type="button" onClick={() => setSelection({ type: "field" })} className="mt-3 block text-[13px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline">Back to field summary</button>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
