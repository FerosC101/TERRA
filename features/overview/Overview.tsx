"use client";

import clsx from "clsx";
import { ArrowRight, CloudRain, Compass, Droplets, Leaf, MapPin, Radio, Sprout, Thermometer, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SeriesChart, type SeriesDef } from "@/components/charts/SeriesChart";
import { Eyebrow, Loading, Panel, ProvenanceTag, Segmented, StatusDot } from "@/components/ui";
import { SERIES } from "@/lib/chartTheme";
import { longDate, shortDate } from "@/lib/dates";
import { summariseField } from "@/lib/fieldSummary";
import { coord, fmt, signed } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getObservations } from "@/services/fieldSensorService";
import type { DailyObservation, Discovery, Provenance } from "@/types";

type Metric = "moisture" | "rain" | "temperature" | "vegetation";

const METRICS: Record<Metric, { label: string; unit: string; digits: number; series: SeriesDef[]; note: string }> = {
  moisture: {
    label: "Soil moisture", unit: "% vol.", digits: 1,
    series: [
      { key: "surfaceVwc", label: "Station, 10 cm", color: SERIES.green },
      { key: "deepVwc", label: "Station, 40 cm", color: SERIES.blue },
      { key: "smapVwc", label: "SMAP, ~9 km cell", color: SERIES.amber, sparse: true, dashed: true },
    ],
    note: "The station measures one point in the field. SMAP describes the surrounding ~9 km landscape, so its level differs — compare its direction of change, not its value.",
  },
  rain: {
    label: "Rainfall", unit: "mm/day", digits: 1,
    series: [
      { key: "rainMm", label: "Station gauge", color: SERIES.blue, type: "bar" },
      { key: "rainImergMm", label: "IMERG, ~10 km cell", color: SERIES.amber, type: "line" },
    ],
    note: "The gauge records rain at the station. IMERG is an area-average estimate, so individual storms can differ.",
  },
  temperature: {
    label: "Temperature", unit: "°C", digits: 1,
    series: [
      { key: "soilTempC", label: "Soil, 10 cm (station)", color: SERIES.green },
      { key: "tmaxC", label: "Air, daily max", color: SERIES.amber },
      { key: "lstC", label: "Land surface (ECOSTRESS)", color: SERIES.violet, sparse: true, dashed: true },
    ],
    note: "ECOSTRESS passes at different times of day, so its readings are not directly comparable from one pass to the next.",
  },
  vegetation: {
    label: "Vegetation index", unit: "NDVI", digits: 2,
    series: [{ key: "ndvi", label: "MODIS NDVI, 16-day", color: SERIES.green, sparse: true }],
    note: "One value every 16 days from 250 m pixels. Pixels at the field edge include neighbouring land.",
  },
};

function Indicator({ icon: Icon, label, value, unit, change, kind, tone }: { icon: typeof Droplets; label: string; value: string; unit?: string; change: string; kind: Provenance; tone?: "warning" | "critical" }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-xs text-muted"><Icon size={14} aria-hidden /> {label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={clsx("tabular text-2xl font-semibold", tone === "critical" ? "text-alert" : tone === "warning" ? "text-amber" : "text-silver")}>{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
      <div className="text-xs leading-snug text-muted">{change}</div>
      <ProvenanceTag kind={kind} className="mt-auto self-start" />
    </div>
  );
}

function buildTimeline(obs: DailyObservation[], discoveries: Discovery[], plantedOn: string, cropName: string) {
  const items: { date: string; title: string; detail: string; kind: "discovery" | "observation"; href?: string }[] = [];
  discoveries.forEach((d) => items.push({ date: d.detectedOn, title: d.title, detail: d.summary, kind: "discovery", href: `/discoveries/${d.id}` }));
  const lastNdvi = [...obs].reverse().find((o) => o.ndvi !== null);
  if (lastNdvi) items.push({ date: lastNdvi.date, title: "Vegetation composite received", detail: `MODIS-style 16-day NDVI of ${fmt(lastNdvi.ndvi, 2)}.`, kind: "observation" });
  const lastSmap = [...obs].reverse().find((o) => o.smapVwc !== null);
  if (lastSmap) items.push({ date: lastSmap.date, title: "Satellite soil moisture overpass", detail: `SMAP-style estimate of ${fmt(lastSmap.smapVwc, 1)}% for the ~9 km cell.`, kind: "observation" });
  const lastRain = [...obs].reverse().find((o) => o.rainMm >= 15);
  if (lastRain) items.push({ date: lastRain.date, title: "Last substantial rain", detail: `${fmt(lastRain.rainMm, 0)} mm at the station gauge.`, kind: "observation" });
  const latest = obs[obs.length - 1];
  items.push({ date: latest.date, title: "Daily station summary", detail: `Surface ${fmt(latest.surfaceVwc, 1)}%, 40 cm ${fmt(latest.deepVwc, 1)}%, soil ${fmt(latest.soilTempC, 1)} °C.`, kind: "observation" });
  if (plantedOn >= obs[0].date) items.push({ date: plantedOn, title: `${cropName} planted`, detail: "Planting date from the field record.", kind: "observation" });
  return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
}

export function Overview() {
  const { field, followUps } = useApp();
  const obsQ = useService(`obs:${field.id}`, () => getObservations(field.id));
  const discQ = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));
  const [metric, setMetric] = useState<Metric>("moisture");
  const [range, setRange] = useState<30 | 90 | 240>(90);

  const obs = obsQ.data;
  const discoveries = useMemo(() => discQ.data ?? [], [discQ.data]);
  const summary = useMemo(() => (obs ? summariseField(field, obs) : null), [field, obs]);
  const timeline = useMemo(() => (obs && summary ? buildTimeline(obs, discoveries, field.plantedOn, summary.crop.name) : []), [obs, discoveries, field.plantedOn, summary]);

  if (!obs || !summary) return <Loading />;

  const open = discoveries.filter((d) => d.status !== "resolved");
  const lead = open[0];
  const { latest } = summary;
  const m = METRICS[metric];
  const rainRatio = summary.rainExpected14 ? summary.rain14 / summary.rainExpected14 : 1;

  return (
    <div className="space-y-5">
      {/* Field identity + the one thing most worth attention */}
      <div className="grid gap-5 xl:grid-cols-5">
        <Panel className="relative overflow-hidden xl:col-span-3">
          <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border border-terra/10" />
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border border-terra/15" />
          <div className="relative p-6">
            <Eyebrow className="!text-terra">Field overview</Eyebrow>
            <h1 className="mt-2 font-display text-[26px] font-semibold tracking-wide text-silver sm:text-3xl">{field.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden /> {field.location}</span>
              <span className="tabular">{coord(field.center.lat, field.center.lng)}</span>
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted">Area</dt>
                <dd className="tabular mt-1 text-[15px] font-medium text-silver">{fmt(field.areaHa, 1)} ha</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted">Current crop</dt>
                <dd className="mt-1 flex items-center gap-1.5 text-[15px] font-medium text-silver"><Sprout size={15} className="text-terra" aria-hidden /> {summary.crop.name}</dd>
                <dd className="text-xs text-muted">Day {summary.dap} of ~{summary.duration} · {summary.stage}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted">Last observation</dt>
                <dd className="tabular mt-1 text-[15px] font-medium text-silver">{longDate(latest.date)}</dd>
                <dd className="text-xs text-muted">Daily station summary</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted">Field station</dt>
                <dd className="mt-1 flex items-center gap-2 text-[15px] font-medium text-silver"><Radio size={15} className="text-amber" aria-hidden /> {field.station.id}</dd>
                <dd className="text-xs text-amber">Simulated — no hardware connected</dd>
              </div>
            </dl>
          </div>
        </Panel>

        <Panel className={clsx("xl:col-span-2", lead && "border-terra/30")}>
          <div className="flex h-full flex-col p-6">
            <Eyebrow className="flex items-center gap-2 !text-terra"><Compass size={13} aria-hidden /> {lead ? "TERRA noticed" : "Discovery status"}</Eyebrow>
            {lead ? (
              <>
                <h2 className="mt-3 text-lg font-semibold leading-snug text-silver">{lead.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{lead.summary}</p>
                <p className="mt-3 border-l-2 border-terra/40 pl-3 text-[13px] leading-relaxed text-silver/90">
                  <span className="text-muted">Next best observation: </span>{lead.nextObservation.action}
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
                  <span className="text-xs text-muted">{open.length} open {open.length === 1 ? "discovery" : "discoveries"} · confidence {fmt(lead.confidence * 100)}%</span>
                  <Link href={`/discoveries/${lead.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-terra px-3 py-1.5 text-[13px] font-medium text-forest-deep hover:bg-terra-soft">
                    Investigate <ArrowRight size={14} aria-hidden />
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-lg font-semibold text-silver">No unusual patterns right now</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">The latest observations sit within this field&apos;s usual range. TERRA keeps comparing each new reading with the field&apos;s own history.</p>
                <Link href="/discoveries" className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[13px] font-medium text-terra-soft hover:text-terra">Open Discovery Center <ArrowRight size={14} aria-hidden /></Link>
              </>
            )}
          </div>
        </Panel>
      </div>

      {/* Environmental indicators: one strip, not five cards */}
      <Panel>
        <div className="grid grid-cols-2 divide-line md:grid-cols-3 xl:grid-cols-5 xl:divide-x [&>*]:border-b [&>*]:border-line xl:[&>*]:border-b-0">
          <Indicator icon={Droplets} label="Soil moisture, 10 cm" value={fmt(latest.surfaceVwc, 1)} unit="% vol."
            change={`${signed(summary.surfaceChange14)} pts in 14 days · 40 cm at ${fmt(latest.deepVwc, 1)}%`} kind="measurement"
            tone={summary.surfaceChange14 <= -5 ? "warning" : undefined} />
          <Indicator icon={Thermometer} label="Soil temperature, 10 cm" value={fmt(latest.soilTempC, 1)} unit="°C"
            change={`${signed(summary.soilTempChange14)} °C in 14 days`} kind="measurement" />
          <Indicator icon={CloudRain} label="Rainfall, 14 days" value={fmt(summary.rain14, 0)} unit="mm"
            change={`${fmt(rainRatio * 100)}% of the ~${fmt(summary.rainExpected14, 0)} mm seasonal expectation`} kind="measurement"
            tone={rainRatio < 0.45 || rainRatio > 1.7 ? "warning" : undefined} />
          <Indicator icon={Leaf} label="Vegetation index" value={summary.lastNdvi ? fmt(summary.lastNdvi.ndvi, 2) : "—"} unit="NDVI"
            change={summary.lastNdvi ? `${signed(summary.ndviChange, 2)} vs previous composite · ${shortDate(summary.lastNdvi.date)}` : "No composite yet"} kind="satellite" />
          <div className="col-span-2 flex flex-col gap-2 p-4 md:col-span-1">
            <div className="flex items-center gap-2 text-xs text-muted"><TriangleAlert size={14} aria-hidden /> Environmental anomaly status</div>
            <div className="flex items-center gap-2.5">
              <StatusDot tone={open.length ? "warning" : "good"} pulse={open.length > 0} />
              <span className="text-lg font-semibold text-silver">{open.length ? `${open.length} under review` : "Within usual range"}</span>
            </div>
            <div className="text-xs leading-snug text-muted">{open.length ? open.map((d) => d.category).join(" · ") : "No detector rule is currently met."}</div>
            <Link href="/discoveries" className="mt-auto self-start text-xs font-medium text-terra-soft hover:text-terra">How anomalies are detected</Link>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="self-start xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div>
              <Eyebrow>Environmental trend</Eyebrow>
              <div className="mt-1 text-[15px] font-medium text-silver">{m.label}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Segmented label="Metric" value={metric} onChange={setMetric} options={(Object.keys(METRICS) as Metric[]).map((k) => ({ value: k, label: METRICS[k].label }))} />
              <Segmented label="Time range" value={range} onChange={setRange} options={[{ value: 30, label: "30 d" }, { value: 90, label: "90 d" }, { value: 240, label: "All" }]} />
            </div>
          </div>
          <div className="px-3 pb-2 pt-4 sm:px-5">
            <SeriesChart data={obs.slice(-range)} xKey="date" series={m.series} unit={m.unit} digits={m.digits} xFormat={shortDate} height={380}
              ariaLabel={`${m.label} over the last ${range} days`} />
          </div>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">{m.note} All series in this build are demo data.</p>
        </Panel>

        <Panel>
          <div className="border-b border-line px-5 py-3.5"><Eyebrow>Field intelligence</Eyebrow></div>
          <div className="divide-y divide-line">
            <div className="px-5 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Recent discoveries</h3>
              <ul className="mt-2.5 space-y-2.5">
                {discoveries.length === 0 && <li className="text-[13px] text-muted">None for this field yet.</li>}
                {discoveries.map((d) => (
                  <li key={d.id}>
                    <Link href={`/discoveries/${d.id}`} className="group flex items-start gap-2.5">
                      <span className="mt-1.5"><StatusDot tone={d.status === "resolved" ? "neutral" : "warning"} /></span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-snug text-silver group-hover:text-terra-soft">{d.title}</span>
                        <span className="block text-[11px] text-muted">{d.category} · {shortDate(d.detectedOn)} · {d.status}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-5 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Important changes</h3>
              <ul className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-silver/90">
                <li>Surface moisture {signed(summary.surfaceChange14)} pts and 40 cm moisture {signed(summary.deepChange14)} pts over 14 days.</li>
                <li>{fmt(summary.rain14, 0)} mm of rain in 14 days, {fmt(rainRatio * 100)}% of the seasonal expectation.</li>
                {summary.lastNdvi && <li>NDVI {signed(summary.ndviChange, 2)} between the last two composites.</li>}
              </ul>
            </div>
            <div className="px-5 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Potential risks</h3>
              <ul className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-silver/90">
                {open.filter((d) => d.risk).length === 0 && <li className="text-muted">No risk is flagged by the open discoveries.</li>}
                {open.filter((d) => d.risk).map((d) => <li key={d.id}>{d.risk}</li>)}
              </ul>
              <p className="mt-2 text-[11px] text-muted">Risks are possibilities raised by unconfirmed patterns, not predictions.</p>
            </div>
            <div className="px-5 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Recommended investigations</h3>
              <ul className="mt-2.5 space-y-2 text-[13px] leading-relaxed text-silver/90">
                {open.length === 0 && <li className="text-muted">Nothing to investigate right now.</li>}
                {open.map((d) => (
                  <li key={d.id} className="flex gap-2"><ArrowRight size={14} className="mt-1 shrink-0 text-terra" aria-hidden />{d.nextObservation.action}</li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="border-b border-line px-5 py-3.5"><Eyebrow>Field activity timeline</Eyebrow></div>
        <ol className="px-5 py-4">
          {timeline.map((item, i) => (
            <li key={`${item.date}-${item.title}`} className="relative flex gap-4 pb-5 last:pb-0">
              {i < timeline.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-line" aria-hidden />}
              <span className={clsx("relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2", item.kind === "discovery" ? "border-terra bg-terra/30" : "border-muted bg-forest")} aria-hidden />
              <div className="min-w-0 flex-1 sm:flex sm:gap-6">
                <div className="tabular w-20 shrink-0 text-xs text-muted sm:pt-0.5">{shortDate(item.date)}</div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-silver">
                    {item.href ? <Link href={item.href} className="hover:text-terra-soft">{item.title}</Link> : item.title}
                    {item.kind === "discovery" && <span className="ml-2 rounded bg-terra/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-terra-soft">Discovery</span>}
                  </div>
                  <div className="text-[13px] leading-relaxed text-muted">{item.detail}</div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
