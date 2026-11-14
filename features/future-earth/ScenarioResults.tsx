"use client";

import clsx from "clsx";
import { Fragment, useState } from "react";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Card, CardHeader, Disclosure, Segmented, SourceTag, Swatch, TABLE, TD, TH } from "@/components/ui";
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

/** For each rotation: what it looks like historically, under the scenario, and the change between them. */
export function ChangeTable({ focus, plans, get }: Props) {
  const historical = focus.id === "historical";
  return (
    <div className="overflow-x-auto">
      <table className={`${TABLE} min-w-[620px]`}>
        <thead>
          <tr>
            <th className={TH}>Outcome</th>
            <th className={TH}>Historical</th>
            {!historical && <><th className={TH}>{focus.name}</th><th className={TH}>Change</th></>}
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <Fragment key={p.id}>
              <tr><th colSpan={historical ? 2 : 4} scope="colgroup" className="pb-1 pt-5 text-left text-sm font-semibold text-ink"><span className="inline-flex items-center gap-2"><Swatch color={planColor(p)} />{p.name}</span></th></tr>
              {KEYS.map((k) => {
                const o = OUTCOMES[k];
                const base = o.value(get("historical", p.id));
                const now = o.value(get(focus.id, p.id));
                const worse = o.worseWhen && (o.worseWhen === "higher" ? now > base : now < base);
                const changed = o.format(now) !== o.format(base);
                return (
                  <tr key={k}>
                    <td className={TD}><span className="text-ink">{o.label}</span><span className="block text-[13px] text-muted">{o.help}</span></td>
                    <td className={`${TD} tabular`}>{o.format(base)}</td>
                    {!historical && (
                      <>
                        <td className={`${TD} tabular font-medium text-ink`}>{o.format(now)}</td>
                        <td className={clsx(TD, "tabular whitespace-nowrap", changed && worse && "font-medium text-amber")}>{changed ? o.delta(now, base) : "No change"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
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
      <Card className="pb-3">
        <CardHeader title="Which rotations hold up when conditions change?" actions={<SourceTag kind="simulated" />}
          description={anyUnmet ? "Unmet crop water demand for each rotation under every scenario." : "Rain and stored water meet all crop demand in every scenario here, so this shows the lowest soil water each rotation reaches."} />
        <div className="px-3 pt-4 sm:px-5">
          <SeriesChart data={compareRows} xKey="scenario" unit={anyUnmet ? "mm of unmet demand over the whole rotation" : "mm left in the root zone at the driest point"} digits={0} height={290} ariaLabel="Unmet water demand by scenario and rotation" xInterval={0}
            series={plans.map((p) => ({ key: p.id, label: p.name, color: planColor(p), type: "bar" as const }))} />
        </div>
        <p className="px-5 pt-2 text-[13px] leading-relaxed text-muted sm:px-6">{anyUnmet ? "A rotation whose bars stay low across scenarios is less exposed to dry conditions." : "Taller bars mean more water held in reserve. A rotation whose bars stay tall is further from running short."}</p>
      </Card>
      <Card className="pb-3">
        <CardHeader title="When does the soil have less water to give?" description={`Estimated water in the root zone under ${focus.name.toLowerCase()}, against historical conditions.`}
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
        <p className="px-5 pt-2 text-[13px] leading-relaxed text-muted sm:px-6">Ten-day steps. Where the scenario line sits well below the dashed line, crops have less stored water to draw on.</p>
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
