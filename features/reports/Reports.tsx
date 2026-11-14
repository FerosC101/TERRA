"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Badge, Button, ErrorState, Loading, PageHeader, provenanceLabel, SourceTag, TABLE, TD, TH } from "@/components/ui";
import { CropImage, CropSequence } from "@/components/visual/Crop";
import { CROPS } from "@/data/crops";
import { HISTORICAL, SCENARIOS } from "@/data/scenarios";
import { SERIES } from "@/lib/chartTheme";
import { longDate, shortDate } from "@/lib/dates";
import { summariseField } from "@/lib/fieldSummary";
import { coord, fmt, pct, signed } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { simulateScenarios } from "@/services/climateScenarioService";
import { getNasaSnapshot } from "@/services/nasaDataService";
import { getReport } from "@/services/reportService";
import type { DataSource } from "@/types";
import { evidenceLevel, STATUS_LABEL } from "../discovery/shared";
import { CriteriaTable } from "../rotation-lab/Comparison";
import { tradeoffs } from "../rotation-lab/shared";

const SECTIONS = [
  { key: "summary", label: "Field summary" },
  { key: "discoveries", label: "Important discoveries" },
  { key: "trends", label: "Environmental trends" },
  { key: "rotations", label: "Rotation comparisons" },
  { key: "scenarios", label: "Climate scenario results" },
  { key: "sources", label: "Data sources" },
  { key: "limits", label: "Assumptions and limitations" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

function ReportSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-ink [break-after:avoid]"><span className="tabular mr-2.5 text-faint">{n}</span>{title}</h2>
      {children}
    </section>
  );
}

const SOURCE_STATUS: Record<DataSource["integration"], { label: string; tone: "good" | "warning" }> = {
  demo: { label: "Demo values", tone: "warning" },
  snapshot: { label: "Retrieved", tone: "good" },
  live: { label: "Connected", tone: "good" },
};

export function Reports() {
  const { field, plans, settings, priorities, followUps } = useApp();
  const [on, setOn] = useState<Record<SectionKey, boolean>>(() => Object.fromEntries(SECTIONS.map((s) => [s.key, true])) as Record<SectionKey, boolean>);
  const reportQ = useService(`report:${field.id}:${followUps.length}`, () => getReport(field.id, followUps));
  const snapQ = useService(`nasa:${field.id}`, () => getNasaSnapshot(field.id));
  const compared = plans.filter((p) => p.compare);
  const req = { fieldId: field.id, plans: compared, settings, priorities, scenarios: SCENARIOS };
  const simQ = useService(JSON.stringify(req), () => simulateScenarios(req));

  const header = <div className="no-print"><PageHeader title="Field report" lead="A printable summary of what TERRA has observed, discovered and tested for this field."
    actions={<Button variant="primary" onClick={() => window.print()}><Printer size={15} aria-hidden /> Print or save as PDF</Button>} /></div>;

  const report = reportQ.data;
  const sims = simQ.data;
  if (reportQ.error || simQ.error) return <div>{header}<ErrorState message={reportQ.error ?? simQ.error ?? ""} /></div>;
  if (!report || !sims || report.field.id !== field.id) return <div>{header}<Loading label="Assembling report" /></div>;

  const s = summariseField(report.field, report.observations);
  const snapshot = snapQ.data && snapQ.data.fieldId === field.id ? snapQ.data : null;
  const historical = sims.find((r) => r.scenario.id === HISTORICAL.id)?.evaluations ?? [];
  const matched = compared.filter((p) => historical.some((e) => e.planId === p.id));
  const evals = matched.map((p) => historical.find((e) => e.planId === p.id)!);
  const open = report.discoveries.filter((d) => d.status !== "resolved");
  const q = report.quality;
  const extremes = q.issues.filter((i) => i.kind === "extreme");
  const allDemo = report.sources.every((src) => src.integration === "demo");
  let n = 0;

  const measurements: { label: string; value: string; change: string; kind: "measurement" | "satellite" | "model"; date: string }[] = [
    { label: "Soil moisture, 10 cm", value: `${fmt(s.latest.surfaceVwc, 1)} %`, change: `${signed(s.surfaceChange14)} points in 14 days`, kind: "measurement", date: s.latest.date },
    { label: "Soil moisture, 40 cm", value: `${fmt(s.latest.deepVwc, 1)} %`, change: `${signed(s.deepChange14)} points in 14 days`, kind: "measurement", date: s.latest.date },
    { label: "Soil temperature, 10 cm", value: `${fmt(s.latest.soilTempC, 1)} °C`, change: `${signed(s.soilTempChange14)} °C in 14 days`, kind: "measurement", date: s.latest.date },
    { label: `Rainfall, ${shortDate(s.rainPeriodStart)} to ${shortDate(s.latest.date)}`, value: `${fmt(s.rain14)} mm`, change: `${fmt((s.rain14 / Math.max(1, s.rainExpected14)) * 100)}% of the ${fmt(s.rainExpected14)} mm usual`, kind: "measurement", date: s.latest.date },
    ...(s.lastNdvi ? [{ label: "Vegetation index (NDVI)", value: fmt(s.lastNdvi.ndvi, 2), change: `${signed(s.ndviChange, 2)} since the previous composite`, kind: "satellite" as const, date: s.lastNdvi.date }] : []),
    ...(s.lastSmap ? [{ label: "Regional surface moisture (SMAP)", value: `${fmt(s.lastSmap.smapVwc, 1)} %`, change: "~9 km area, not this field alone", kind: "satellite" as const, date: s.lastSmap.date }] : []),
    { label: "Water available in the root zone", value: `${fmt(s.latest.storageMm)} mm`, change: `of ${fmt(s.capacityMm)} mm capacity`, kind: "model", date: s.latest.date },
  ];

  return (
    <div>
      {header}

      <fieldset className="no-print mb-6">
        <legend className="mb-2 text-[13px] font-medium text-ink-soft">Sections to include</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {SECTIONS.map((sec) => (
            <label key={sec.key} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={on[sec.key]} onChange={() => setOn((o) => ({ ...o, [sec.key]: !o[sec.key] }))} className="h-4 w-4" />{sec.label}
            </label>
          ))}
        </div>
      </fieldset>

      <article className="mx-auto max-w-[880px] rounded-xl border border-line bg-surface px-6 pb-4 pt-8 shadow-card sm:px-12 sm:pt-10 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="pb-8">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2"><LogoMark size={22} /><span className="text-[15px] font-semibold tracking-[0.14em] text-ink">TERRA</span></span>
            <span className="text-[13px] text-muted">Generated {longDate(report.generatedOn)}</span>
          </div>
          <div className="mt-8 flex items-center gap-5">
            <CropImage id={report.field.currentCrop} size="lg" />
            <div>
              <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-ink">{report.field.name}</h1>
              <p className="mt-1 text-[15px] text-muted">Field report · {report.field.location}</p>
            </div>
          </div>
          <p className="mt-5 rounded-lg border border-amber-line bg-amber-soft px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
            <strong className="font-medium text-ink">Demonstration report.</strong> The time series in this report were generated locally to demonstrate TERRA: no field station is connected.{allDemo ? " No NASA service was connected either." : " Records marked “Retrieved” in the data sources are real NASA values."} Do not use this report for a real farm decision.
          </p>
        </header>

        {on.summary && (
          <ReportSection n={++n} title="Field summary">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3">
              {[
                ["Location", report.field.location], ["Coordinates", coord(report.field.center.lat, report.field.center.lng)], ["Area", `${fmt(report.field.areaHa, 1)} hectares`],
                ["Soil texture", report.field.soil.texture], ["Current crop", `${s.crop.name}, day ${s.dap} (${s.stage})`], ["Planted", longDate(report.field.plantedOn)],
                ["Last observation", longDate(s.latest.date)], ["Field station", `${report.field.station.id}, simulated`], ["Time zone", report.field.timezone],
              ].map(([k, v]) => (<div key={k}><dt className="text-[13px] text-muted">{k}</dt><dd className="tabular mt-0.5 font-medium text-ink">{v}</dd></div>))}
            </dl>
            <h3 className="mb-1 mt-7 text-sm font-semibold text-ink">Latest measurements</h3>
            <div className="overflow-x-auto">
              <table className={`${TABLE} tabular min-w-[560px]`}>
                <thead><tr><th className={TH}>Measurement</th><th className={TH}>Value</th><th className={TH}>Change or context</th><th className={TH}>Source</th><th className={TH}>Observed</th></tr></thead>
                <tbody>
                  {measurements.map((m) => (
                    <tr key={m.label}><td className={`${TD} text-ink`}>{m.label}</td><td className={`${TD} whitespace-nowrap font-medium text-ink`}>{m.value}</td><td className={TD}>{m.change}</td><td className={TD}><SourceTag kind={m.kind} /></td><td className={`${TD} whitespace-nowrap`}>{shortDate(m.date)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportSection>
        )}

        {on.discoveries && (
          <ReportSection n={++n} title="Important discoveries">
            {report.discoveries.length === 0 && <p className="text-sm text-muted">No detection rule is currently met for this field.</p>}
            <div className="space-y-6">
              {report.discoveries.map((d) => (
                <div key={d.id} className="print-avoid text-sm leading-relaxed">
                  <h3 className="text-[15px] font-semibold text-ink">{d.title}</h3>
                  <p className="text-[13px] text-muted">{STATUS_LABEL[d.status]} · detected {longDate(d.detectedOn)} · evidence: {evidenceLevel(d.confidence).label.toLowerCase()}</p>
                  <p className="mt-2 text-ink-soft"><span className="font-medium text-ink">Observed: </span>{d.summary}</p>
                  <p className="mt-1 text-ink-soft"><span className="font-medium text-ink">{d.status === "resolved" ? "Explanation: " : "Possible explanation (unconfirmed): "}</span>{d.interpretation}</p>
                  {d.confirmed.length > 0 && <p className="mt-1 text-ink-soft"><span className="font-medium text-ink">Confirmed: </span>{d.confirmed.join(" ")}</p>}
                  <p className="mt-1 text-ink-soft"><span className="font-medium text-ink">Next observation: </span>{d.nextObservation.action}</p>
                </div>
              ))}
            </div>
          </ReportSection>
        )}

        {on.trends && (
          <ReportSection n={++n} title="Environmental trends">
            <h3 className="mb-2 text-sm font-semibold text-ink">Soil moisture, {longDate(report.observations.slice(-120)[0].date)} to {longDate(s.latest.date)}</h3>
            <SeriesChart data={report.observations.slice(-120)} xKey="date" unit="% volumetric water content" xFormat={shortDate} height={220} ariaLabel="Soil moisture, last 120 days" series={[
              { key: "surfaceVwc", label: "Surface, 10 cm", color: SERIES.green }, { key: "deepVwc", label: "Deeper, 40 cm", color: SERIES.amber }]} />
            <h3 className="mb-2 mt-7 text-sm font-semibold text-ink">Monthly rainfall against the baseline, 36 months</h3>
            <SeriesChart data={report.anomalies} xKey="month" unit="% above or below baseline" digits={0} height={180} ariaLabel="Monthly rainfall departure" refY={{ value: 0, label: "Baseline" }}
              series={[{ key: "rainAnomalyPct", label: "Rainfall departure", color: SERIES.violet, type: "bar" }]} />
            <p className="mt-4 text-[13px] text-muted">Crop history: {report.field.rotationHistory.map((r) => `${r.season} ${CROPS[r.crop].name}`).join(" → ")}.</p>
          </ReportSection>
        )}

        {on.rotations && (
          <ReportSection n={++n} title="Rotation comparisons">
            {matched.length === 0 ? <p className="text-sm text-muted">No rotation plans are included in the comparison in the Rotation Lab.</p> : (
              <>
                <ul className="mb-4 space-y-4 text-sm leading-relaxed text-ink-soft">
                  {matched.map((p, i) => {
                    const t = tradeoffs(evals[i], evals);
                    return (
                      <li key={p.id}>
                        <span className="mb-1.5 block"><CropSequence crops={p.crops} size="xs" /></span>
                        <span className="font-semibold text-ink">{p.name}</span> <span className="text-muted">({p.crops.map((c) => CROPS[c].name).join(" → ")})</span>
                        {t.gains.length > 0 && <span>: {t.gains.join("; ")}.</span>}
                        {t.costs.length > 0 && <span>{t.gains.length > 0 ? " However, it " : ": "}{t.costs.join("; ")}.</span>}
                      </li>
                    );
                  })}
                </ul>
                <CriteriaTable plans={matched} evaluations={evals} />
                <p className="mt-3 text-[13px] leading-relaxed text-muted">Model estimates under average historical conditions, {settings.seasonsPerYear} seasons a year.</p>
              </>
            )}
          </ReportSection>
        )}

        {on.scenarios && matched.length > 0 && (
          <ReportSection n={++n} title="Climate scenario results">
            <div className="overflow-x-auto">
              <table className={`${TABLE} tabular min-w-[520px]`}>
                <thead><tr><th className={TH}>Scenario</th>{matched.map((p) => <th key={p.id} className={TH}>{p.name}</th>)}</tr></thead>
                <tbody>
                  {sims.map((r) => (
                    <tr key={r.scenario.id}>
                      <td className={TD}><span className="font-medium text-ink">{r.scenario.name}</span><span className="block text-[13px] text-muted">{r.scenario.description}</span></td>
                      {matched.map((p) => {
                        const e = r.evaluations.find((x) => x.planId === p.id);
                        return <td key={p.id} className={TD}>{e ? <><span className="text-ink">{fmt(e.indicators.deficitMm)} mm unmet</span><span className="block text-[13px] text-muted">{pct(e.indicators.waterMetShare)} of demand met · heat exposure {pct(e.indicators.heatShare)}</span></> : "Unavailable"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[13px] leading-relaxed text-muted"><SourceTag kind="simulated" />Scenarios apply fixed changes to average climate. They are not weather forecasts or climate projections.</p>
          </ReportSection>
        )}

        {on.sources && (
          <ReportSection n={++n} title="Data sources">
            <div className="overflow-x-auto">
              <table className={`${TABLE} min-w-[640px] text-[13px]`}>
                <thead><tr><th className={TH}>Source</th><th className={TH}>What it provides</th><th className={TH}>Resolution</th><th className={TH}>Status for this field</th></tr></thead>
                <tbody>
                  {report.sources.map((src) => (
                    <tr key={src.id}>
                      <td className={TD}><span className="font-medium text-ink">{src.name}</span><span className="block text-muted">{src.product}</span><span className="block text-faint">{provenanceLabel(src.kind)}</span></td>
                      <td className={TD}>{src.variable}<span className="mt-0.5 block text-muted">{src.caveat}</span></td>
                      <td className={TD}>{src.spatialResolution}<span className="block text-muted">{src.temporalResolution}</span></td>
                      <td className={TD}><Badge tone={SOURCE_STATUS[src.integration].tone}>{SOURCE_STATUS[src.integration].label}</Badge>{src.statusNote && <span className="mt-1 block text-muted">{src.statusNote}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {snapshot && <p className="mt-3 text-[13px] leading-relaxed text-muted">The retrieved NASA record covers {longDate(snapshot.start)} to {longDate(snapshot.end)} ({snapshot.records.length} days, pipeline location {snapshot.locationId}). It is shown in the Living Field Model under Climate and is not mixed into the demo time series.</p>}
            <h3 className="mb-2 mt-7 text-sm font-semibold text-ink">Record check</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-soft">
              <li>{q.rows} daily records, {q.start ? `${longDate(q.start)} to ${longDate(q.end!)}` : "no dates"}. Dates are local calendar days ({report.field.timezone}).</li>
              <li>{q.duplicatesRemoved} duplicate {q.duplicatesRemoved === 1 ? "date" : "dates"} removed. {q.rowsRejected} {q.rowsRejected === 1 ? "day" : "days"} rejected for a physically impossible value. {q.missingDays} {q.missingDays === 1 ? "day" : "days"} missing.</li>
              <li>Missing values are left unavailable. Nothing is interpolated or replaced with zero.</li>
              <li>{extremes.length === 0 ? "No extreme events flagged." : `${extremes.length} extreme but valid ${extremes.length === 1 ? "event" : "events"} kept and flagged: ${extremes.slice(0, 4).map((i) => `${i.variable.toLowerCase()} ${fmt(i.value, 0)} on ${shortDate(i.date)}`).join("; ")}${extremes.length > 4 ? "; and others" : ""}.`}</li>
            </ul>
          </ReportSection>
        )}

        {on.limits && (
          <ReportSection n={++n} title="Assumptions and limitations">
            <h3 className="text-sm font-semibold text-ink">Recommended next steps</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
              {open.map((d) => <li key={d.id}>{d.nextObservation.action}</li>)}
              {open.length === 0 && <li>No open investigations. Continue routine observation.</li>}
              <li>Before changing a rotation, check the crop parameters against local cultivars and planting dates.</li>
              <li>Arrange a laboratory soil test if nutrient status or organic matter matters to the decision. Field sensors do not measure them.</li>
            </ul>
            <h3 className="mt-6 text-sm font-semibold text-ink">Scientific assumptions</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
              <li>Crop water demand is ETc = Kc × ET0 with FAO-56 style crop coefficients and stage lengths.</li>
              <li>Soil water follows a single-layer, rain-fed balance in ten-day steps on monthly average climate ({report.field.climate.source}).</li>
              <li>Discoveries come from four fixed-threshold rules. Their evidence level is a rule-of-thumb grade, not a probability.</li>
            </ul>
            <h3 className="mt-6 text-sm font-semibold text-ink">Limitations</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
              <li>Station readings describe one point in the field. Satellite products describe areas from 70 m to about 50 km across and are not plot-level measurements.</li>
              <li>Rotation and scenario results compare options. They do not forecast yield, income or soil health.</li>
              <li>Open discoveries are unconfirmed patterns. Their explanations may be wrong.</li>
            </ul>
          </ReportSection>
        )}
      </article>
    </div>
  );
}
