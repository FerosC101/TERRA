import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { CROPS } from "@/data/crops";
import type { CropId } from "@/types";

/**
 * 3D-style crop renders (generated in Figma; originals kept out of the repo).
 * Saved in public/crops as 400 px PNGs with the backdrop cut out, so they sit
 * cleanly on any surface.
 */
export function cropImage(id: CropId): string {
  return `/crops/${id}.png`;
}

const SIZES = { xs: "h-9 w-9", sm: "h-14 w-14", md: "h-20 w-20", lg: "h-28 w-28", xl: "h-40 w-40" } as const;

export function CropImage({ id, size = "md", className, tile = true }: { id: CropId; size?: keyof typeof SIZES; className?: string; tile?: boolean }) {
  return (
    <span className={clsx("inline-flex shrink-0 items-center justify-center overflow-hidden", tile && "rounded-xl bg-sunken", SIZES[size], className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static renders, no optimisation needed */}
      <img src={cropImage(id)} alt={CROPS[id].name} width={400} height={400} loading="lazy" decoding="async" className="h-full w-full object-contain" />
    </span>
  );
}

/** A rotation at a glance: one image per season, in order. */
export function CropSequence({ crops, size = "sm", showNames = false }: { crops: CropId[]; size?: keyof typeof SIZES; showNames?: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={crops.map((c) => CROPS[c].name).join(", then ")}>
      {crops.map((c, i) => (
        <li key={i} className="flex items-center gap-1.5">
          {i > 0 && <ArrowRight size={13} className="shrink-0 text-faint" aria-hidden />}
          <span className="flex flex-col items-center gap-1">
            <CropImage id={c} size={size} />
            {showNames && <span className="max-w-20 truncate text-xs text-ink-soft">{CROPS[c].name}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
