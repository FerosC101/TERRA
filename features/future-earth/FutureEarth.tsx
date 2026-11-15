"use client";

import clsx from "clsx";
import { CloudRain, Droplets, SlidersHorizontal, Sun, Thermometer, ThermometerSun } from "lucide-react";
import { useMemo, useState } from "react";
import { Disclosure, ErrorState, Loading, Notice, PageHeader, Section, Swatch } from "@/components/ui";
import { CropSequence } from "@/components/visual/Crop";
import { SCENARIOS } from "@/data/scenarios";
import { fmt, signed } from "@/lib/format";
import { ASSUMPTIONS } from "@/lib/science/waterBalance";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { simulateScenarios } from "@/services/climateScenarioService";
import type { Scenario } from "@/types";
import { planColor } from "../rotation-lab/shared";
import { describeScenario } from "./scenario";
import { ChangeTable, ScenarioCharts, ScenarioDetail } from "./ScenarioResults";

const ICONS: Record<string, typeof Sun> = { historical: Sun, dry: Droplets, wet: CloudRain, hot: Thermometer, "hot-dry": ThermometerSun, custom: SlidersHorizontal };

export function FutureEarth() {
  const { field, plans, settings, priorities } = useApp();
  const [focusId, setFocusId] = useState("hot-dry");
  const [custom, setCustom] = useState<Scenario>({ id: "custom", name: "Custom scenario", rainChange: -0.15, tempChangeC: 1.5, description: "Your own adjustments." });
  const [excluded, setExcluded] = useState<string[]>([]);

  const included = plans.filter((p) => !excluded.includes(p.id));
  const scenarios = useMemo(() => [...SCENARIOS, custom], [custom]);
  const req = { fieldId: field.id, plans: included, settings, priorities, scenarios };
  const { data, error } = useService(JSON.stringify(req), () => simulateScenarios(req));

  // Keep only results that match the current selection while a new run loads
  const results = (data ?? []).map((r) => ({ ...r, evaluations: r.evaluations.filter((e) => included.some((p) => p.id === e.planId)) }));
  const ready = results.length === scenarios.length && results.every((r) => included.every((p) => r.evaluations.some((e) => e.planId === p.id)));
  const get = (scenarioId: string, planId: string) => results.find((r) => r.scenario.id === scenarioId)!.evaluations.find((e) => e.planId === planId)!;
  const focus = scenarios.find((s) => s.id === focusId) ?? scenarios[0];
  const shared = { scenarios, focus, plans: included, get };

  return (
    <div>
      <PageHeader title="Future Earth" lead="How your rotation plans hold up under a different climate." />

      <div className="space-y-12">
        <Section title="Choose the conditions" info="Each scenario applies a fixed change to this field's average climate.">
          <div role="radiogroup" aria-label="Climate scenario" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {scenarios.map((s) => {
              const Icon = ICONS[s.id] ?? Sun;
              const on = s.id === focus.id;
              return (
                <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => setFocusId(s.id)}
                  className={clsx("rounded-xl border p-4 text-left transition-colors", on ? "border-green bg-green-soft" : "border-line bg-surface shadow-card hover:border-line-strong")}>
                  <Icon size={18} className={on ? "text-green" : "text-muted"} aria-hidden />
                  <span className={clsx("mt-2.5 block text-sm font-medium leading-snug", on ? "text-green-strong" : "text-ink")}>{s.name}</span>
                  <span className="tabular mt-0.5 block text-[13px] leading-snug text-muted">{describeScenario(s)}</span>
                </button>
              );
            })}
          </div>

          {focus.id === "custom" && (
            <div className="mt-4 grid gap-x-10 gap-y-4 rounded-xl bg-sunken px-5 py-4 sm:grid-cols-2">
              <label className="block">
                <span className="flex justify-between text-sm font-medium text-ink">Rainfall change <span className="tabular font-normal text-muted">{signed(custom.rainChange * 100, 0)}%</span></span>
                <input type="range" min={-50} max={50} step={5} value={Math.round(custom.rainChange * 100)} onChange={(e) => setCustom({ ...custom, rainChange: Number(e.target.value) / 100 })} className="mt-2 w-full" />
                <span className="tabular mt-1 flex justify-between text-xs text-muted"><span>−50%</span><span>0</span><span>+50%</span></span>
              </label>
              <label className="block">
                <span className="flex justify-between text-sm font-medium text-ink">Temperature change <span className="tabular font-normal text-muted">{signed(custom.tempChangeC, 1)} °C</span></span>
                <input type="range" min={0} max={4} step={0.5} value={custom.tempChangeC} onChange={(e) => setCustom({ ...custom, tempChangeC: Number(e.target.value) })} className="mt-2 w-full" />
                <span className="tabular mt-1 flex justify-between text-xs text-muted"><span>0 °C</span><span>+2 °C</span><span>+4 °C</span></span>
              </label>
            </div>
          )}

          <div className="mt-6">
            <p className="mb-2 text-[13px] font-medium text-ink-soft">Rotation plans to test</p>
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => {
                const on = !excluded.includes(p.id);
                return (
                  <label key={p.id} className={clsx("inline-flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px]", on ? "border-line-strong bg-surface text-ink" : "border-line text-muted opacity-60")}>
                    <input type="checkbox" checked={on} disabled={on && included.length === 1} onChange={() => setExcluded((x) => (on ? [...x, p.id] : x.filter((i) => i !== p.id)))} className="h-4 w-4" />
                    <Swatch color={planColor(p)} />
                    <span className="font-medium">{p.name}</span>
                    <CropSequence crops={p.crops} size="xs" />
                  </label>
                );
              })}
            </div>
          </div>
        </Section>

        <Section title={focus.id === "historical" ? "Results under historical conditions" : `What changes under ${focus.name.toLowerCase()}`}
          description={describeScenario(focus)}>
          {error ? <ErrorState message={error} /> : !ready ? <Loading label="Running scenario simulations" /> : (
            <div className="space-y-10">
              <Notice tone="caution">
                <strong className="font-medium text-ink">Simulations</strong>, not forecasts or climate projections.
              </Notice>
              <ChangeTable {...shared} />
              <ScenarioCharts {...shared} />
              <ScenarioDetail {...shared} />
            </div>
          )}
        </Section>

        <Section title="Methods and limits">
          <div className="max-w-4xl">
            <Disclosure title="How scenarios are applied">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Rainfall change scales every month&apos;s average rainfall by the same percentage. It does not change how rain is distributed within a month or how often dry spells occur.</li>
                <li>Temperature change raises reference evapotranspiration by {fmt(ASSUMPTIONS.et0PerDegree * 100, 1)}% per °C (a simplifying assumption, not a recalculated Penman-Monteith ET0) and is added to the monthly maximum temperature for the heat-exposure check.</li>
                <li>Effects of higher CO₂ on crop water use, changes in season length, pests and extreme events such as typhoons are not included.</li>
                <li>The same water-balance model as the Rotation Lab is used, so results are directly comparable.</li>
              </ul>
            </Disclosure>
            <Disclosure title="Where real climate projections would come from">
              <p>TERRA is designed to draw scenario adjustments from NASA NEX-GDDP-CMIP6, a set of downscaled climate projections at about 25 km. That connection is not active in this build, so the scenarios above are fixed, round-number adjustments chosen to span a plausible range. Even with projections connected, results would describe climate tendencies over decades for a region, not weather for this field in a given season.</p>
            </Disclosure>
          </div>
        </Section>
      </div>
    </div>
  );
}
