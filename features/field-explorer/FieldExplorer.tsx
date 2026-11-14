"use client";

import clsx from "clsx";
import { ArrowRight, Layers, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Basemap, MoistureReading, NdviPixel, OverlayKey, Selection } from "@/components/maps/FieldMap";
import { moistureColor, ndviColor } from "@/lib/mapColors";
import { Eyebrow, Loading, PageHeader, Panel, ProvenanceTag, Segmented } from "@/components/ui";
import { offset } from "@/data/fields";
import { addDays, longDate } from "@/lib/dates";
import { summariseField } from "@/lib/fieldSummary";
import { clamp, coord, fmt, round } from "@/lib/format";
import { createRng } from "@/lib/rng";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getObservations } from "@/services/fieldSensorService";
import type { Field, LatLng, Provenance } from "@/types";

const FieldMap = dynamic(() => import("@/components/maps/FieldMap"), { ssr: false, loading: () => <Loading label="Loading map" /> });

const OVERLAYS: { key: OverlayKey; label: string; hint: string }[] = [
  { key: "boundary", label: "Field boundary", hint: "Outline from the field record" },
  { key: "station", label: "Field station", hint: "Sensor location" },
  { key: "moisture", label: "Soil moisture points", hint: "Handheld probe readings" },
  { key: "anomalies", label: "Anomaly locations", hint: "Where open discoveries were observed" },
  { key: "ndvi", label: "Vegetation pixels", hint: "MODIS 250 m grid" },
  { key: "smap", label: "SMAP footprint", hint: "The ~9 km cell containing this field" },
];

function inside(p: LatLng, poly: LatLng[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) hit = !hit;
  }
  return hit;
}

/** 250 m pixels that touch the field, with the share of each that lies inside it. */
function buildPixels(field: Field, ndvi: number): NdviPixel[] {
  const rng = createRng(field.seed + 99);
  const out: NdviPixel[] = [];
  for (let gx = -2; gx <= 2; gx++) {
    for (let gy = -2; gy <= 2; gy++) {
      const sw = offset(field.center, gx * 250 - 95, gy * 250 - 140);
      const ne = offset(field.center, gx * 250 + 155, gy * 250 + 110);
      let hits = 0;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        const p = { lat: sw.lat + ((i + 0.5) / 6) * (ne.lat - sw.lat), lng: sw.lng + ((j + 0.5) / 6) * (ne.lng - sw.lng) };
        if (inside(p, field.boundary)) hits++;
      }
      const noise = (rng() - 0.5) * 0.08;
      if (!hits) continue;
      const share = hits / 36;
      // Edge pixels blend toward the (assumed lower) surrounding value
      out.push({ id: `px-${gx}-${gy}`, bounds: [sw, ne], insideShare: share, value: round(clamp(ndvi * (0.82 + 0.18 * share) + noise, 0.1, 0.92), 2) });
    }
  }
  return out;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="tabular text-right text-[13px] text-silver">{children}</dd>
    </div>
  );
}

export function FieldExplorer() {
  const { field, followUps } = useApp();
  const obsQ = useService(`obs:${field.id}`, () => getObservations(field.id));
  const discQ = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [tileError, setTileError] = useState(false);
  const [overlays, setOverlays] = useState<Record<OverlayKey, boolean>>({ boundary: true, station: true, moisture: true, anomalies: true, ndvi: false, smap: false });
  const [selection, setSelection] = useState<Selection>({ type: "field" });
  const [fieldId, setFieldId] = useState(field.id);
  if (fieldId !== field.id) {
    setFieldId(field.id);
    setSelection({ type: "field" });
  }

  const obs = obsQ.data;
  const summary = useMemo(() => (obs && obs.length ? summariseField(field, obs) : null), [field, obs]);
  const moisture = useMemo<MoistureReading[]>(() => {
    if (!summary) return [];
    return field.points.filter((p) => p.kind === "moisture").map((p) => ({
      id: p.id, label: p.label, position: p.position, value: round(clamp(summary.latest.surfaceVwc + (p.moistureOffset ?? 0), 8, 45), 1),
    }));
  }, [field, summary]);
  const pixels = useMemo(() => (summary?.lastNdvi ? buildPixels(field, summary.lastNdvi.ndvi as number) : []), [field, summary]);
  const smapBounds = useMemo<[LatLng, LatLng]>(() => [offset(field.center, -3100, -5200), offset(field.center, 5900, 3800)], [field]);

  if (!obs || !summary) return <Loading />;
  const { latest } = summary;
  const discoveries = discQ.data ?? [];
  const toggle = (k: OverlayKey) => setOverlays((o) => ({ ...o, [k]: !o[k] }));

  // What the information panel shows for the current selection
  let title = field.name;
  let kicker = "Field";
  let position: LatLng = field.center;
  let provenance: Provenance | null = null;
  let body: React.ReactNode = null;
  let note = "";

  if (selection.type === "station") {
    title = field.station.name; kicker = "Field station"; position = field.station.position; provenance = "measurement";
    note = "The station measures a single point. Conditions elsewhere in the field can differ.";
    body = (<>
      <Row label="Status"><span className="text-amber">Simulated — no hardware connected</span></Row>
      <Row label="Soil moisture, 10 cm">{fmt(latest.surfaceVwc, 1)}%</Row>
      <Row label="Soil moisture, 40 cm">{fmt(latest.deepVwc, 1)}%</Row>
      <Row label="Soil temperature, 10 cm">{fmt(latest.soilTempC, 1)} °C</Row>
      <Row label="Bulk EC">{fmt(latest.ecDsM, 2)} dS/m</Row>
      <Row label="Rain today">{fmt(latest.rainMm, 1)} mm</Row>
      <Row label="Observed">{longDate(latest.date)}</Row>
    </>);
  } else if (selection.type === "moisture") {
    const m = moisture.find((x) => x.id === selection.id) ?? moisture[0];
    title = m.label; kicker = "Soil moisture measurement"; position = m.position; provenance = "measurement";
    note = "A handheld probe reading at the surface. It shows how moisture varies across the field compared with the station.";
    body = (<>
      <Row label="Surface moisture"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: moistureColor(m.value) }} />{fmt(m.value, 1)}%</span></Row>
      <Row label="Difference from station">{fmt(m.value - latest.surfaceVwc, 1)} pts</Row>
      <Row label="Depth">0–10 cm</Row>
      <Row label="Observed">{longDate(addDays(latest.date, -1))}</Row>
    </>);
  } else if (selection.type === "anomaly") {
    const point = field.points.find((p) => p.id === selection.id);
    const d = discoveries.find((x) => x.kind === point?.discoveryKind);
    title = d?.title ?? point?.label ?? "Anomaly"; kicker = "Anomaly location"; position = point?.position ?? field.center;
    note = d ? "" : "The detector rule for this location is not currently met.";
    body = d ? (<>
      <p className="pb-2 text-[13px] leading-relaxed text-silver/90">{d.summary}</p>
      <Row label="Status"><span className="capitalize">{d.status}</span></Row>
      <Row label="Detected">{longDate(d.detectedOn)}</Row>
      <Row label="Confidence">{fmt(d.confidence * 100)}%</Row>
      <Link href={`/discoveries/${d.id}`} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-terra-soft hover:text-terra">Open investigation <ArrowRight size={14} aria-hidden /></Link>
    </>) : null;
  } else if (selection.type === "pixel") {
    const p = pixels.find((x) => x.id === selection.id) ?? pixels[0];
    title = "Vegetation pixel"; kicker = "MODIS 250 m grid"; provenance = "satellite";
    position = { lat: (p.bounds[0].lat + p.bounds[1].lat) / 2, lng: (p.bounds[0].lng + p.bounds[1].lng) / 2 };
    note = p.insideShare < 0.6
      ? `Only ${fmt(p.insideShare * 100)}% of this pixel lies inside the field, so its value is mixed with neighbouring land.`
      : "Most of this pixel lies inside the field, so it is a reasonable description of the crop canopy here.";
    body = (<>
      <Row label="NDVI"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ndviColor(p.value) }} />{fmt(p.value, 2)}</span></Row>
      <Row label="Share inside field">{fmt(p.insideShare * 100)}%</Row>
      <Row label="Composite period ending">{longDate(summary.lastNdvi!.date)}</Row>
      <Row label="Pixel size">250 m × 250 m (6.25 ha)</Row>
    </>);
  } else if (selection.type === "smap") {
    title = "SMAP grid cell"; kicker = "Satellite soil moisture"; provenance = "satellite";
    note = `This cell covers about 8,100 ha. The field is ${fmt(field.areaHa, 1)} ha — roughly ${fmt((field.areaHa / 8100) * 100, 2)}% of it. The value describes the wider landscape, not this field.`;
    body = (<>
      <Row label="Surface soil moisture">{summary.lastSmap ? `${fmt(summary.lastSmap.smapVwc, 1)}%` : "—"}</Row>
      <Row label="Station at the same depth">{fmt(latest.surfaceVwc, 1)}%</Row>
      <Row label="Last overpass">{summary.lastSmap ? longDate(summary.lastSmap.date) : "—"}</Row>
      <Row label="Cell size">~9 km × 9 km</Row>
    </>);
  } else {
    kicker = "Selected field";
    body = (<>
      <Row label="Location">{field.location}</Row>
      <Row label="Area">{fmt(field.areaHa, 1)} ha</Row>
      <Row label="Current crop">{summary.crop.name} · day {summary.dap}</Row>
      <Row label="Soil texture">{field.soil.texture}</Row>
      <Row label="Vegetation index">{summary.lastNdvi ? fmt(summary.lastNdvi.ndvi, 2) : "—"} NDVI</Row>
      <Row label="Open discoveries">{discoveries.filter((d) => d.status !== "resolved").length}</Row>
    </>);
    note = "Select a marker, a pixel or the SMAP footprint on the map to inspect it.";
  }

  const schematic = basemap === "schematic" || tileError;

  return (
    <div>
      <PageHeader eyebrow="Observe" title="Field Explorer" lead="Where each observation comes from, and how much ground it actually describes." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-silver"><Layers size={15} className="text-terra" aria-hidden /> Base map</div>
            <Segmented label="Base map" value={basemap} onChange={(b) => { setBasemap(b); setTileError(false); }}
              options={[{ value: "satellite", label: "Satellite imagery" }, { value: "street", label: "Street map" }, { value: "schematic", label: "Schematic" }]} />
          </div>
          <div className="relative h-[58vh] min-h-[420px] w-full xl:h-[calc(100vh-260px)]">
            <FieldMap field={field} basemap={tileError ? "schematic" : basemap} overlays={overlays} moisture={moisture} pixels={pixels} smapBounds={smapBounds}
              selection={selection} onSelect={setSelection} onTileError={() => setTileError(true)} />
            <div className="pointer-events-none absolute left-3 top-3 z-[500] ml-10 max-w-[70%] rounded-md border border-line-strong bg-forest-deep/85 px-2.5 py-1.5 text-[11px] leading-snug text-silver backdrop-blur">
              {schematic
                ? <span className="flex items-center gap-1.5">{tileError && <TriangleAlert size={12} className="text-amber" aria-hidden />}{tileError ? "Imagery could not be loaded. Showing a schematic map without imagery." : "Schematic map — no imagery."}</span>
                : basemap === "satellite"
                  ? "Base imagery is an archive mosaic of unknown date. It is context only, not a current observation of this field."
                  : "Street map for orientation."}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-2.5 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-terra ring-2 ring-forest-deep" /> Station</span>
            <span className="inline-flex items-center gap-1.5">
              Soil moisture
              <span className="flex overflow-hidden rounded-sm">{[14, 19, 23, 27, 32, 37].map((v) => <span key={v} className="h-2.5 w-4" style={{ background: moistureColor(v) }} />)}</span>
              12–38%
            </span>
            <span className="inline-flex items-center gap-1.5">
              NDVI
              <span className="flex overflow-hidden rounded-sm">{[0.25, 0.35, 0.45, 0.55, 0.7, 0.8].map((v) => <span key={v} className="h-2.5 w-4" style={{ background: ndviColor(v) }} />)}</span>
              0.2–0.85
            </span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-dashed border-amber bg-amber/20" /> Anomaly</span>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <div className="border-b border-line px-4 py-3"><Eyebrow>Map layers</Eyebrow></div>
            <ul className="p-2">
              {OVERLAYS.map((o) => (
                <li key={o.key}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-white/[0.04]">
                    <input type="checkbox" checked={overlays[o.key]} onChange={() => toggle(o.key)} className="h-4 w-4 accent-[#39D353]" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-silver">{o.label}</span>
                      <span className="block text-[11px] text-muted">{o.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <div className="border-b border-line px-4 py-3">
              <Eyebrow>{kicker}</Eyebrow>
              <div className="mt-1.5 text-[15px] font-semibold leading-snug text-silver">{title}</div>
              <div className="tabular mt-1 text-xs text-muted">{coord(position.lat, position.lng)}</div>
            </div>
            <div className="px-4 py-3">
              {provenance && <ProvenanceTag kind={provenance} className="mb-2" />}
              <dl className="divide-y divide-line">{body}</dl>
              {note && <p className={clsx("text-xs leading-relaxed text-muted", body && "mt-3 border-t border-line pt-3")}>{note}</p>}
              {selection.type !== "field" && (
                <button type="button" onClick={() => setSelection({ type: "field" })} className="mt-3 text-xs font-medium text-terra-soft hover:text-terra">Back to field summary</button>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
