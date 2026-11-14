import clsx from "clsx";
import type { Discovery } from "@/types";

export const STATUS_LABEL: Record<Discovery["status"], string> = {
  new: "New",
  investigating: "Investigating",
  resolved: "Resolved",
};

export function StatusBadge({ status }: { status: Discovery["status"] }) {
  return (
    <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
      status === "new" && "bg-amber/15 text-amber",
      status === "investigating" && "bg-terra/15 text-terra-soft",
      status === "resolved" && "bg-white/8 text-muted")}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Confidence shown as a labelled meter with words — never a bare percentage. */
export function Confidence({ value, note }: { value: number; note?: string }) {
  const word = value >= 0.75 ? "Well supported" : value >= 0.5 ? "Moderately supported" : "Tentative";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-silver">{word}</span>
        <span className="tabular text-muted">{Math.round(value * 100)}% confidence</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Confidence">
        <div className="h-full rounded-full bg-terra" style={{ width: `${value * 100}%` }} />
      </div>
      {note && <p className="mt-2 text-xs leading-relaxed text-muted">{note}</p>}
    </div>
  );
}
