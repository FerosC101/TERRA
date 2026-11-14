"use client";

import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { SeriesChart } from "@/components/charts/SeriesChart";
import { Eyebrow, Panel, ProvenanceTag, Segmented } from "@/components/ui";
import { CROPS } from "@/data/crops";
import { SERIES } from "@/lib/chartTheme";
import { fmt, pct } from "@/lib/format";
import type { Provenance, RotationEvaluation, RotationPlan } from "@/types";
import { CRITERIA, planColor, tradeoffs } from "./shared";

interface Props {
  plans: RotationPlan[];
  evaluations: RotationEvaluation[];
  /** "model" under historical conditions, "simulated" under a climate scenario */
  provenance?: Provenance;
}

export function CriteriaTable({ plans, evaluations }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="px-5 py-3 text-xs font-medium text-muted">Criterion</th>
            {plans.map((p) => (
              <th key={p.id} className="px-4 py-3 font-semibold text-silver">
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: planColor(p) }} aria-hidden />{p.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CRITERIA.map((c) => {
            const values = evaluations.map((e) => c.value(e.indicators, e));
            const max = c.max ?? Math.max(...values, 1);
            return (
              <tr key={c.key} className={clsx("border-b border-line last:border-0", c.key === "priority" && "bg-white/[0.02]")}>
                <th scope="row" className="max-w-[260px] px-5 py-3 text-left align-top font-normal">
                  <div className="font-medium text-silver">{c.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted">{c.help}</div>
                </th>
                {plans.map((p, i) => (
                  <td key={p.id} className="px-4 py-3 align-top">
                    <div className="tabular font-medium text-silver">{c.format(values[i])}</div>
                    <div className="mt-1.5 h-1.5 w-full max-w-[140px] rounded-full bg-white/8">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, (values[i] / max) * 100)}%`, background: planColor(p), opacity: values[i] === 0 ? 0.25 : 1 }} />
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Comparison({ plans, evaluations, provenance = "model" }: Props) {
  const [pickedId, setPickedId] = useState(plans[0]?.id);
  const picked = plans.find((p) => p.id === pickedId) ?? plans[0];
  const pickedEval = evaluations.find((e) => e.planId === picked?.id);

  const waterRows = useMemo(() => plans.map((p, i) => ({
    name: p.name,
    demand: evaluations[i].indicators.demandMm,
    met: evaluations[i].indicators.metMm,
    rain: evaluations[i].indicators.rainMm,
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

  if (!picked || !pickedEval) return null;

  return (
    <div className="space-y-5">
      {/* Trade-offs first: the point of the lab */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <Eyebrow className="!text-terra">Overall trade-offs</Eyebrow>
          <ProvenanceTag kind={provenance} />
        </div>
        <div className="grid gap-px bg-line" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          {plans.map((p, i) => {
            const t = tradeoffs(evaluations[i], evaluations);
            return (
              <div key={p.id} className="bg-surface p-5">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-silver"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: planColor(p) }} aria-hidden />{p.name}</div>
                <div className="mt-1 text-xs text-muted">{p.crops.map((c) => CROPS[c].name).join(" → ")}</div>
                <ul className="mt-3 space-y-1.5 text-[13px] leading-snug">
                  {t.gains.map((g) => <li key={g} className="flex gap-2 text-silver/90"><Plus size={13} className="mt-0.5 shrink-0 text-terra" aria-label="Gain:" />{g}</li>)}
                  {t.costs.map((g) => <li key={g} className="flex gap-2 text-silver/90"><Minus size={13} className="mt-0.5 shrink-0 text-amber" aria-label="Cost:" />{g}</li>)}
                  {t.gains.length + t.costs.length === 0 && <li className="text-muted">{plans.length < 2 ? "Select at least two rotations to see trade-offs." : "Sits between the others on every criterion."}</li>}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">
          No rotation is best on everything. Gains and costs are relative to the other rotations compared here, for this field&apos;s climate and soil.
        </p>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <div className="border-b border-line px-5 py-3.5"><Eyebrow>Water demand and availability</Eyebrow><div className="mt-1 text-[15px] font-medium text-silver">What the crops need against what rain and soil can supply</div></div>
          <div className="px-3 pb-2 pt-4 sm:px-5">
            <SeriesChart data={waterRows} xKey="name" unit="mm" digits={0} height={270} ariaLabel="Water demand and supply by rotation" series={[
              { key: "demand", label: "Crop water demand (ETc)", color: SERIES.blue, type: "bar" },
              { key: "met", label: "Met by rain and stored soil water", color: SERIES.green, type: "bar" },
            ]} />
          </div>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">The gap between the two bars is demand the field could not meet without irrigation. Rain over the whole period: {waterRows.map((r) => `${r.name} ${fmt(r.rain)} mm`).join(" · ")}.</p>
        </Panel>

        <Panel>
          <div className="border-b border-line px-5 py-3.5"><Eyebrow>Estimated water availability</Eyebrow><div className="mt-1 text-[15px] font-medium text-silver">Plant-available water stored in the root zone</div></div>
          <div className="px-3 pb-2 pt-4 sm:px-5">
            <SeriesChart data={storageRows} xKey="label" unit="mm" digits={0} height={270} ariaLabel="Root-zone water storage through each rotation" xInterval="preserveStartEnd"
              series={plans.map((p) => ({ key: p.id, label: p.name, color: planColor(p) }))} />
          </div>
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">Ten-day steps. S1, S2… are seasons. Low points are when a crop is most likely to run short of water.</p>
        </Panel>
      </div>

      <Panel>
        <div className="border-b border-line px-5 py-3.5"><Eyebrow>Criteria side by side</Eyebrow></div>
        <CriteriaTable plans={plans} evaluations={evaluations} />
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <Eyebrow>Season by season</Eyebrow>
          <Segmented label="Rotation" value={picked.id} onChange={setPickedId} options={plans.map((p) => ({ value: p.id, label: p.name }))} />
        </div>
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                {["Season", "Crop", "Window", "Rain", "Demand", "Met", "Unmet", "Runoff + drainage", "Heat exposure"].map((h) => <th key={h} className="px-4 py-2.5 font-medium first:pl-5">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {pickedEval.seasons.map((s) => (
                <tr key={s.index} className="border-b border-line last:border-0 text-silver/90">
                  <td className="py-2.5 pl-5 pr-4">{s.index + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-silver">{CROPS[s.cropId].name}</td>
                  <td className="px-4 py-2.5">{s.windowLabel}</td>
                  <td className="px-4 py-2.5">{s.rainMm} mm</td>
                  <td className="px-4 py-2.5">{s.cropId === "fallow" ? "—" : `${s.demandMm} mm`}</td>
                  <td className="px-4 py-2.5">{s.cropId === "fallow" ? "—" : `${s.metMm} mm`}</td>
                  <td className={clsx("px-4 py-2.5", s.deficitMm > 30 && "text-amber")}>{s.cropId === "fallow" ? "—" : `${s.deficitMm} mm`}</td>
                  <td className="px-4 py-2.5">{s.runoffMm + s.drainageMm} mm</td>
                  <td className={clsx("px-4 py-2.5", s.heatShare > 0.3 && "text-amber")}>{CROPS[s.cropId].heatThresholdC === null ? "—" : pct(s.heatShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pickedEval.notes.length > 0 && (
          <ul className="border-t border-line px-5 py-3 text-xs leading-relaxed text-amber">{pickedEval.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        )}
      </Panel>
    </div>
  );
}
