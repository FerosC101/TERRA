"use client";

import clsx from "clsx";
import { ArrowLeft, Check, CircleDashed, HelpCircle, Microscope, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SeriesChart, type SeriesDef } from "@/components/charts/SeriesChart";
import { Button, Eyebrow, Loading, Panel, ProvenanceTag } from "@/components/ui";
import { SERIES } from "@/lib/chartTheme";
import { DEMO_TODAY, longDate, shortDate } from "@/lib/dates";
import { fmt, signed } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getObservations } from "@/services/fieldSensorService";
import type { Discovery, StageKey } from "@/types";
import { Confidence, StatusBadge } from "./shared";

const CHARTS: Record<Discovery["kind"], { title: string; unit: string; digits: number; days: number; series: SeriesDef[] }[]> = {
  "moisture-divergence": [
    { title: "Soil moisture at two depths", unit: "% vol.", digits: 1, days: 60, series: [
      { key: "surfaceVwc", label: "Surface, 10 cm", color: SERIES.green },
      { key: "deepVwc", label: "Deeper, 40 cm", color: SERIES.blue },
    ] },
    { title: "Daily rainfall", unit: "mm", digits: 1, days: 60, series: [{ key: "rainMm", label: "Station gauge", color: SERIES.blue, type: "bar" }] },
  ],
  "rain-departure": [
    { title: "Daily rainfall, two sources", unit: "mm", digits: 1, days: 60, series: [
      { key: "rainMm", label: "Station gauge", color: SERIES.blue, type: "bar" },
      { key: "rainImergMm", label: "IMERG grid cell", color: SERIES.amber },
    ] },
  ],
  "ndvi-change": [
    { title: "Vegetation index composites", unit: "NDVI", digits: 2, days: 240, series: [{ key: "ndvi", label: "MODIS NDVI, 16-day", color: SERIES.green, sparse: true }] },
  ],
  "sensor-offset": [
    { title: "Surface moisture, station and satellite", unit: "% vol.", digits: 1, days: 120, series: [
      { key: "surfaceVwc", label: "Station, 10 cm", color: SERIES.green },
      { key: "smapVwc", label: "SMAP, ~9 km cell", color: SERIES.amber, sparse: true },
    ] },
  ],
};

function FollowUpForm({ d }: { d: Discovery }) {
  const { addFollowUp } = useApp();
  const [surface, setSurface] = useState("");
  const [deep, setDeep] = useState("");
  const s = Number(surface);
  const dp = Number(deep);
  const valid = surface !== "" && deep !== "" && s >= 0 && s <= 60 && dp >= 0 && dp <= 60;
  return (
    <form className="mt-4 rounded-md border border-terra/25 bg-terra/5 p-4"
      onSubmit={(e) => { e.preventDefault(); if (valid) addFollowUp({ discoveryId: d.id, date: DEMO_TODAY, surfaceVwc: s, deepVwc: dp }); }}>
      <div className="text-[13px] font-medium text-silver">Log the follow-up measurement</div>
      <p className="mt-1 text-xs leading-relaxed text-muted">Enter a new reading at each depth. TERRA will compare the surface–deep gap with the one it detected and update the field model.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">Surface, 10 cm (%)
          <input type="number" inputMode="decimal" min={0} max={60} step={0.1} value={surface} onChange={(e) => setSurface(e.target.value)} placeholder="e.g. 16.5"
            className="tabular mt-1 block w-32 rounded-md border border-line-strong bg-forest-deep px-2.5 py-1.5 text-[13px] text-silver placeholder:text-muted/60" />
        </label>
        <label className="text-xs text-muted">Deeper, 40 cm (%)
          <input type="number" inputMode="decimal" min={0} max={60} step={0.1} value={deep} onChange={(e) => setDeep(e.target.value)} placeholder="e.g. 29.0"
            className="tabular mt-1 block w-32 rounded-md border border-line-strong bg-forest-deep px-2.5 py-1.5 text-[13px] text-silver placeholder:text-muted/60" />
        </label>
        <Button type="submit" variant="primary" disabled={!valid}>Add measurement</Button>
      </div>
    </form>
  );
}

export function DiscoveryDetail({ id }: { id: string }) {
  const { field, followUps, clearFollowUps } = useApp();
  const discQ = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));
  const obsQ = useService(`obs:${field.id}`, () => getObservations(field.id));
  const [picked, setPicked] = useState<StageKey | null>(null);

  if (!discQ.data || !obsQ.data) return <Loading />;
  const d = discQ.data.find((x) => x.id === id);

  if (!d) {
    return (
      <Panel>
        <div className="p-8 text-center">
          <p className="text-sm text-silver">This discovery is not active for {field.name}.</p>
          <p className="mt-1 text-xs text-muted">It may belong to another field, or its detector rule is no longer met.</p>
          <Link href="/discoveries" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-terra-soft"><ArrowLeft size={14} aria-hidden /> Discovery Center</Link>
        </div>
      </Panel>
    );
  }

  const activeKey = picked ?? (d.stages.find((s) => s.state === "active") ?? d.stages[d.stages.length - 1]).key;
  const stage = d.stages.find((s) => s.key === activeKey)!;
  const hasFollowUp = followUps.some((f) => f.discoveryId === d.id);
  const digits = d.comparison.unit === "NDVI" ? 2 : 1;

  return (
    <div>
      <Link href="/discoveries" className="no-print mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-silver"><ArrowLeft size={14} aria-hidden /> Discovery Center</Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <StatusBadge status={d.status} /><span>{d.category}</span><span aria-hidden>·</span><span>{field.name}</span><span aria-hidden>·</span><span>Detected {longDate(d.detectedOn)}</span>
        </div>
        <h1 className="mt-3 font-display text-2xl font-semibold uppercase tracking-wider text-silver sm:text-[26px]">{d.title}</h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-silver/85">{d.summary}</p>
      </header>

      {/* Investigation timeline */}
      <Panel className="mb-5">
        <div className="border-b border-line px-5 py-3.5"><Eyebrow>Investigation timeline</Eyebrow></div>
        <div className="p-5">
          <ol className="grid gap-2 sm:grid-cols-5">
            {d.stages.map((s, i) => {
              const sel = s.key === activeKey;
              return (
                <li key={s.key}>
                  <button type="button" onClick={() => setPicked(s.key)} aria-pressed={sel}
                    className={clsx("flex h-full w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors sm:flex-col sm:items-start sm:gap-2",
                      sel ? "border-terra/60 bg-terra/10" : "border-line hover:border-line-strong")}>
                    <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                      s.state === "done" && "border-terra bg-terra text-forest-deep",
                      s.state === "active" && "terra-pulse border-terra text-terra",
                      s.state === "pending" && "border-line-strong text-muted")}>
                      {s.state === "done" ? <Check size={13} aria-hidden /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={clsx("block font-display text-[10px] font-semibold uppercase leading-snug tracking-[0.12em]", s.state === "pending" ? "text-muted" : "text-silver")}>{s.label}</span>
                      <span className="tabular block text-[11px] text-muted">{s.date ? shortDate(s.date) : s.state === "active" ? "In progress" : "Pending"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 rounded-md bg-forest-deep/50 px-4 py-3">
            <div className="text-xs font-medium text-terra-soft">{stage.label}{stage.date ? ` · ${longDate(stage.date)}` : ""}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-silver/90">{stage.detail}</p>
          </div>
          {d.kind === "moisture-divergence" && !hasFollowUp && <FollowUpForm d={d} />}
          {hasFollowUp && (
            <button type="button" onClick={() => clearFollowUps(d.id)} className="no-print mt-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-silver">
              <RotateCcw size={12} aria-hidden /> Remove my follow-up measurement and reopen
            </button>
          )}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {CHARTS[d.kind].map((c) => (
            <Panel key={c.title}>
              <div className="border-b border-line px-5 py-3.5"><Eyebrow>Evidence</Eyebrow><div className="mt-1 text-[15px] font-medium text-silver">{c.title}</div></div>
              <div className="px-3 pb-3 pt-4 sm:px-5">
                <SeriesChart data={obsQ.data!.slice(-c.days)} xKey="date" series={c.series} unit={c.unit} digits={c.digits} xFormat={shortDate}
                  height={c.series[0].type === "bar" && c.series.length === 1 ? 170 : 260} markerX={d.detectedOn} markerLabel="Detected" ariaLabel={c.title} />
              </div>
            </Panel>
          ))}

          {/* Observations — what was actually recorded */}
          <Panel>
            <div className="flex items-center gap-2 border-b border-line px-5 py-3.5"><Microscope size={14} className="text-terra" aria-hidden /><Eyebrow className="!text-terra-soft">Observations · what was recorded</Eyebrow></div>
            <ul className="divide-y divide-line">
              {d.observations.map((o) => (
                <li key={o.label} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
                  <div>
                    <div className="text-[13px] font-medium text-silver">{o.label}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{o.source} · {shortDate(o.date)}</div>
                  </div>
                  <div>
                    <div className="tabular text-[13px] leading-relaxed text-silver/90">{o.value}</div>
                    <ProvenanceTag kind={o.provenance} className="mt-1.5" />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <div className="border-b border-line px-5 py-3.5"><Eyebrow>Compared with history</Eyebrow></div>
            <div className="p-5">
              <div className="text-xs text-muted">{d.comparison.label}</div>
              <div className="mt-2 grid grid-cols-2 gap-4">
                <div><div className="tabular text-2xl font-semibold text-silver">{fmt(d.comparison.current, digits)}</div><div className="text-xs text-muted">Now · {d.comparison.unit}</div></div>
                <div><div className="tabular text-2xl font-semibold text-muted">{fmt(d.comparison.baseline, digits)}</div><div className="text-xs text-muted">Baseline · {d.comparison.unit}</div></div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Difference {signed(d.comparison.current - d.comparison.baseline, digits)} {d.comparison.unit}.
                {d.comparison.zScore !== null && ` That is ${fmt(Math.abs(d.comparison.zScore), 1)} standard deviations from the mean of this field's own record.`}
              </p>
              <div className="mt-4 border-t border-line pt-4"><Confidence value={d.confidence} note={d.confidenceNote} /></div>
            </div>
          </Panel>

          {/* Possible explanations — clearly unconfirmed */}
          <Panel className="border-amber/25">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3.5"><HelpCircle size={14} className="text-amber" aria-hidden /><Eyebrow className="!text-amber">Possible explanations · unconfirmed</Eyebrow></div>
            <div className="p-5">
              <div className="text-xs font-medium text-muted">TERRA&apos;s interpretation</div>
              <p className="mt-1 text-[13px] leading-relaxed text-silver/90">{d.interpretation}</p>
              {d.alternatives.length > 0 && (
                <>
                  <div className="mt-4 text-xs font-medium text-muted">It could also be</div>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-silver/90">
                    {d.alternatives.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center gap-2 border-b border-line px-5 py-3.5"><Check size={14} className="text-silver" aria-hidden /><Eyebrow className="!text-silver">Confirmed findings</Eyebrow></div>
            <div className="p-5">
              {d.confirmed.length === 0
                ? <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted"><CircleDashed size={15} className="mt-0.5 shrink-0" aria-hidden /> Nothing is confirmed yet. The explanations above remain open until follow-up data arrives.</p>
                : <ul className="space-y-2 text-[13px] leading-relaxed text-silver/90">{d.confirmed.map((c) => <li key={c} className="flex gap-2"><Check size={14} className="mt-1 shrink-0 text-terra" aria-hidden />{c}</li>)}</ul>}
            </div>
          </Panel>

          <Panel className="border-terra/30">
            <div className="border-b border-line px-5 py-3.5"><Eyebrow className="!text-terra">Next best observation</Eyebrow></div>
            <div className="p-5">
              <p className="text-[13px] font-medium leading-relaxed text-silver">{d.nextObservation.action}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{d.nextObservation.rationale}</p>
              <Link href="/explorer" className="mt-3 inline-block text-xs font-medium text-terra-soft hover:text-terra">See the location in Field Explorer</Link>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
