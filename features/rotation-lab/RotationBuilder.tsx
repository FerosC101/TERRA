"use client";

import clsx from "clsx";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { CROP_LIST, CROPS } from "@/data/crops";
import { MAX_PLANS, MAX_SEASONS } from "@/data/rotations";
import { useApp } from "@/lib/store";
import type { CropId, RotationEvaluation, RotationPlan } from "@/types";
import { planColor } from "./shared";

const ICON_BTN = "rounded p-1.5 text-muted hover:bg-white/8 hover:text-silver disabled:pointer-events-none disabled:opacity-25";

function PlanCard({ plan, evaluation, canDelete, canDuplicate }: { plan: RotationPlan; evaluation?: RotationEvaluation; canDelete: boolean; canDuplicate: boolean }) {
  const { setPlans } = useApp();
  const update = (patch: Partial<RotationPlan>) => setPlans((ps) => ps.map((p) => (p.id === plan.id ? { ...p, ...patch } : p)));
  const setCrops = (crops: CropId[]) => update({ crops });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...plan.crops];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setCrops(next);
  };
  const duplicate = () => setPlans((ps) => {
    const used = new Set(ps.map((p) => p.colorSlot));
    const slot = [0, 1, 2, 3].find((s) => !used.has(s)) ?? 0;
    return [...ps, { ...plan, id: `plan-${Date.now()}`, name: `${plan.name} copy`, colorSlot: slot, crops: [...plan.crops] }];
  });

  return (
    <Panel as="article" className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: planColor(plan) }} aria-hidden />
        <input value={plan.name} onChange={(e) => update({ name: e.target.value })} aria-label="Rotation name" maxLength={28}
          className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[15px] font-semibold text-silver hover:bg-white/5 focus:bg-white/5" />
        <button type="button" className={ICON_BTN} onClick={duplicate} disabled={!canDuplicate} aria-label={`Duplicate ${plan.name}`} title="Duplicate"><Copy size={15} /></button>
        <button type="button" className={ICON_BTN} onClick={() => setPlans((ps) => ps.filter((p) => p.id !== plan.id))} disabled={!canDelete} aria-label={`Delete ${plan.name}`} title="Delete"><Trash2 size={15} /></button>
      </div>

      <ol className="flex-1 space-y-1.5 p-3">
        {plan.crops.map((cropId, i) => {
          const crop = CROPS[cropId];
          const season = evaluation?.seasons[i];
          const repeat = i > 0 && cropId !== "fallow" && CROPS[plan.crops[i - 1]].family === crop.family;
          return (
            <li key={i} className="rounded-md border border-line bg-forest-deep/40 p-2">
              <div className="flex items-center gap-1.5">
                <span className="tabular w-[68px] shrink-0 text-[11px] leading-tight text-muted">
                  <span className="block font-semibold text-silver">Season {i + 1}</span>{season?.windowLabel ?? ""}
                </span>
                <select value={cropId} aria-label={`Crop for season ${i + 1}`} onChange={(e) => setCrops(plan.crops.map((c, j) => (j === i ? (e.target.value as CropId) : c)))}
                  className="min-w-0 flex-1 rounded-md border border-line-strong bg-raised px-2 py-1.5 text-[13px] text-silver">
                  {CROP_LIST.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" className={ICON_BTN} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move season ${i + 1} earlier`}><ChevronUp size={15} /></button>
                <button type="button" className={ICON_BTN} onClick={() => move(i, 1)} disabled={i === plan.crops.length - 1} aria-label={`Move season ${i + 1} later`}><ChevronDown size={15} /></button>
                <button type="button" className={ICON_BTN} onClick={() => setCrops(plan.crops.filter((_, j) => j !== i))} disabled={plan.crops.length <= 1} aria-label={`Remove season ${i + 1}`}><X size={15} /></button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-[74px] text-[11px] text-muted">
                <span>{crop.familyCommon} family</span>
                {season && cropId !== "fallow" && <span className="tabular">{season.demandMm} mm demand</span>}
                {repeat && <span className="inline-flex items-center gap-1 text-amber"><TriangleAlert size={11} aria-hidden /> same family as previous</span>}
                {season?.overrun && <span className="inline-flex items-center gap-1 text-amber"><TriangleAlert size={11} aria-hidden /> longer than the season window</span>}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3.5 py-2.5">
        <Button variant="ghost" onClick={() => setCrops([...plan.crops, "mungbean"])} disabled={plan.crops.length >= MAX_SEASONS}><Plus size={14} aria-hidden /> Add season</Button>
        <label className={clsx("flex cursor-pointer items-center gap-2 text-xs", plan.compare ? "text-silver" : "text-muted")}>
          <input type="checkbox" checked={plan.compare} onChange={(e) => update({ compare: e.target.checked })} className="h-4 w-4 accent-[#39D353]" /> Compare
        </label>
      </div>
    </Panel>
  );
}

export function RotationBuilder({ evaluations }: { evaluations: RotationEvaluation[] }) {
  const { plans, setPlans } = useApp();
  const addPlan = () => setPlans((ps) => {
    const used = new Set(ps.map((p) => p.colorSlot));
    const slot = [0, 1, 2, 3].find((s) => !used.has(s)) ?? 0;
    return [...ps, { id: `plan-${Date.now()}`, name: `Rotation ${"ABCD"[slot]}`, crops: ["corn", "mungbean"], colorSlot: slot, compare: true }];
  });
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
      {plans.map((p) => (
        <PlanCard key={p.id} plan={p} evaluation={evaluations.find((e) => e.planId === p.id)} canDelete={plans.length > 1} canDuplicate={plans.length < MAX_PLANS} />
      ))}
      {plans.length < MAX_PLANS && (
        <button type="button" onClick={addPlan}
          className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm text-muted transition-colors hover:border-terra/60 hover:text-terra-soft">
          <Plus size={20} aria-hidden /> New rotation
        </button>
      )}
    </div>
  );
}
