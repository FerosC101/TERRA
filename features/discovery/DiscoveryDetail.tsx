"use client";

import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SeriesChart, type SeriesDef } from "@/components/charts/SeriesChart";
import { Badge, Button, Card, EmptyState, ErrorState, LINK, Loading, Section, SourceTag, TABLE, TD, TH } from "@/components/ui";
import { SERIES } from "@/lib/chartTheme";
import { DEMO_TODAY, longDate, shortDate } from "@/lib/dates";
import { fmt, signed } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getObservations } from "@/services/fieldSensorService";
import type { Discovery } from "@/types";
import { InvestigationSteps } from "./InvestigationSteps";
import { Evidence, StatusBadge } from "./shared";

/** The charts that support each kind of discovery. One question per chart. */
const CHARTS: Record<Discovery["kind"], { title: string; unit: string; digits: number; days: number; series: SeriesDef[] }[]> = {
  "moisture-divergence": [
    { title: "Soil moisture at two depths", unit: "% volumetric water content", digits: 1, days: 60, series: [
      { key: "surfaceVwc", label: "Surface, 10 cm", color: SERIES.green },
      { key: "deepVwc", label: "Deeper, 40 cm", color: SERIES.amber },
    ] },
    { title: "Daily rainfall over the same period", unit: "mm per day", digits: 1, days: 60, series: [{ key: "rainMm", label: "Station gauge", color: SERIES.green, type: "bar" }] },
  ],
  "rain-departure": [
    { title: "Daily rainfall from two sources", unit: "mm per day", digits: 1, days: 60, series: [
      { key: "rainMm", label: "Station gauge", color: SERIES.green, type: "bar" },
      { key: "rainImergMm", label: "IMERG satellite, ~10 km area", color: SERIES.blue },
    ] },
  ],
  "ndvi-change": [
    { title: "Vegetation index composites", unit: "NDVI (0 to 1, unitless)", digits: 2, days: 240, series: [{ key: "ndvi", label: "NDVI, 16-day satellite composite", color: SERIES.blue, sparse: true }] },
  ],
  "sensor-offset": [
    { title: "Surface moisture from the station and the satellite", unit: "% volumetric water content", digits: 1, days: 120, series: [
      { key: "surfaceVwc", label: "Station, 10 cm", color: SERIES.green },
      { key: "smapVwc", label: "SMAP satellite, ~9 km area", color: SERIES.blue, sparse: true },
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
    <form className="no-print mt-5 rounded-lg border border-line bg-sunken/60 p-4"
      onSubmit={(e) => { e.preventDefault(); if (valid) addFollowUp({ discoveryId: d.id, date: DEMO_TODAY, surfaceVwc: s, deepVwc: dp }); }}>
      <p className="text-sm font-medium text-ink">Log a follow-up measurement</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">Enter a new reading at each depth (0 to 60%). TERRA compares the gap between them with the one it detected and updates the field model.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-[13px] text-ink-soft">Surface, 10 cm (%)
          <input type="number" inputMode="decimal" min={0} max={60} step={0.1} value={surface} onChange={(e) => setSurface(e.target.value)} placeholder="16.5" className="field-input tabular mt-1 block w-32" />
        </label>
        <label className="text-[13px] text-ink-soft">Deeper, 40 cm (%)
          <input type="number" inputMode="decimal" min={0} max={60} step={0.1} value={deep} onChange={(e) => setDeep(e.target.value)} placeholder="29.0" className="field-input tabular mt-1 block w-32" />
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

  if (discQ.error || obsQ.error) return <ErrorState message={discQ.error ?? obsQ.error ?? ""} />;
  if (!discQ.data || !obsQ.data) return <Loading />;
  const d = discQ.data.find((x) => x.id === id);
  const back = <Link href="/discoveries" className="no-print mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} aria-hidden /> Discovery Center</Link>;

  if (!d) {
    return (
      <div>
        {back}
        <EmptyState title={`This discovery is not active for ${field.name}`}>It may belong to another field, or its detection rule is no longer met.</EmptyState>
      </div>
    );
  }

  const hasFollowUp = followUps.some((f) => f.discoveryId === d.id);
  const digits = d.comparison.unit === "NDVI" ? 2 : 1;
  const resolved = d.status === "resolved";

  return (
    <div>
      {back}
      <header className="mb-8 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
          <StatusBadge status={d.status} />
          <span>{d.category} · {field.name} · detected {longDate(d.detectedOn)}</span>
        </div>
        <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">{d.title}</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">{d.summary}</p>
      </header>

      <Card className="mb-10 p-5 sm:p-6">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">Investigation progress</h2>
        <InvestigationSteps stages={d.stages} />
      </Card>

      <div className="space-y-12">
        <Section title="What TERRA observed" description="The measurements behind this discovery, each with its source and date.">
          <div className="overflow-x-auto">
            <table className={`${TABLE} min-w-[560px]`}>
              <thead><tr><th className={TH}>Observation</th><th className={TH}>Value</th><th className={TH}>Source</th><th className={TH}>Date</th></tr></thead>
              <tbody>
                {d.observations.map((o) => (
                  <tr key={o.label}>
                    <td className={`${TD} font-medium text-ink`}>{o.label}</td>
                    <td className={`${TD} tabular`}>{o.value}</td>
                    <td className={TD}><SourceTag kind={o.provenance} /><span className="mt-0.5 block text-xs text-faint">{o.source}</span></td>
                    <td className={`${TD} tabular whitespace-nowrap`}>{shortDate(o.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="What it may mean" actions={<Badge tone={resolved ? "neutral" : "warning"}>{resolved ? "Explained" : "Unconfirmed"}</Badge>}
          description={resolved ? "Follow-up data has tested the explanation below." : "These are possible explanations. None has been confirmed yet."}>
          <div className="grid gap-x-12 gap-y-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-ink">{resolved ? "Explanation" : "Most likely explanation"}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{d.interpretation}</p>
              {d.risk && !resolved && <p className="mt-3 text-[15px] leading-relaxed text-ink-soft"><span className="font-medium text-ink">Why it matters: </span>{d.risk}</p>}
            </div>
            <div>
              {d.alternatives.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-ink">It could also be</h3>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-soft">{d.alternatives.map((a) => <li key={a}>{a}</li>)}</ul>
                </>
              )}
            </div>
          </div>
          {d.confirmed.length > 0 && (
            <div className="mt-6 rounded-lg bg-green-soft px-4 py-3.5">
              <h3 className="text-sm font-medium text-green-strong">Confirmed findings</h3>
              <ul className="mt-1.5 space-y-1.5 text-[15px] leading-relaxed text-ink">
                {d.confirmed.map((c) => <li key={c} className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-green" aria-hidden />{c}</li>)}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Supporting evidence" description="How the measurements changed over time, and how the latest value compares with this field's own record.">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-6">
              {CHARTS[d.kind].map((c) => (
                <Card key={c.title} className="p-5 sm:p-6">
                  <h3 className="mb-3 text-[15px] font-semibold text-ink">{c.title}</h3>
                  <SeriesChart data={obsQ.data!.slice(-c.days)} xKey="date" series={c.series} unit={c.unit} digits={c.digits} xFormat={shortDate}
                    height={c.series[0].type === "bar" && c.series.length === 1 ? 180 : 260} markerX={d.detectedOn} markerLabel="Detected" ariaLabel={c.title} />
                </Card>
              ))}
            </div>
            <Card className="self-start p-5">
              <h3 className="text-[15px] font-semibold text-ink">Compared with history</h3>
              <p className="mt-1 text-[13px] text-muted">{d.comparison.label}</p>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <div><dt className="text-[13px] text-muted">Now</dt><dd className="tabular mt-0.5 text-2xl font-semibold text-ink">{fmt(d.comparison.current, digits)} <span className="text-sm font-normal text-muted">{d.comparison.unit}</span></dd></div>
                <div><dt className="text-[13px] text-muted">Usual</dt><dd className="tabular mt-0.5 text-2xl font-semibold text-muted">{fmt(d.comparison.baseline, digits)} <span className="text-sm font-normal">{d.comparison.unit}</span></dd></div>
              </dl>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                A difference of {signed(d.comparison.current - d.comparison.baseline, digits)} {d.comparison.unit}.
                {d.comparison.zScore !== null && ` That is about ${fmt(Math.abs(d.comparison.zScore), 1)} standard deviations from the mean of this field's record.`}
              </p>
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2 text-[13px] text-muted">Confidence that the pattern is real</p>
                <Evidence value={d.confidence} note={d.confidenceNote} />
              </div>
            </Card>
          </div>
        </Section>

        <Section title="What to investigate next" description="The observation most likely to reduce the uncertainty.">
          <div className="max-w-3xl">
            <p className="text-[17px] font-medium leading-relaxed text-ink">{d.nextObservation.action}</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{d.nextObservation.rationale}</p>
            {d.kind === "moisture-divergence" && !hasFollowUp && <FollowUpForm d={d} />}
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/explorer" className={LINK}>See the location in Field Explorer <ArrowRight size={15} aria-hidden /></Link>
              {hasFollowUp && (
                <button type="button" onClick={() => clearFollowUps(d.id)} className="no-print inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
                  <RotateCcw size={14} aria-hidden /> Remove my follow-up measurement and reopen
                </button>
              )}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
