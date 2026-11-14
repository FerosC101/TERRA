"use client";

import clsx from "clsx";
import { useState } from "react";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Card, CardHeader, Disclosure, Segmented, SourceTag, Swatch, TABLE, TD, TH } from "@/components/ui";
import { InfoTip } from "@/components/visual/InfoTip";
import { CHART } from "@/lib/chartTheme";
import { fmt } from "@/lib/format";
import type { RotationEvaluation, RotationPlan, Scenario } from "@/types";
import { planColor } from "../rotation-lab/shared";
import { describeScenario, lowestReserve, OUTCOMES, SHORT_NAME, type StressKey } from "./scenario";

interface Props {
  scenarios: Scenario[];
  focus: Scenario;
  plans: RotationPlan[];
  get: (scenarioId: string, planId: string) => RotationEvaluation;
}

const KEYS = Object.keys(OUTCOMES) as StressKey[];

/** One row per outcome, one column per rotation: the value under the scenario, and how far it moved from historical. */
export function ChangeTable({ focus, plans, get }: Props) {
  const historical = focus.id === "historical";
  return (
    <div className="overflow-x-auto">
      <table className={`${TABLE} min-w-[560px]`}>
        <thead>
          <tr>
            <th className={TH}>Outcome</th>
            {plans.map((p) => <th key={p.id} className={TH}><span className="inline-flex items-center gap-2 font-semibold text-ink"><Swatch color={planColor(p)} />{p.name}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {KEYS.map((k) => {
            const o = OUTCOMES[k];
            return (
              <tr key={k}>
                <td className={TD}><span className="inline-flex items-center gap-1 text-ink">{o.label}<InfoTip label={o.label}>{o.help}</InfoTip></span></td>
                {plans.map((p) => {
                  const base = o.value(get("historical", p.id));
                  const now = o.value(get(focus.id, p.id));
                  const changed = o.format(now) !== o.format(base);
                  const worse = o.worseWhen && (o.worseWhen === "higher" ? now > base : now < base);
                  return (
                    <td key={p.id} className={TD}>
                      <span className="tabular font-medium text-ink">{o.format(now)}</span>
                      {!historical && (
                        <span className={clsx("tabular ml-2 text-[13px]", !changed ? "text-faint" : !o.worseWhen ? "text-ink-soft" : worse ? "font-medium text-amber" : "text-green-strong")}>
                          {changed ? o.delta(now, base) : "same"}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!historical && <p className="mt-2 text-[13px] text-muted">Change is against historical conditions: <span className="text-amber">amber</span> is worse, <span className="text-green-strong">green</span> is better.</p>}
    </div>
  );
}

export function ScenarioCharts({ scenarios, focus, plans, get }: Props) {
  const [pickedPlan, setPickedPlan] = useState<string | null>(null);
  const plan = plans.find((p) => p.id === pickedPlan) ?? plans[0];

  // When no scenario leaves demand unmet, the reserve left in the soil is what still differs
  const anyUnmet = scenarios.some((s) => plans.some((p) => get(s.id, p.id).indicators.deficitMm > 0));
  const compareRows = scenarios.map((s) => {
    const row: Record<string, string | number> = { scenario: SHORT_NAME[s.id] ?? s.name };
    plans.forEach((p) => { row[p.id] = anyUnmet ? get(s.id, p.id).indicators.deficitMm : lowestReserve(get(s.id, p.id)); });
    return row;
  });
  const storageRows = plan ? get("historical", plan.id).timeline.map((pt, k) => ({
    label: pt.label, historical: pt.storageMm, scenario: get(focus.id, plan.id).timeline[k]?.storageMm ?? null,
  })) : [];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="pb-4">
        <CardHeader title="Which rotations hold up?" actions={<SourceTag kind="simulated" short />}
          info={anyUnmet ? "Unmet crop water demand for each rotation under every scenario. Low bars mean less exposure to dry conditions." : "Rain and stored water meet all crop demand in every scenario here, so this shows the lowest soil water each rotation reaches. Taller bars mean more water held in reserve."} />
        <div className="px-3 pt-4 sm:px-5">
          <SeriesChart data={compareRows} xKey="scenario" unit={anyUnmet ? "mm of unmet demand over the whole rotation" : "mm left in the root zone at the driest point"} digits={0} height={290} ariaLabel="Unmet water demand by scenario and rotation" xInterval={0}
            series={plans.map((p) => ({ key: p.id, label: p.name, color: planColor(p), type: "bar" as const }))} />
        </div>
      </Card>
      <Card className="pb-4">
        <CardHeader title="Soil water: scenario vs historical" info={`Estimated water in the root zone under ${focus.name.toLowerCase()} (solid) against historical conditions (dashed), in ten-day steps. Where the solid line sits well below the dashed one, crops have less stored water to draw on.`}
          actions={plans.length > 1 && plan ? <Segmented label="Rotation" value={plan.id} onChange={setPickedPlan} options={plans.map((p) => ({ value: p.id, label: p.name }))} /> : <SourceTag kind="simulated" />} />
        <div className="px-3 pt-4 sm:px-5">
          {plan && (
            <SeriesChart data={storageRows} xKey="label" unit="mm available in the root zone" digits={0} height={290} domain={[0, "auto"]} ariaLabel="Root-zone storage under the selected scenario and under historical conditions" xInterval="preserveStartEnd"
              series={[
                { key: "historical", label: "Historical conditions", color: CHART.reference, dashed: true },
                ...(focus.id === "historical" ? [] : [{ key: "scenario", label: focus.name, color: planColor(plan) }]),
              ]} />
          )}
        </div>
      </Card>
    </div>
  );
}

/** Technical detail: the full water balance, and any outcome across every scenario. */
export function ScenarioDetail({ scenarios, focus, plans, get }: Props) {
  const [key, setKey] = useState<StressKey>("reserve");
  const cell = "border-b border-line px-3 py-2.5 first:pl-0";
  return (
    <div className="max-w-4xl">
      <Disclosure title={`Full water balance under ${focus.name.toLowerCase()}`}>
        <p className="mb-3">{describeScenario(focus)}. Millimetres over the whole rotation, from S(t) = S(t−1) + P − ETa − R − D.</p>
        <div className="overflow-x-auto">
          <table className={`${TABLE} tabular min-w-[560px] text-[13px]`}>
            <thead><tr>{["Rotation", "Rain (P)", "Demand (ETc)", "Met (ETa)", "Runoff (R)", "Drainage (D)", "Unmet"].map((h) => <th key={h} className={clsx(cell, "text-left font-medium text-muted")}>{h}</th>)}</tr></thead>
            <tbody>
              {plans.map((p) => {
                const e = get(focus.id, p.id);
                return (
                  <tr key={p.id}>
                    <td className={clsx(cell, "whitespace-nowrap font-medium text-ink")}><span className="inline-flex items-center gap-2"><Swatch color={planColor(p)} />{p.name}</span></td>
                    <td className={cell}>{fmt(e.indicators.rainMm)}</td>
                    <td className={cell}>{fmt(e.indicators.demandMm)}</td>
                    <td className={cell}>{fmt(e.indicators.metMm)}</td>
                    <td className={cell}>{fmt(e.seasons.reduce((a, s) => a + s.runoffMm, 0))}</td>
                    <td className={cell}>{fmt(e.seasons.reduce((a, s) => a + s.drainageMm, 0))}</td>
                    <td className={cell}>{fmt(e.indicators.deficitMm)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Disclosure>
      <Disclosure title="One outcome across every scenario">
        <div className="mb-3"><Segmented label="Outcome" value={key} onChange={setKey} options={KEYS.map((k) => ({ value: k, label: OUTCOMES[k].label }))} /></div>
        <div className="overflow-x-auto">
          <table className={`${TABLE} tabular min-w-[640px] text-[13px]`}>
            <thead><tr><th className={clsx(cell, "text-left font-medium text-muted")}>Rotation</th>{scenarios.map((s) => <th key={s.id} className={clsx(cell, "text-left font-medium", s.id === focus.id ? "text-green-strong" : "text-muted")}>{s.name}</th>)}</tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className={clsx(cell, "whitespace-nowrap font-medium text-ink")}><span className="inline-flex items-center gap-2"><Swatch color={planColor(p)} />{p.name}</span></td>
                  {scenarios.map((s) => <td key={s.id} className={clsx(cell, s.id === focus.id && "bg-green-soft/60 font-medium text-ink")}>{OUTCOMES[key].format(OUTCOMES[key].value(get(s.id, p.id)))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </div>
  );
}
