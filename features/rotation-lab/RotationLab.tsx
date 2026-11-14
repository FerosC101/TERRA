"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button, DemoNotice, Eyebrow, Loading, PageHeader, Panel, Segmented } from "@/components/ui";
import { HISTORICAL } from "@/data/scenarios";
import { MONTH_NAMES } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { Priorities } from "@/types";
import { Assumptions } from "./Assumptions";
import { Comparison } from "./Comparison";
import { RotationBuilder } from "./RotationBuilder";
import { useEvaluations } from "./shared";

const PRIORITY_LABELS: { key: keyof Priorities; label: string; hint: string }[] = [
  { key: "water", label: "Meeting water demand", hint: "Crops get the water they need from rain and soil" },
  { key: "diversity", label: "Crop-family diversity", hint: "More families, fewer repeats" },
  { key: "cover", label: "Keeping soil covered", hint: "A living canopy for more of the year" },
  { key: "climate", label: "Avoiding climate stress", hint: "Less water shortage and heat exposure" },
  { key: "nutrients", label: "Nutrient management", hint: "Legumes in the sequence, fewer heavy feeders in a row" },
];

export function RotationLab() {
  const { field, plans, settings, setSettings, priorities, setPriorities, resetRotations } = useApp();
  const all = useEvaluations(plans, HISTORICAL);
  const evaluations = all.data ?? [];
  const compared = plans.filter((p) => p.compare && evaluations.some((e) => e.planId === p.id));
  const comparedEvals = compared.map((p) => evaluations.find((e) => e.planId === p.id)!);
  const annualRain = field.climate.rainMm.reduce((a, b) => a + b, 0);

  return (
    <div>
      <PageHeader eyebrow="Experiment" title="Rotation Lab"
        lead="Build crop sequences and see how they differ in water use, diversity, soil cover and climate exposure on this field. The aim is to understand the trade-offs, not to crown a winner."
        actions={<Button onClick={resetRotations}><RotateCcw size={14} aria-hidden /> Reset to examples</Button>} />

      <div className="mb-5">
        <DemoNotice>
          Results are model estimates from an illustrative climatology for {field.location} ({fmt(annualRain)} mm of rain a year) and typical crop parameters. They compare rotations with each other; they are not yield forecasts.
        </DemoNotice>
      </div>

      {/* Setup */}
      <Panel className="mb-5">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 px-5 py-4">
          <div>
            <div className="mb-1.5 text-xs text-muted">Seasons per year</div>
            <Segmented label="Seasons per year" value={settings.seasonsPerYear} onChange={(v) => setSettings({ ...settings, seasonsPerYear: v })}
              options={[{ value: 2, label: "Two (6-month windows)" }, { value: 3, label: "Three (4-month windows)" }]} />
          </div>
          <label className="text-xs text-muted">
            <span className="mb-1.5 block">First season starts in</span>
            <select value={settings.startMonth} onChange={(e) => setSettings({ ...settings, startMonth: Number(e.target.value) })}
              className="rounded-md border border-line-strong bg-raised px-2.5 py-1.5 text-[13px] text-silver">
              {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </label>
          <div className="text-xs leading-relaxed text-muted">
            <div><span className="text-silver">{field.name}</span> · {field.soil.texture}</div>
            <div>Root zone holds up to {field.soil.awcMmPerM * field.soil.profileDepthM} mm of plant-available water</div>
          </div>
        </div>
      </Panel>

      <Eyebrow className="mb-3">Rotation builder</Eyebrow>
      <RotationBuilder evaluations={evaluations} />

      {/* Farmer-defined priorities */}
      <Panel className="mt-5">
        <div className="border-b border-line px-5 py-3.5">
          <Eyebrow>Your priorities</Eyebrow>
          <p className="mt-1 text-xs text-muted">Set how much each consideration matters on your farm. This only changes the &ldquo;match to your priorities&rdquo; row. Every other figure stays the same.</p>
        </div>
        <div className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-5">
          {PRIORITY_LABELS.map((p) => (
            <label key={p.key} className="block">
              <span className="flex items-baseline justify-between gap-2 text-[13px] font-medium text-silver">{p.label}<span className="tabular text-xs text-muted">{["Ignore", "Low", "Some", "Medium", "High", "Top"][priorities[p.key]]}</span></span>
              <input type="range" min={0} max={5} step={1} value={priorities[p.key]} onChange={(e) => setPriorities({ ...priorities, [p.key]: Number(e.target.value) })} className="mt-2 w-full" />
              <span className="mt-1 block text-[11px] leading-snug text-muted">{p.hint}</span>
            </label>
          ))}
        </div>
      </Panel>

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Comparison · historical conditions</Eyebrow>
          <p className="mt-1 text-xs text-muted">{compared.length} of {plans.length} rotations selected. Tick &ldquo;Compare&rdquo; on a rotation to include it.</p>
        </div>
        <Link href="/future-earth" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-terra-soft hover:text-terra">Test these under climate scenarios <ArrowRight size={14} aria-hidden /></Link>
      </div>

      {!all.data ? <Loading label="Evaluating rotations" /> : compared.length === 0
        ? <Panel><p className="p-8 text-center text-sm text-muted">Tick &ldquo;Compare&rdquo; on at least one rotation above.</p></Panel>
        : <Comparison plans={compared} evaluations={comparedEvals} />}

      <div className="mt-6">
        <Eyebrow className="mb-3">Assumptions and calculation basis</Eyebrow>
        <Assumptions field={field} />
      </div>
    </div>
  );
}
