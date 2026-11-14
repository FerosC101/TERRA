"use client";

import { Swatch } from "@/components/ui";
import { useApp } from "@/lib/store";
import type { Priorities as PriorityWeights, RotationEvaluation, RotationPlan } from "@/types";
import { planColor, PRIORITY_MATCH } from "./shared";

const WEIGHTS: { key: keyof PriorityWeights; label: string; hint: string }[] = [
  { key: "water", label: "Meeting water demand", hint: "Share of demand met by rain and soil water" },
  { key: "diversity", label: "Crop-family diversity", hint: "Families per cropped season" },
  { key: "cover", label: "Keeping soil covered", hint: "Time with a living canopy" },
  { key: "climate", label: "Avoiding climate stress", hint: "Less water shortage and heat exposure" },
  { key: "nutrients", label: "Nutrient management", hint: "Legumes in the sequence, fewer heavy feeders in a row" },
];
const LEVELS = ["Ignore", "Low", "Some", "Medium", "High", "Top"];

/**
 * The one composite figure in the lab, shown with its recipe. It summarises the
 * user's own weights; it does not rank rotations by any objective standard.
 */
export function Priorities({ plans, evaluations }: { plans: RotationPlan[]; evaluations: RotationEvaluation[] }) {
  const { priorities, setPriorities } = useApp();
  return (
    <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {WEIGHTS.map((w) => (
          <label key={w.key} className="block">
            <span className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">{w.label}<span className="text-[13px] font-normal text-muted">{LEVELS[priorities[w.key]]}</span></span>
            <input type="range" min={0} max={5} step={1} value={priorities[w.key]} aria-valuetext={LEVELS[priorities[w.key]]}
              onChange={(e) => setPriorities({ ...priorities, [w.key]: Number(e.target.value) })} className="mt-2 w-full" />
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{w.hint}</span>
          </label>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-medium text-ink">Match to your priorities</h3>
        {plans.length === 0 ? <p className="mt-2 text-sm text-muted">Include a rotation in the comparison to see its match.</p> : (
          <ul className="mt-3 space-y-3.5">
            {plans.map((p, i) => {
              const v = PRIORITY_MATCH.value(evaluations[i].indicators, evaluations[i]);
              return (
                <li key={p.id}>
                  <span className="flex items-baseline justify-between gap-3 text-sm"><span className="inline-flex items-center gap-2 text-ink"><Swatch color={planColor(p)} />{p.name}</span><span className="tabular font-medium text-ink">{PRIORITY_MATCH.format(v)}</span></span>
                  <span className="mt-1.5 block h-1.5 rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${v * 100}%`, background: planColor(p) }} /></span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          <span className="font-medium text-ink-soft">How it is calculated:</span> each of the five considerations is scaled from 0 to 1, multiplied by your weight (0 to 5), added up and divided by the total weight. It summarises your stated preferences. It is not a validated score and does not predict yield or profit.
        </p>
      </div>
    </div>
  );
}
