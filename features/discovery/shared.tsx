import clsx from "clsx";
import { Badge } from "@/components/ui";
import type { Discovery } from "@/types";

export const STATUS_LABEL: Record<Discovery["status"], string> = {
  new: "New",
  investigating: "Investigating",
  resolved: "Resolved",
};

export function StatusBadge({ status }: { status: Discovery["status"] }) {
  return <Badge tone={status === "new" ? "warning" : status === "investigating" ? "good" : "neutral"}>{STATUS_LABEL[status]}</Badge>;
}

/**
 * How much attention a discovery asks for. Derived, not measured: an open
 * discovery that names a possible risk to the crop needs attention; other open
 * ones are worth a look; resolved ones are kept for the record.
 */
export function severity(d: Discovery): { label: string; tone: "warning" | "info" | "neutral" } {
  if (d.status === "resolved") return { label: "Resolved", tone: "neutral" };
  return d.risk ? { label: "Needs attention", tone: "warning" } : { label: "Worth a look", tone: "info" };
}

/**
 * The detectors produce a heuristic support score, not a probability. It is
 * shown as one of three plain levels so it never reads as a measured certainty.
 */
export function evidenceLevel(value: number): { level: 1 | 2 | 3; label: string } {
  if (value >= 0.75) return { level: 3, label: "Well supported" };
  if (value >= 0.5) return { level: 2, label: "Moderately supported" };
  return { level: 1, label: "Tentative" };
}

export function Evidence({ value, note, compact = false }: { value: number; note?: string; compact?: boolean }) {
  const { level, label } = evidenceLevel(value);
  return (
    <div>
      <div className="flex items-center gap-2.5" role="img" aria-label={`Evidence: ${label}, level ${level} of 3`}>
        <span className="flex gap-0.5" aria-hidden>
          {[1, 2, 3].map((i) => <span key={i} className={clsx("h-1.5 w-4 rounded-full", i <= level ? "bg-green" : "bg-line-strong")} />)}
        </span>
        <span className={clsx("text-ink", compact ? "text-[13px]" : "text-sm font-medium")}>{label}</span>
      </div>
      {note && <p className="mt-2 text-[13px] leading-relaxed text-muted">{note}</p>}
    </div>
  );
}
