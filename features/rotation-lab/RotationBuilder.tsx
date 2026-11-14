"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { Card, Swatch } from "@/components/ui";
import { CROP_LIST, CROPS, cropDuration } from "@/data/crops";
import { MAX_PLANS, MAX_SEASONS } from "@/data/rotations";
import { useApp } from "@/lib/store";
import type { CropId, RotationEvaluation, RotationPlan } from "@/types";
import { planColor } from "./shared";

const ICON_BUTTON = "rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30";

/** Next free colour slot, so a plan keeps its colour when others are removed. */
function freeSlot(plans: RotationPlan[]): number {
  const used = new Set(plans.map((p) => p.colorSlot));
  return [0, 1, 2, 3].find((s) => !used.has(s)) ?? 0;
}

function PlanRow({ plan, evaluation, canDelete, canDuplicate }: { plan: RotationPlan; evaluation?: RotationEvaluation; canDelete: boolean; canDuplicate: boolean }) {
  const { setPlans } = useApp();
  const update = (patch: Partial<RotationPlan>) => setPlans((ps) => ps.map((p) => (p.id === plan.id ? { ...p, ...patch } : p)));
  const setCrops = (crops: CropId[]) => update({ crops });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...plan.crops];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setCrops(next);
  };
  const duplicate = () => setPlans((ps) => [...ps, { ...plan, id: `plan-${Date.now()}`, name: `${plan.name} copy`.slice(0, 28), colorSlot: freeSlot(ps), crops: [...plan.crops] }]);

  return (
    <Card as="article" className={clsx("overflow-hidden", !plan.compare && "opacity-75")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <Swatch color={planColor(plan)} />
        <input value={plan.name} onChange={(e) => update({ name: e.target.value })} aria-label="Rotation name" maxLength={28}
          className="min-w-[9rem] flex-1 rounded-md bg-transparent px-1.5 py-1 text-[15px] font-semibold text-ink hover:bg-sunken focus:bg-sunken" />
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
          <input type="checkbox" checked={plan.compare} onChange={(e) => update({ compare: e.target.checked })} className="h-4 w-4" /> Include in comparison
        </label>
        <span className="flex items-center">
          <button type="button" className={ICON_BUTTON} onClick={duplicate} disabled={!canDuplicate} aria-label={`Duplicate ${plan.name}`} title="Duplicate"><Copy size={16} /></button>
          <button type="button" className={ICON_BUTTON} onClick={() => setPlans((ps) => ps.filter((p) => p.id !== plan.id))} disabled={!canDelete} aria-label={`Delete ${plan.name}`} title="Delete"><Trash2 size={16} /></button>
        </span>
      </div>

      {/* Season timeline: one tile per season, read left to right */}
      <ol className="flex gap-3 overflow-x-auto p-4 sm:p-5">
        {plan.crops.map((cropId, i) => {
          const crop = CROPS[cropId];
          const season = evaluation?.seasons[i];
          const fallow = cropId === "fallow";
          const repeat = i > 0 && !fallow && CROPS[plan.crops[i - 1]].family === crop.family;
          return (
            <li key={i} className="w-[212px] shrink-0 rounded-lg border border-line bg-canvas p-3" style={{ borderTopColor: planColor(plan), borderTopWidth: 3 }}>
              <div className="flex items-start justify-between gap-1">
                <p className="text-xs leading-snug text-muted"><span className="block font-medium text-ink">Season {i + 1}</span>{season?.windowLabel ?? " "}</p>
                <span className="flex">
                  <button type="button" className={ICON_BUTTON} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move season ${i + 1} earlier`}><ChevronLeft size={15} /></button>
                  <button type="button" className={ICON_BUTTON} onClick={() => move(i, 1)} disabled={i === plan.crops.length - 1} aria-label={`Move season ${i + 1} later`}><ChevronRight size={15} /></button>
                  <button type="button" className={ICON_BUTTON} onClick={() => setCrops(plan.crops.filter((_, j) => j !== i))} disabled={plan.crops.length <= 1} aria-label={`Remove season ${i + 1}`}><X size={15} /></button>
                </span>
              </div>
              <select value={cropId} aria-label={`Crop for season ${i + 1}`} title={crop.note} onChange={(e) => setCrops(plan.crops.map((c, j) => (j === i ? (e.target.value as CropId) : c)))}
                className="field-input mt-2 w-full !py-1.5 font-medium">
                {CROP_LIST.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <dl className="mt-2.5 space-y-1 text-xs text-muted">
                <div className="flex justify-between gap-2"><dt>Family</dt><dd className="text-ink-soft">{fallow ? "No crop" : crop.familyCommon}</dd></div>
                <div className="flex justify-between gap-2"><dt>Growing period</dt><dd className="tabular text-ink-soft">{fallow ? "Whole season" : `about ${cropDuration(crop)} days`}</dd></div>
                <div className="flex justify-between gap-2"><dt>Water demand</dt><dd className="tabular text-ink-soft">{season && !fallow ? `${season.demandMm} mm` : "None"}</dd></div>
              </dl>
              {(repeat || season?.overrun) && (
                <ul className="mt-2 space-y-1 text-xs font-medium text-amber">
                  {repeat && <li className="flex gap-1.5"><TriangleAlert size={13} className="mt-px shrink-0" aria-hidden />Same family as the season before</li>}
                  {season?.overrun && <li className="flex gap-1.5"><TriangleAlert size={13} className="mt-px shrink-0" aria-hidden />Needs longer than the season window</li>}
                </ul>
              )}
            </li>
          );
        })}
        {plan.crops.length < MAX_SEASONS && (
          <li className="flex shrink-0">
            <button type="button" onClick={() => setCrops([...plan.crops, "mungbean"])}
              className="flex w-[120px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-[13px] font-medium text-muted hover:border-green hover:text-green-strong">
              <Plus size={18} aria-hidden /> Add season
            </button>
          </li>
        )}
      </ol>
    </Card>
  );
}

export function RotationBuilder({ evaluations }: { evaluations: RotationEvaluation[] }) {
  const { plans, setPlans } = useApp();
  const addPlan = () => setPlans((ps) => {
    const slot = freeSlot(ps);
    return [...ps, { id: `plan-${Date.now()}`, name: `Rotation ${"ABCD"[slot]}`, crops: ["corn", "mungbean"], colorSlot: slot, compare: true }];
  });
  return (
    <div className="space-y-4">
      {plans.map((p) => (
        <PlanRow key={p.id} plan={p} evaluation={evaluations.find((e) => e.planId === p.id)} canDelete={plans.length > 1} canDuplicate={plans.length < MAX_PLANS} />
      ))}
      {plans.length < MAX_PLANS && (
        <button type="button" onClick={addPlan}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-4 text-sm font-medium text-muted transition-colors hover:border-green hover:text-green-strong">
          <Plus size={17} aria-hidden /> New rotation plan
        </button>
      )}
    </div>
  );
}
