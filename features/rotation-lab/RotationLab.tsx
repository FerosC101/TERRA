"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button, EmptyState, ErrorState, LINK, Loading, Notice, PageHeader, Section, Segmented } from "@/components/ui";
import { HISTORICAL } from "@/data/scenarios";
import { MONTH_NAMES } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Assumptions } from "./Assumptions";
import { CriteriaTable, SeasonTable, Tradeoffs, WaterCharts } from "./Comparison";
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

  return (
    <div>
      <PageHeader title="Rotation Lab"
        lead="Plan crop sequences for this field and compare how they differ in water use, diversity, soil cover, nutrients and climate exposure. The aim is to understand the trade-offs, not to crown a winner."
        actions={<Button onClick={resetRotations}><RotateCcw size={15} aria-hidden /> Reset to examples</Button>} />

      <div className="space-y-12">
        <Section title="1. Build your rotations" description="Each row is one plan. Read the seasons from left to right, choose a crop for each, and reorder or remove them.">
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
            <p className="text-[13px] leading-relaxed text-muted">
              {field.name} · {field.soil.texture.toLowerCase()} soil<br />
              About {fmt(annualRain)} mm of rain a year · root zone holds up to {field.soil.awcMmPerM * field.soil.profileDepthM} mm
            </p>
          </div>
          <RotationBuilder evaluations={evaluations} />
        </Section>

        <Section title="2. Compare the plans" description={`${compared.length} of ${plans.length} plans included, under average historical conditions for this field.`}
          actions={<Link href="/future-earth" className={LINK}>Test these under climate scenarios <ArrowRight size={15} aria-hidden /></Link>}>
          {all.error ? <ErrorState message={all.error} /> : !all.data ? <Loading label="Evaluating rotations" /> : compared.length === 0 ? (
            <EmptyState title="No plans are included in the comparison">Tick &ldquo;Include in comparison&rdquo; on at least one plan above.</EmptyState>
          ) : (
            <div className="space-y-10">
              <Notice>
                These are model estimates from {field.climate.basis === "retrieved" ? "the NASA POWER climatology for this area" : "an illustrative climatology for this area"} and typical crop parameters. They compare plans with each other. They are not yield forecasts.
              </Notice>
              <div>
                <h3 className="mb-4 text-[15px] font-semibold text-ink">Trade-offs at a glance</h3>
                <Tradeoffs plans={compared} evaluations={comparedEvals} />
                <p className="mt-4 text-[13px] text-muted">No plan is best on everything. Gains and costs are relative to the other plans compared here.</p>
              </div>
              <WaterCharts plans={compared} evaluations={comparedEvals} />
              <div>
                <h3 className="mb-1 text-[15px] font-semibold text-ink">All indicators side by side</h3>
                <CriteriaTable plans={compared} evaluations={comparedEvals} />
              </div>
              <div>
                <h3 className="mb-3 text-[15px] font-semibold text-ink">Season by season</h3>
                <SeasonTable plans={compared} evaluations={comparedEvals} />
              </div>
            </div>
          )}
        </Section>

        <Section title="3. Weigh what matters on your farm" description="Optional. Set how much each consideration matters to you. This changes only the match figure below: every indicator above stays the same.">
          <Priorities plans={compared} evaluations={comparedEvals} />
        </Section>

        <Section title="Methods and assumptions" description="The calculations behind every figure on this page.">
          <Assumptions field={field} />
        </Section>
      </div>
    </div>
  );
}
