import clsx from "clsx";
import type { Crop } from "@/types";

const STAGES = ["Initial", "Development", "Mid-season", "Late"] as const;
const SHORT = ["Start", "Grow", "Mid", "Late"] as const;

/** The crop calendar as a bar: four stages sized by their length, a marker for today. */
export function GrowthBar({ crop, day }: { crop: Crop; day: number }) {
  const total = crop.stages.reduce((a, b) => a + b, 0);
  const clamped = Math.min(Math.max(day, 0), total);
  const ends = crop.stages.map((_, i) => crop.stages.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const current = ends.findIndex((end) => day < end);
  return (
    <div className="w-full">
      <div className="relative flex h-2 gap-0.5" role="img" aria-label={`Day ${day} of about ${total}${current >= 0 ? `, ${STAGES[current].toLowerCase()} stage` : ""}`}>
        {crop.stages.map((len, i) => (
          <span key={i} className={clsx("h-full rounded-full", i < current || current === -1 ? "bg-green" : i === current ? "bg-green/60" : "bg-line-strong")} style={{ width: `${(len / total) * 100}%` }} />
        ))}
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-green-strong shadow-card" style={{ left: `${(clamped / total) * 100}%` }} aria-hidden />
      </div>
      <div className="mt-1.5 flex text-[11px] text-muted" aria-hidden>
        {crop.stages.map((len, i) => <span key={i} className={clsx("truncate", i === current && "font-medium text-ink")} style={{ width: `${(len / total) * 100}%` }}>{SHORT[i]}</span>)}
      </div>
    </div>
  );
}
