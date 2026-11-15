"use client";

import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { useId, useRef } from "react";
import { CROP_LIST, CROPS } from "@/data/crops";
import type { CropId } from "@/types";
import { CropImage } from "./Crop";

/**
 * Choose a crop by its picture. The grid opens in the browser's top layer
 * (native popover), so it is never clipped by the scrolling season row.
 */
export function CropPicker({ value, onChange, label }: { value: CropId; onChange: (id: CropId) => void; label: string }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const crop = CROPS[value];

  const place = () => {
    const b = button.current?.getBoundingClientRect();
    const p = pop.current;
    if (!b || !p) return;
    const width = Math.min(360, window.innerWidth - 24);
    p.style.width = `${width}px`;
    p.style.left = `${Math.min(Math.max(12, b.left), window.innerWidth - width - 12)}px`;
    const h = p.offsetHeight;
    p.style.top = `${b.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, b.top - h - 6) : b.bottom + 6}px`;
  };

  return (
    <>
      <button ref={button} type="button" popoverTarget={id} aria-label={`${label}: ${crop.name}. Change crop`}
        className="group flex w-full flex-col items-center rounded-lg pb-1 pt-1 text-center hover:bg-sunken">
        <CropImage id={value} size="lg" tile={false} />
        <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-ink">
          {crop.name}<ChevronDown size={14} className="text-muted group-hover:text-ink" aria-hidden />
        </span>
      </button>
      <div ref={pop} id={id} popover="auto" onToggle={(e) => { if (e.newState === "open") place(); }}
        className="fixed m-0 rounded-xl border border-line-strong bg-surface p-2 shadow-pop">
        <p className="px-1.5 pb-1.5 pt-0.5 text-xs font-medium text-muted">{label}</p>
        <ul className="grid grid-cols-3 gap-1">
          {CROP_LIST.map((c) => {
            const on = c.id === value;
            return (
              <li key={c.id}>
                <button type="button" aria-pressed={on} title={c.note}
                  onClick={() => { onChange(c.id); pop.current?.hidePopover(); button.current?.focus(); }}
                  className={clsx("relative flex w-full flex-col items-center rounded-lg p-1.5 text-center", on ? "bg-green-soft" : "hover:bg-sunken")}>
                  {on && <Check size={14} className="absolute right-1.5 top-1.5 text-green" aria-hidden />}
                  <CropImage id={c.id} size="sm" tile={false} />
                  <span className="mt-0.5 text-xs font-medium leading-tight text-ink">{c.name.replace(" (cover)", "").replace(" (bare)", "")}</span>
                  <span className="text-[11px] leading-tight text-muted">{c.id === "fallow" ? "No crop" : c.familyCommon}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
