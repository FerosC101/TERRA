"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { useState } from "react";
import { longDate, shortDate } from "@/lib/dates";
import type { InvestigationStage, StageKey } from "@/types";

/** Five steps from first observation to an updated field model. Select a step to read what happened. */
export function InvestigationSteps({ stages }: { stages: InvestigationStage[] }) {
  const [picked, setPicked] = useState<StageKey | null>(null);
  const current = stages.find((s) => s.state === "active") ?? stages[stages.length - 1];
  const stage = stages.find((s) => s.key === (picked ?? current.key))!;

  return (
    <div>
      <ol className="grid grid-cols-1 gap-y-1 sm:grid-cols-5">
        {stages.map((s, i) => {
          const selected = s.key === stage.key;
          return (
            <li key={s.key} className="relative">
              {i > 0 && <span className={clsx("absolute right-1/2 top-[13px] hidden h-0.5 w-full sm:block", s.state === "pending" ? "bg-line" : "bg-green")} aria-hidden />}
              <button type="button" onClick={() => setPicked(s.key)} aria-pressed={selected}
                className="relative flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left sm:flex-col sm:items-center sm:gap-2 sm:text-center">
                <span className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  s.state === "done" && "border-green bg-green text-white",
                  s.state === "active" && "border-green bg-surface text-green-strong",
                  s.state === "pending" && "border-line-strong bg-surface text-faint",
                  selected && "ring-4 ring-green-soft")}>
                  {s.state === "done" ? <Check size={14} aria-hidden /> : i + 1}
                </span>
                <span>
                  <span className={clsx("block text-[13px] font-medium leading-snug", s.state === "pending" ? "text-muted" : "text-ink")}>{s.label}</span>
                  <span className="tabular block text-xs text-muted">{s.date ? shortDate(s.date) : s.state === "active" ? "In progress" : "Not yet"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 rounded-lg bg-sunken px-4 py-3" aria-live="polite">
        <p className="text-[13px] font-medium text-ink">{stage.label}{stage.date ? ` · ${longDate(stage.date)}` : ""}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{stage.detail}</p>
      </div>
    </div>
  );
}
