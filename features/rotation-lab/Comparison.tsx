"use client";

import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Card, CardHeader, Segmented, SourceTag, Swatch, TABLE } from "@/components/ui";
import { CropSequence } from "@/components/visual/Crop";
import { InfoTip } from "@/components/visual/InfoTip";
import { CROPS } from "@/data/crops";
import { SERIES } from "@/lib/chartTheme";
import { pct } from "@/lib/format";
import type { Provenance, RotationEvaluation, RotationPlan } from "@/types";
import { BETTER_HINT, CRITERIA, planColor, tradeoffs, type CriterionGroup } from "./shared";

interface Props {
  plans: RotationPlan[];
  evaluations: RotationEvaluation[];
  /** "model" under historical conditions, "simulated" under a climate scenario */
  provenance?: Provenance;
}

const GROUPS: CriterionGroup[] = ["Water", "Crop diversity", "Soil cover", "Nutrient management", "Climate exposure"];

/** What each plan gains and gives up against the others, in plain words. */
export function Tradeoffs({ plans, evaluations }: Props) {
  return (
    <div className="grid gap-x-10 gap-y-7" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
      {plans.map((p, i) => {
        const t = tradeoffs(evaluations[i], evaluations);
        return (
          <div key={p.id}>
            <p className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Swatch color={planColor(p)} />{p.name}</p>
            <div className="mt-2"><CropSequence crops={p.crops} size="xs" /></div>
            <ul className="mt-3 space-y-1.5 text-sm leading-snug text-ink-soft">
              {t.gains.map((g) => <li key={g} className="flex gap-2"><Plus size={15} className="mt-0.5 shrink-0 text-green" aria-label="Gain:" />{g}</li>)}
              {t.costs.map((g) => <li key={g} className="flex gap-2"><Minus size={15} className="mt-0.5 shrink-0 text-amber" aria-label="Cost:" />{g}</li>)}
              {t.gains.length + t.costs.length === 0 && <li className="text-muted">{plans.length < 2 ? "Include at least two rotations to see trade-offs." : "Sits between the others on every indicator."}</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Every indicator, grouped by what it describes, with its meaning beside it. */
export function CriteriaTable({ plans, evaluations }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className={`${TABLE} min-w-[600px]`}>
        <thead>
          <tr className="border-b border-line-strong">
            <th className="py-3 pr-4 text-left text-[13px] font-medium text-muted">Indicator</th>
            {plans.map((p) => <th key={p.id} className="px-3 py-3 text-left font-semibold text-ink"><span className="inline-flex items-center gap-2"><Swatch color={planColor(p)} />{p.name}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => (
            <Fragment key={group}>
              <tr><th colSpan={plans.length + 1} scope="colgroup" className="pb-1 pt-5 text-left text-[13px] font-medium uppercase tracking-wide text-muted">{group}</th></tr>
              {CRITERIA.filter((c) => c.group === group).map((c) => {
                const values = evaluations.map((e) => c.value(e.indicators, e));
                const max = c.max ?? Math.max(...values, 1);
                return (
                  <tr key={c.key} className="border-b border-line">
                    <th scope="row" className="max-w-[300px] py-3 pr-4 text-left align-top font-normal">
                      <span className="flex items-center gap-1 font-medium text-ink">{c.label}<InfoTip label={c.label}>{c.help} {BETTER_HINT[c.better ?? "none"]}.</InfoTip></span>
                    </th>
                    {plans.map((p, i) => (
                      <td key={p.id} className="px-3 py-3 align-top">
                        <span className="tabular block font-medium text-ink">{c.format(values[i])}</span>
                        <span className="mt-1.5 block h-1.5 w-full max-w-[120px] rounded-full bg-sunken">
                          <span className="block h-full rounded-full" style={{ width: `${values[i] === 0 ? 0 : Math.max(3, (values[i] / max) * 100)}%`, background: planColor(p) }} />
                        </span>
                      </td>
                    ))}
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

function WaterCharts({ plans, evaluations, provenance = "model" }: Props) {
  const waterRows = useMemo(() => plans.map((p, i) => ({
    name: p.name, demand: evaluations[i].indicators.demandMm, met: evaluations[i].indicators.metMm,
  })), [plans, evaluations]);

  const storageRows = useMemo(() => {
    const longest = Math.max(...evaluations.map((e) => e.timeline.length));
    return Array.from({ length: longest }, (_, k) => {
      const row: Record<string, string | number | null> = { label: "" };
      evaluations.forEach((e) => {
        row[e.planId] = e.timeline[k]?.storageMm ?? null;
        if (e.timeline[k]) row.label = e.timeline[k].label;
      });
      return row;
    });
  }, [evaluations]);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="pb-3">
        <CardHeader title="Water needed vs supplied" info="Water demand over the whole rotation against what rain and stored soil water could meet. The gap between each pair of bars is demand the field could not meet without irrigation." actions={<SourceTag kind={provenance} short />} />
        <div className="px-3 pt-4 sm:px-5">
          <SeriesChart data={waterRows} xKey="name" unit="mm over the whole rotation" digits={0} height={260} ariaLabel="Water demand and supply by rotation" series={[
            { key: "demand", label: "Estimated water demand", color: SERIES.blue, type: "bar" },
            { key: "met", label: "Met by rain and soil water", color: SERIES.green, type: "bar" },
          ]} />
        </div>
      </Card>
      <Card className="pb-3">
        <CardHeader title="Soil water through the rotation" info="Estimated water available to the crop in the root zone, in ten-day steps. S1, S2 and so on are seasons. Low points are when a crop is most likely to run short." actions={<SourceTag kind={provenance} short />} />
        <div className="px-3 pt-4 sm:px-5">
          <SeriesChart data={storageRows} xKey="label" unit="mm available in the root zone" digits={0} height={260} domain={[0, "auto"]} ariaLabel="Root-zone water storage through each rotation" xInterval="preserveStartEnd"
            series={plans.map((p) => ({ key: p.id, label: p.name, color: planColor(p) }))} />
        </div>
      </Card>
    </div>
  );
}

function SeasonTable({ plans, evaluations }: Props) {
  const [pickedId, setPickedId] = useState(plans[0]?.id);
  const picked = plans.find((p) => p.id === pickedId) ?? plans[0];
  const evaluation = evaluations.find((e) => e.planId === picked?.id);
  if (!picked || !evaluation) return null;
  const cell = "border-b border-line px-3 py-2.5 first:pl-0";
  return (
    <div>
      {plans.length > 1 && <div className="mb-3"><Segmented label="Rotation" value={picked.id} onChange={setPickedId} options={plans.map((p) => ({ value: p.id, label: p.name }))} /></div>}
      <div className="overflow-x-auto">
        <table className={`${TABLE} tabular min-w-[680px] text-[13px]`}>
          <thead>
            <tr>{["Season", "Crop", "Period", "Rain", "Demand", "Met", "Unmet", "Runoff and drainage", "Heat exposure"].map((h) => <th key={h} className={clsx(cell, "text-left font-medium text-muted")}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {evaluation.seasons.map((s) => {
              const fallow = s.cropId === "fallow";
              return (
                <tr key={s.index} className="text-ink-soft">
                  <td className={cell}>{s.index + 1}</td>
                  <td className={clsx(cell, "font-medium text-ink")}>{CROPS[s.cropId].name}</td>
                  <td className={cell}>{s.windowLabel}</td>
                  <td className={cell}>{s.rainMm} mm</td>
                  <td className={cell}>{fallow ? "Not applicable" : `${s.demandMm} mm`}</td>
                  <td className={cell}>{fallow ? "Not applicable" : `${s.metMm} mm`}</td>
                  <td className={clsx(cell, s.deficitMm > 30 && "font-medium text-amber")}>{fallow ? "Not applicable" : `${s.deficitMm} mm`}</td>
                  <td className={cell}>{s.runoffMm + s.drainageMm} mm</td>
                  <td className={clsx(cell, s.heatShare > 0.3 && "font-medium text-amber")}>{CROPS[s.cropId].heatThresholdC === null ? "Not applicable" : pct(s.heatShare)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {evaluation.notes.length > 0 && <ul className="mt-3 space-y-1 text-[13px] leading-relaxed text-amber">{evaluation.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      <p className="mt-3 text-[13px] text-muted">Model estimates, mm per season.</p>
    </div>
  );
}

export { SeasonTable, WaterCharts };
