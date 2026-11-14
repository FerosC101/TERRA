"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Button, Loading, PageHeader, ProvenanceTag } from "@/components/ui";
import { CROPS } from "@/data/crops";
import { HISTORICAL, SCENARIOS } from "@/data/scenarios";
import { SERIES } from "@/lib/chartTheme";
import { longDate, shortDate } from "@/lib/dates";
import { summariseField } from "@/lib/fieldSummary";
import { coord, fmt, pct, signed } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { simulateScenarios } from "@/services/climateScenarioService";
import { getReport } from "@/services/reportService";
import { CriteriaTable } from "../rotation-lab/Comparison";
import { tradeoffs } from "../rotation-lab/shared";

const SECTIONS = [
  { key: "overview", label: "Field overview" },
  { key: "observations", label: "Environmental observations" },
  { key: "discoveries", label: "Important discoveries" },
  { key: "trends", label: "Historical trends" },
  { key: "rotations", label: "Rotation comparisons" },
  { key: "scenarios", label: "Climate scenario results" },
  { key: "recommendations", label: "Recommendations and limitations" },
  { key: "sources", label: "Data sources" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="print-avoid border-t border-line py-7 first:border-0">
      <h2 className="mb-4 flex items-baseline gap-3 font-display text-sm font-semibold uppercase tracking-[0.16em] text-silver">
        <span className="tabular text-terra-deep">{String(n).padStart(2, "0")}</span>{title}
      </h2>
      {children}
    </section>
  );
}

const TH = "px-3 py-2 text-left text-xs font-medium text-muted first:pl-0";
const TD = "px-3 py-2 align-top first:pl-0";

export function Reports() {
  const { field, plans, settings, priorities, followUps } = useApp();
  const [on, setOn] = useState<Record<SectionKey, boolean>>(() => Object.fromEntries(SECTIONS.map((s) => [s.key, true])) as Record<SectionKey, boolean>);
  const reportQ = useService(`report:${field.id}:${followUps.length}`, () => getReport(field.id, followUps));
  const compared = plans.filter((p) => p.compare);
  const req = { fieldId: field.id, plans: compared, settings, priorities, scenarios: SCENARIOS };
  const simQ = useService(JSON.stringify(req), () => simulateScenarios(req));

  const report = reportQ.data;
  const sims = simQ.data;
  if (!report || !sims || report.field.id !== field.id) return <div><PageHeader eyebrow="Report" title="Field Intelligence Report" /><Loading label="Assembling report" /></div>;

  const s = summariseField(report.field, report.observations);
  const historical = sims.find((r) => r.scenario.id === HISTORICAL.id)?.evaluations ?? [];
  const matched = compared.filter((p) => historical.some((e) => e.planId === p.id));
  const evals = matched.map((p) => historical.find((e) => e.planId === p.id)!);
  const open = report.discoveries.filter((d) => d.status !== "resolved");
  let n = 0;

  return (
    <div>
      <PageHeader eyebrow="Report" title="Field Intelligence Report" lead="A printable summary of what TERRA has observed, discovered and tested for this field."
        actions={<Button variant="primary" onClick={() => window.print()}><Printer size={14} aria-hidden /> Print or save as PDF</Button>} />

      <div className="no-print mb-5 flex flex-wrap gap-2" role="group" aria-label="Report sections">
        {SECTIONS.map((sec) => (
          <label key={sec.key} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${on[sec.key] ? "border-line-strong text-silver" : "border-line text-muted"}`}>
            <input type="checkbox" checked={on[sec.key]} onChange={() => setOn((o) => ({ ...o, [sec.key]: !o[sec.key] }))} className="h-3.5 w-3.5 accent-[#39D353]" />{sec.label}
          </label>
        ))}
      </div>

      <article className="mx-auto max-w-[920px] rounded-lg border border-line bg-surface/80 px-6 py-8 sm:px-10 print:max-w-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 pb-7">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <div>
              <div className="font-display text-lg font-bold tracking-[0.28em] text-silver">TERRA</div>
              <div className="text-[9px] tracking-[0.2em] text-muted">DISCOVER. PREDICT. REGENERATE.</div>
            </div>
          </div>
          <div className="text-right text-xs leading-relaxed text-muted">
            <div className="text-sm font-semibold text-silver">Field Intelligence Report</div>
            <div>{report.field.name}</div>
            <div>Generated {longDate(report.generatedOn)}</div>
          </div>
        </header>

        <p className="rounded-md border border-amber/40 px-3.5 py-2.5 text-xs leading-relaxed text-silver">
          <strong className="font-semibold">Demonstration report.</strong> Every value below was generated locally to demonstrate TERRA. No field station or NASA service was connected, and nothing here should be used for a real farm decision.
        </p>

        {on.overview && (
          <Section n={++n} title="Field overview">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-[13px] sm:grid-cols-3">
              {[
                ["Field", report.field.name], ["Location", report.field.location], ["Coordinates", coord(report.field.center.lat, report.field.center.lng)],
                ["Area", `${fmt(report.field.areaHa, 1)} ha`], ["Soil texture", report.field.soil.texture], ["Current crop", `${s.crop.name}, day ${s.dap} (${s.stage})`],
                ["Planted", longDate(report.field.plantedOn)], ["Last observation", longDate(s.latest.date)], ["Field station", `${report.field.station.id} — simulated`],
              ].map(([k, v]) => (<div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="tabular mt-0.5 font-medium text-silver">{v}</dd></div>))}
            </dl>
          </Section>
        )}

        {on.observations && (
          <Section n={++n} title="Environmental observations">
            <table className="tabular w-full text-[13px]">
              <thead><tr className="border-b border-line"><th className={TH}>Variable</th><th className={TH}>Latest value</th><th className={TH}>Change</th><th className={TH}>Source</th></tr></thead>
              <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0">
                <tr><td className={TD}>Soil moisture, 10 cm</td><td className={TD}>{fmt(s.latest.surfaceVwc, 1)}%</td><td className={TD}>{signed(s.surfaceChange14)} pts / 14 d</td><td className={TD}><ProvenanceTag kind="measurement" /></td></tr>
                <tr><td className={TD}>Soil moisture, 40 cm</td><td className={TD}>{fmt(s.latest.deepVwc, 1)}%</td><td className={TD}>{signed(s.deepChange14)} pts / 14 d</td><td className={TD}><ProvenanceTag kind="measurement" /></td></tr>
                <tr><td className={TD}>Soil temperature, 10 cm</td><td className={TD}>{fmt(s.latest.soilTempC, 1)} °C</td><td className={TD}>{signed(s.soilTempChange14)} °C / 14 d</td><td className={TD}><ProvenanceTag kind="measurement" /></td></tr>
                <tr><td className={TD}>Rainfall, 14 days</td><td className={TD}>{fmt(s.rain14)} mm</td><td className={TD}>{fmt((s.rain14 / Math.max(1, s.rainExpected14)) * 100)}% of expected</td><td className={TD}><ProvenanceTag kind="measurement" /></td></tr>
                <tr><td className={TD}>Vegetation index (NDVI)</td><td className={TD}>{s.lastNdvi ? fmt(s.lastNdvi.ndvi, 2) : "—"}</td><td className={TD}>{signed(s.ndviChange, 2)} vs previous composite</td><td className={TD}><ProvenanceTag kind="satellite" /></td></tr>
                <tr><td className={TD}>Regional surface moisture (SMAP)</td><td className={TD}>{s.lastSmap ? `${fmt(s.lastSmap.smapVwc, 1)}%` : "—"}</td><td className={TD}>~9 km cell, {s.lastSmap ? shortDate(s.lastSmap.date) : ""}</td><td className={TD}><ProvenanceTag kind="satellite" /></td></tr>
                <tr><td className={TD}>Root-zone water storage</td><td className={TD}>{fmt(s.latest.storageMm)} mm</td><td className={TD}>of {fmt(s.capacityMm)} mm capacity</td><td className={TD}><ProvenanceTag kind="model" /></td></tr>
              </tbody>
            </table>
          </Section>
        )}

        {on.discoveries && (
          <Section n={++n} title="Important discoveries">
            {report.discoveries.length === 0 && <p className="text-[13px] text-muted">No detector rule is currently met for this field.</p>}
            <div className="space-y-5">
              {report.discoveries.map((d) => (
                <div key={d.id} className="print-avoid text-[13px] leading-relaxed">
                  <div className="font-semibold text-silver">{d.title} <span className="ml-1 text-xs font-normal capitalize text-muted">· {d.status} · detected {shortDate(d.detectedOn)} · confidence {fmt(d.confidence * 100)}%</span></div>
                  <p className="mt-1 text-silver/90">{d.summary}</p>
                  <p className="mt-1 text-muted"><span className="text-silver">{d.status === "resolved" ? "Explanation:" : "Possible explanation (unconfirmed):"}</span> {d.interpretation}</p>
                  {d.confirmed.length > 0 && <p className="mt-1 text-muted"><span className="text-silver">Confirmed:</span> {d.confirmed.join(" ")}</p>}
                  <p className="mt-1 text-muted"><span className="text-silver">Next observation:</span> {d.nextObservation.action}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {on.trends && (
          <Section n={++n} title="Historical trends">
            <div className="mb-1 text-[13px] font-medium text-silver">Soil moisture, last 120 days</div>
            <SeriesChart data={report.observations.slice(-120)} xKey="date" unit="% vol." xFormat={shortDate} height={220} ariaLabel="Soil moisture, last 120 days" series={[
              { key: "surfaceVwc", label: "Surface, 10 cm", color: SERIES.green }, { key: "deepVwc", label: "Deeper, 40 cm", color: SERIES.blue }]} />
            <div className="mb-1 mt-5 text-[13px] font-medium text-silver">Monthly rainfall departure from baseline, 36 months</div>
            <SeriesChart data={report.anomalies} xKey="month" unit="%" digits={0} height={180} ariaLabel="Monthly rainfall departure" refY={{ value: 0, label: "Baseline" }}
              series={[{ key: "rainAnomalyPct", label: "Rainfall departure", color: SERIES.blue, type: "bar" }]} />
            <p className="mt-3 text-xs text-muted">Crop history: {report.field.rotationHistory.map((r) => `${r.season} ${CROPS[r.crop].name}`).join(" → ")}.</p>
          </Section>
        )}

        {on.rotations && (
          <Section n={++n} title="Rotation comparisons">
            {matched.length === 0 ? <p className="text-[13px] text-muted">No rotations are selected for comparison in the Rotation Lab.</p> : (
              <>
                <ul className="mb-4 space-y-2 text-[13px] leading-relaxed">
                  {matched.map((p, i) => {
                    const t = tradeoffs(evals[i], evals);
                    return (
                      <li key={p.id}>
                        <span className="font-semibold text-silver">{p.name}</span> <span className="text-muted">({p.crops.map((c) => CROPS[c].name).join(" → ")})</span>
                        {t.gains.length > 0 && <span className="text-silver/90"> — {t.gains.join("; ")}.</span>}
                        {t.costs.length > 0 && <span className="text-silver/90">{t.gains.length > 0 ? " However, it " : " — "}{t.costs.join("; ")}.</span>}
                      </li>
                    );
                  })}
                </ul>
                <div className="-mx-5"><CriteriaTable plans={matched} evaluations={evals} /></div>
                <p className="mt-3 text-xs leading-relaxed text-muted">Model estimates under historical average conditions, {settings.seasonsPerYear} seasons a year. &ldquo;Match to your priorities&rdquo; is a weighted summary of your own stated preferences, not a validated score.</p>
              </>
            )}
          </Section>
        )}

        {on.scenarios && matched.length > 0 && (
          <Section n={++n} title="Climate scenario results">
            <table className="tabular w-full text-[13px]">
              <thead>
                <tr className="border-b border-line"><th className={TH}>Scenario</th>{matched.map((p) => <th key={p.id} className={TH}>{p.name}</th>)}</tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0">
                {sims.map((r) => (
                  <tr key={r.scenario.id}>
                    <td className={TD}><div className="font-medium text-silver">{r.scenario.name}</div><div className="text-xs text-muted">{r.scenario.description}</div></td>
                    {matched.map((p) => {
                      const e = r.evaluations.find((x) => x.planId === p.id);
                      return <td key={p.id} className={TD}>{e ? <>{fmt(e.indicators.deficitMm)} mm unmet<div className="text-xs text-muted">{pct(e.indicators.waterMetShare)} met · heat {pct(e.indicators.heatShare)}</div></> : "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs leading-relaxed text-muted"><ProvenanceTag kind="simulated" className="mr-1.5" />Scenario simulations apply fixed changes to average climate. They are not weather forecasts.</p>
          </Section>
        )}

        {on.recommendations && (
          <Section n={++n} title="Recommendations and limitations">
            <h3 className="text-[13px] font-semibold text-silver">Recommended next steps</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-silver/90">
              {open.map((d) => <li key={d.id}>{d.nextObservation.action}</li>)}
              {open.length === 0 && <li>No open investigations. Continue routine observation.</li>}
              <li>Before changing a rotation, check the crop parameters against local cultivars and planting dates.</li>
              <li>Arrange a laboratory soil test if nutrient status or organic matter matters to the decision. Field sensors do not measure them.</li>
            </ul>
            <h3 className="mt-5 text-[13px] font-semibold text-silver">Limitations</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-silver/90">
              <li>Station readings describe one point in the field. Satellite products describe areas from 70 m to about 50 km across and are not field-plot measurements.</li>
              <li>Rotation and scenario results come from a simplified, rain-fed, single-layer water balance on monthly average climate. They compare options; they do not forecast yield, income or soil health.</li>
              <li>Open discoveries are unconfirmed patterns. Their explanations may be wrong.</li>
              <li>This report uses demonstration data throughout.</li>
            </ul>
          </Section>
        )}

        {on.sources && (
          <Section n={++n} title="Data sources">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead><tr className="border-b border-line"><th className={TH}>Source</th><th className={TH}>Variable</th><th className={TH}>Spatial</th><th className={TH}>Temporal</th><th className={TH}>Status in this report</th></tr></thead>
                <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0">
                  {report.sources.map((src) => (
                    <tr key={src.id}>
                      <td className={TD}><div className="font-medium text-silver">{src.name}</div><div className="text-muted">{src.product}</div></td>
                      <td className={`${TD} text-silver/90`}>{src.variable}<div className="mt-0.5 text-muted">{src.caveat}</div></td>
                      <td className={`${TD} text-silver/90`}>{src.spatialResolution}</td>
                      <td className={`${TD} text-silver/90`}>{src.temporalResolution}</td>
                      <td className={`${TD} text-amber`}>{src.integration === "demo" ? "Not connected — demo values" : "Connected"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </article>
    </div>
  );
}
