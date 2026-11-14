"use client";

import clsx from "clsx";
import { CloudRain, Droplets, SlidersHorizontal, Sun, Thermometer, ThermometerSun } from "lucide-react";
import { useMemo, useState } from "react";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { DemoNotice, Disclosure, Eyebrow, Loading, PageHeader, Panel, ProvenanceTag, Segmented } from "@/components/ui";
import { CROPS } from "@/data/crops";
import { SCENARIOS } from "@/data/scenarios";
import { CHART } from "@/lib/chartTheme";
import { fmt, pct, signed } from "@/lib/format";
import { ASSUMPTIONS } from "@/lib/science/waterBalance";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { simulateScenarios } from "@/services/climateScenarioService";
import type { RotationEvaluation, Scenario } from "@/types";
import { planColor } from "../rotation-lab/shared";

const ICONS: Record<string, typeof Sun> = { historical: Sun, dry: Droplets, wet: CloudRain, hot: Thermometer, "hot-dry": ThermometerSun, custom: SlidersHorizontal };

type Stress = "water" | "heat" | "excess";
const STRESS: Record<Stress, { label: string; help: string; value: (e: RotationEvaluation) => number; format: (v: number) => string; floor: number }> = {
  water: { label: "Water stress", help: "Share of crop water demand that rain and soil water could not meet.", value: (e) => e.indicators.waterStressShare, format: (v) => pct(v), floor: 0.05 },
  heat: { label: "Heat exposure", help: "Share of mid-season above each crop's indicative heat threshold.", value: (e) => e.indicators.heatShare, format: (v) => pct(v), floor: 0.2 },
  excess: { label: "Excess water", help: "Runoff plus drainage: rain the crops could not use, and a waterlogging and leaching consideration.", value: (e) => e.indicators.excessMm, format: (v) => `${fmt(v)} mm`, floor: 200 },
};

function describe(s: Scenario) {
  if (s.rainChange === 0 && s.tempChangeC === 0) return "No change to average climate";
  const rain = s.rainChange === 0 ? "Rain unchanged" : `Rain ${signed(s.rainChange * 100, 0)}%`;
  const temp = s.tempChangeC === 0 ? "temperature unchanged" : `${signed(s.tempChangeC, 1)} °C`;
  return `${rain} · ${temp}`;
}

export function FutureEarth() {
  const { field, plans, settings, priorities } = useApp();
  const [focusId, setFocusId] = useState("hot-dry");
  const [custom, setCustom] = useState<Scenario>({ id: "custom", name: "Custom scenario", rainChange: -0.15, tempChangeC: 1.5, description: "Your own adjustments." });
  const [excluded, setExcluded] = useState<string[]>([]);
  const [stress, setStress] = useState<Stress>("water");
  const [pickedPlan, setPickedPlan] = useState<string | null>(null);

  const included = plans.filter((p) => !excluded.includes(p.id));
  const scenarios = useMemo(() => [...SCENARIOS, custom], [custom]);
  const req = { fieldId: field.id, plans: included, settings, priorities, scenarios };
  const { data } = useService(JSON.stringify(req), () => simulateScenarios(req));

  // Keep only results that match the current selection while a new run loads
  const results = (data ?? []).map((r) => ({ ...r, evaluations: r.evaluations.filter((e) => included.some((p) => p.id === e.planId)) }));
  const ready = results.length === scenarios.length && results.every((r) => included.every((p) => r.evaluations.some((e) => e.planId === p.id)));
  const get = (scenarioId: string, planId: string) => results.find((r) => r.scenario.id === scenarioId)?.evaluations.find((e) => e.planId === planId);
  const focus = scenarios.find((s) => s.id === focusId) ?? scenarios[0];
  const plan = included.find((p) => p.id === pickedPlan) ?? included[0];

  const unmetRows = ready ? scenarios.map((s) => {
    const row: Record<string, string | number> = { scenario: s.name };
    included.forEach((p) => { row[p.id] = get(s.id, p.id)!.indicators.deficitMm; });
    return row;
  }) : [];

  // Tint cells against the largest value on screen so differences stay visible
  const stressMax = ready ? Math.max(STRESS[stress].floor, ...scenarios.flatMap((s) => included.map((p) => STRESS[stress].value(get(s.id, p.id)!)))) : 1;

  const storageRows = ready && plan ? get("historical", plan.id)!.timeline.map((pt, k) => ({
    label: pt.label,
    historical: pt.storageMm,
    scenario: get(focus.id, plan.id)!.timeline[k]?.storageMm ?? null,
  })) : [];

  return (
    <div>
      <PageHeader eyebrow="Adapt" title="Future Earth" lead="Stress-test your rotations against different climate conditions. See which sequences hold up when rain falls short or temperatures rise, and what it costs them." />

      <div className="mb-5">
        <DemoNotice>
          These are <strong className="font-semibold text-silver">climate scenario simulations</strong>, not weather forecasts. Each scenario applies a fixed change to this field&apos;s average climate. They show how rotations respond to a kind of season, not what any particular year will bring.
        </DemoNotice>
      </div>

      {/* Scenario selector */}
      <Eyebrow className="mb-3">Scenario</Eyebrow>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {scenarios.map((s) => {
          const Icon = ICONS[s.id] ?? Sun;
          const on = s.id === focus.id;
          return (
            <button key={s.id} type="button" onClick={() => setFocusId(s.id)} aria-pressed={on}
              className={clsx("rounded-lg border p-4 text-left transition-colors", on ? "border-terra/60 bg-terra/10" : "border-line bg-surface/80 hover:border-line-strong")}>
              <Icon size={18} className={on ? "text-terra" : "text-muted"} aria-hidden />
              <div className="mt-2.5 text-[13px] font-semibold leading-snug text-silver">{s.name}</div>
              <div className="tabular mt-1 text-[11px] leading-snug text-muted">{describe(s)}</div>
            </button>
          );
        })}
      </div>

      {focus.id === "custom" && (
        <Panel className="mt-3">
          <div className="grid gap-x-10 gap-y-4 px-5 py-4 sm:grid-cols-2">
            <label className="block">
              <span className="flex justify-between text-[13px] font-medium text-silver">Rainfall change <span className="tabular text-muted">{signed(custom.rainChange * 100, 0)}%</span></span>
              <input type="range" min={-50} max={50} step={5} value={Math.round(custom.rainChange * 100)} onChange={(e) => setCustom({ ...custom, rainChange: Number(e.target.value) / 100 })} className="mt-2 w-full" />
              <span className="tabular mt-1 flex justify-between text-[11px] text-muted"><span>−50%</span><span>0</span><span>+50%</span></span>
            </label>
            <label className="block">
              <span className="flex justify-between text-[13px] font-medium text-silver">Temperature change <span className="tabular text-muted">{signed(custom.tempChangeC, 1)} °C</span></span>
              <input type="range" min={0} max={4} step={0.5} value={custom.tempChangeC} onChange={(e) => setCustom({ ...custom, tempChangeC: Number(e.target.value) })} className="mt-2 w-full" />
              <span className="tabular mt-1 flex justify-between text-[11px] text-muted"><span>0 °C</span><span>+2 °C</span><span>+4 °C</span></span>
            </label>
          </div>
        </Panel>
      )}

      {/* Rotations under test */}
      <div className="mb-3 mt-6 flex flex-wrap items-center gap-3">
        <Eyebrow>Rotations under test</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {plans.map((p) => {
            const on = !excluded.includes(p.id);
            return (
              <button key={p.id} type="button" aria-pressed={on} disabled={on && included.length === 1}
                onClick={() => setExcluded((x) => (on ? [...x, p.id] : x.filter((i) => i !== p.id)))}
                className={clsx("inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                  on ? "border-line-strong text-silver" : "border-line text-muted opacity-60 hover:opacity-100")}>
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: on ? planColor(p) : CHART.axis }} aria-hidden />
                {p.name}<span className="hidden text-muted sm:inline">· {p.crops.map((c) => CROPS[c].name).join(" → ")}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!ready ? <Loading label="Running scenario simulations" /> : (
        <div className="space-y-5">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
              <div><Eyebrow>Scenario comparison</Eyebrow><div className="mt-1 text-[15px] font-medium text-silver">Unmet crop water demand under each scenario</div></div>
              <ProvenanceTag kind="simulated" />
            </div>
            <div className="px-3 pb-2 pt-4 sm:px-5">
              <SeriesChart data={unmetRows} xKey="scenario" unit="mm" digits={0} height={300} ariaLabel="Unmet water demand by scenario and rotation" xInterval={0}
                series={included.map((p) => ({ key: p.id, label: p.name, color: planColor(p), type: "bar" as const }))} />
            </div>
            <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">Taller bars mean more of the crops&apos; water need went unmet over the whole rotation. A rotation whose bars stay low across scenarios is less exposed to dry conditions.</p>
          </Panel>

          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <div><Eyebrow>Environmental stress indicators</Eyebrow><div className="mt-1 text-xs text-muted">{STRESS[stress].help}</div></div>
              <Segmented label="Stress indicator" value={stress} onChange={setStress} options={(Object.keys(STRESS) as Stress[]).map((k) => ({ value: k, label: STRESS[k].label }))} />
            </div>
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[640px] border-separate border-spacing-1 text-[13px]">
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-left text-xs font-medium text-muted">Rotation</th>
                    {scenarios.map((s) => <th key={s.id} className={clsx("px-2 py-1.5 text-left text-xs font-medium", s.id === focus.id ? "text-terra-soft" : "text-muted")}>{s.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {included.map((p) => (
                    <tr key={p.id}>
                      <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-silver"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: planColor(p) }} aria-hidden />{p.name}</span></th>
                      {scenarios.map((s) => {
                        const v = STRESS[stress].value(get(s.id, p.id)!);
                        const t = Math.min(1, v / stressMax);
                        return (
                          <td key={s.id} className={clsx("tabular rounded px-2.5 py-2.5 font-medium text-silver", s.id === focus.id && "outline outline-1 outline-terra/50")}
                            style={{ background: `rgba(227, 179, 65, ${0.04 + t * 0.42})` }}>
                            {STRESS[stress].format(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 px-2 text-[11px] text-muted">Deeper amber means a higher value. The outlined column is the selected scenario.</p>
            </div>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel>
              <div className="border-b border-line px-5 py-3.5"><Eyebrow>Estimated water balance</Eyebrow><div className="mt-1 text-[15px] font-medium text-silver">{focus.name} <span className="text-xs font-normal text-muted">· {describe(focus)}</span></div></div>
              <div className="overflow-x-auto">
                <table className="tabular w-full min-w-[520px] text-[13px]">
                  <thead><tr className="border-b border-line text-left text-xs text-muted">{["Rotation", "Rain (P)", "Demand (ETc)", "Met (ETa)", "Runoff (R)", "Drainage (D)", "Unmet", "vs historical"].map((h) => <th key={h} className="px-3 py-2.5 font-medium first:pl-5">{h}</th>)}</tr></thead>
                  <tbody>
                    {included.map((p) => {
                      const e = get(focus.id, p.id)!;
                      const base = get("historical", p.id)!;
                      const runoff = e.seasons.reduce((a, s) => a + s.runoffMm, 0);
                      const drainage = e.seasons.reduce((a, s) => a + s.drainageMm, 0);
                      const delta = e.indicators.deficitMm - base.indicators.deficitMm;
                      return (
                        <tr key={p.id} className="border-b border-line text-silver/90 last:border-0">
                          <td className="whitespace-nowrap py-2.5 pl-5 pr-3 font-medium text-silver"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: planColor(p) }} aria-hidden />{p.name}</span></td>
                          <td className="px-3 py-2.5">{fmt(e.indicators.rainMm)}</td>
                          <td className="px-3 py-2.5">{fmt(e.indicators.demandMm)}</td>
                          <td className="px-3 py-2.5">{fmt(e.indicators.metMm)}</td>
                          <td className="px-3 py-2.5">{fmt(runoff)}</td>
                          <td className="px-3 py-2.5">{fmt(drainage)}</td>
                          <td className="px-3 py-2.5">{fmt(e.indicators.deficitMm)}</td>
                          <td className={clsx("px-3 py-2.5", delta > 20 && "text-amber")}>{delta === 0 ? "—" : signed(delta, 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">All values in mm over the whole rotation. S(t) = S(t−1) + P − ETa − R − D.</p>
            </Panel>

            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <div><Eyebrow>Soil water through the rotation</Eyebrow><div className="mt-1 text-[15px] font-medium text-silver">{focus.name} against historical</div></div>
                {included.length > 1 && plan && <Segmented label="Rotation" value={plan.id} onChange={setPickedPlan} options={included.map((p) => ({ value: p.id, label: p.name }))} />}
              </div>
              <div className="px-3 pb-2 pt-4 sm:px-5">
                {plan && (
                  <SeriesChart data={storageRows} xKey="label" unit="mm" digits={0} height={250} ariaLabel="Root-zone storage under the selected scenario and under historical conditions" xInterval="preserveStartEnd"
                    series={[
                      { key: "historical", label: "Historical conditions", color: CHART.axis, dashed: true },
                      ...(focus.id === "historical" ? [] : [{ key: "scenario", label: focus.name, color: planColor(plan) }]),
                    ]} />
                )}
              </div>
              <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">Plant-available water in the root zone, in ten-day steps. Where the scenario line sits well below the dashed line, crops have less stored water to draw on.</p>
            </Panel>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        <Disclosure title="How scenarios are applied">
          <ul className="list-disc space-y-1.5 pl-4">
            <li>Rainfall change scales every month&apos;s average rainfall by the same percentage. It does not change how rain is distributed within a month or how often dry spells occur.</li>
            <li>Temperature change raises reference evapotranspiration by {fmt(ASSUMPTIONS.et0PerDegree * 100, 1)}% per °C (a simplifying assumption, not a recalculated Penman-Monteith ET0) and is added to monthly maximum temperature for the heat-exposure check.</li>
            <li>Effects of higher CO₂ on crop water use, changes in season length, pests and extreme events such as typhoons are not included.</li>
            <li>The same water-balance model as the Rotation Lab is used, so results are directly comparable.</li>
          </ul>
        </Disclosure>
        <Disclosure title="Where real projections would come from">
          <p>TERRA is designed to draw scenario adjustments from NASA NEX-GDDP-CMIP6, a set of downscaled climate projections at about 25 km. That connection is not active in this build, so the scenarios above are fixed, round-number adjustments chosen to span a plausible range. Even with projections connected, results would describe climate tendencies over decades for a region, not weather for this field in a given season.</p>
        </Disclosure>
      </div>
    </div>
  );
}
