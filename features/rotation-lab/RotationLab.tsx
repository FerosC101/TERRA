"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button, EmptyState, ErrorState, LINK, Loading, PageHeader, Section, Segmented } from "@/components/ui";
import { InfoTip } from "@/components/visual/InfoTip";
import { HISTORICAL } from "@/data/scenarios";
import { MONTH_NAMES } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Assumptions } from "./Assumptions";
import { CriteriaTable, RealYearsTable, SeasonTable, Tradeoffs, WaterCharts } from "./Comparison";
import { Priorities } from "./Priorities";
import { RotationBuilder } from "./RotationBuilder";
import { useEvaluations } from "./shared";

export function RotationLab() {
  const { field, plans, settings, setSettings, resetRotations } = useApp();
  const all = useEvaluations(plans, HISTORICAL);
  const evaluations = all.data ?? [];
  const compared = plans.filter((p) => p.compare && evaluations.some((e) => e.planId === p.id));
  const comparedEvals = compared.map((p) => evaluations.find((e) => e.planId === p.id)!);
  const annualRain = field.climate.rainMm.reduce((a, b) => a + b, 0);
  const realYears = comparedEvals.find((e) => e.realYears)?.realYears;
  const realSpan = realYears ? `${realYears.startYears[0]}–${realYears.startYears[realYears.startYears.length - 1] + 1}` : null;

  return (
    <div>
      <PageHeader title="Rotation Lab"
        lead="Plan crop sequences and compare their trade-offs."
        actions={<Button onClick={resetRotations}><RotateCcw size={15} aria-hidden /> Reset to examples</Button>} />

      <div className="space-y-12">
        <Section tour="rotation-build" title="1. Build your rotations" info="Each row is one plan, read left to right. Tap a crop to change it; use the arrows to reorder seasons.">
          <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="mb-1.5 text-[13px] text-ink-soft">Seasons per year</p>
              <Segmented label="Seasons per year" value={settings.seasonsPerYear} onChange={(v) => setSettings({ ...settings, seasonsPerYear: v })}
                options={[{ value: 2, label: "Two, 6 months each" }, { value: 3, label: "Three, 4 months each" }]} />
            </div>
            <label className="text-[13px] text-ink-soft">
              <span className="mb-1.5 block">First season starts in</span>
              <select value={settings.startMonth} onChange={(e) => setSettings({ ...settings, startMonth: Number(e.target.value) })} className="field-input">
                {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            </label>
            <ul className="flex flex-wrap gap-2 text-[13px] text-ink-soft">
              <li className="rounded-full bg-sunken px-3 py-1">{field.soil.texture} soil</li>
              <li className="rounded-full bg-sunken px-3 py-1">~{fmt(annualRain)} mm rain / year</li>
              <li className="rounded-full bg-sunken px-3 py-1">Soil holds {field.soil.awcMmPerM * field.soil.profileDepthM} mm</li>
            </ul>
          </div>
          <RotationBuilder evaluations={evaluations} />
        </Section>

        <Section tour="rotation-compare" title="2. Compare the plans" description={`${compared.length} of ${plans.length} plans · average climate${realSpan ? ` and real years ${realSpan}` : ""}`}
          info={`Model estimates from ${field.climate.basis === "retrieved" ? "the NASA POWER climatology for this area" : "an illustrative climatology"} and typical crop parameters. They compare plans with each other; they are not yield forecasts.`}
          actions={<Link href="/future-earth" className={LINK}>Test these under climate scenarios <ArrowRight size={15} aria-hidden /></Link>}>
          {all.error ? <ErrorState message={all.error} /> : !all.data ? <Loading label="Evaluating rotations" /> : compared.length === 0 ? (
            <EmptyState title="No plans are included in the comparison">Tick &ldquo;Include in comparison&rdquo; on at least one plan above.</EmptyState>
          ) : (
            <div className="space-y-10">
              <div>
                <h3 className="mb-4 flex items-center gap-1.5 text-[15px] font-semibold text-ink">Trade-offs at a glance<InfoTip label="trade-offs">No plan is best on everything. Gains and costs are relative to the other plans compared here.</InfoTip></h3>
                <Tradeoffs plans={compared} evaluations={comparedEvals} />
              </div>
              <WaterCharts plans={compared} evaluations={comparedEvals} />
              <div>
                <h3 className="mb-1 text-[15px] font-semibold text-ink">All indicators side by side</h3>
                <CriteriaTable plans={compared} evaluations={comparedEvals} />
              </div>
              <div>
                <h3 className="mb-3 text-[15px] font-semibold text-ink">Season by season{realSpan ? ", average climate" : ""}</h3>
                <SeasonTable plans={compared} evaluations={comparedEvals} />
              </div>
              {realSpan && (
                <div>
                  <h3 className="mb-1 flex items-center gap-1.5 text-[15px] font-semibold text-ink">How often each season ran short in real years, {realSpan}<InfoTip label="real years">Average monthly climate can hide dry years. Running each plan through every real year shows how often a season runs short, and by how much in the driest years (D-014).</InfoTip></h3>
                  <RealYearsTable plans={compared} evaluations={comparedEvals} />
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title="3. Weigh what matters on your farm" description="Optional" info="Set how much each consideration matters to you. This changes only the match figure: every indicator above stays the same.">
          <Priorities plans={compared} evaluations={comparedEvals} />
        </Section>

        <Section title="Methods and assumptions">
          <Assumptions field={field} realSpan={realSpan} />
        </Section>
      </div>
    </div>
  );
}
