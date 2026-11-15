"use client";

import clsx from "clsx";
import { CloudSun, Droplets, Layers3, Leaf, Maximize2, Minimize2, Pause, Play, Repeat } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Card, Disclosure, Segmented, SourceTag } from "@/components/ui";
import { InfoTip } from "@/components/visual/InfoTip";
import { CROP_LIST } from "@/data/crops";
import { longDate, shortDate } from "@/lib/dates";
import type { CropId, DimensionKey, Field } from "@/types";
import { DIMENSION_LABEL } from "./parts";
import type { SeasonPlayback } from "./playback";
import { calloutsFor } from "./sceneCallouts";
import { buildFieldSceneState, CONTROL_RANGES, PRESETS, type SimulationOverrides, type SimulationPresetId } from "./simulation";
import type { ModelState } from "./state";

const Scene = dynamic(() => import("@/components/three/FieldScene"), {
  ssr: false,
  loading: () => <div className="flex h-[clamp(400px,64vh,620px)] items-center justify-center bg-sunken text-sm text-muted" role="status">Loading field environment…</div>,
});

const DIMS: { key: DimensionKey; icon: typeof Droplets; short: string }[] = [
  { key: "water", icon: Droplets, short: "Water" },
  { key: "soil", icon: Layers3, short: "Soil" },
  { key: "vegetation", icon: Leaf, short: "Vegetation" },
  { key: "climate", icon: CloudSun, short: "Climate" },
  { key: "rotation", icon: Repeat, short: "Rotation" },
];

const CONTROL_LABEL: Record<keyof typeof CONTROL_RANGES, string> = {
  storageMm: "Root-zone water", surfaceVwc: "Moisture at 10 cm", deepVwc: "Moisture at 40 cm",
  soilTempC: "Soil temperature", ecDsM: "Bulk EC", ndvi: "NDVI", rainMm: "Rain",
  tmaxC: "Max air temperature", et0Mm: "Reference ET₀", dap: "Days after planting",
};

const OVERLAY = "pointer-events-auto rounded-xl border border-line bg-surface/92 shadow-pop backdrop-blur";

export default function FieldSimulationPanel({ field, state, dim, onDim, idx, minIndex, maxIndex, onDate, dates, playback }: {
  field: Field;
  state: ModelState;
  dim: DimensionKey;
  onDim: (d: DimensionKey) => void;
  idx: number;
  minIndex: number;
  maxIndex: number;
  onDate: (n: number) => void;
  /** Observation dates, for the timeline labels */
  dates: string[];
  /** Season playback, shared with the page's date bar */
  playback: SeasonPlayback;
}) {
  const [preset, setPreset] = useState<SimulationPresetId>("record");
  const [overrides, setOverrides] = useState<SimulationOverrides>({});
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);

  const view = useMemo(() => buildFieldSceneState(field, state, preset, overrides), [field, state, preset, overrides]);
  const callouts = useMemo(() => calloutsFor(dim, view), [dim, view]);

  useEffect(() => {
    const node = dialog.current;
    if (expanded) node?.showModal();
    return () => node?.close();
  }, [expanded]);

  const close = () => {
    setExpanded(false);
    requestAnimationFrame(() => expandButton.current?.focus());
  };

  const content = (
    <Card className={clsx("overflow-hidden", expanded && "rounded-none border-0 shadow-none")}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-ink">
            Field environment
            <InfoTip label="field environment">
              An illustrative 3D view of this field driven by its record. Pick a part to see it: water turns the soil blue
              and fills the cut faces to the root-zone storage; soil zooms into the cut face and its 10 cm and 40 cm probes;
              vegetation grows and colours the crop by its stage and NDVI; climate shows rain or sun from the day&apos;s rain
              gauge; rotation lays out past seasons. Plant size, weather and soil colours are not to scale.
            </InfoTip>
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {view.isSimulated ? <SourceTag kind="simulated" detail={PRESETS[preset].label} /> : <span>Field record · demo data</span>}
            <span aria-hidden>·</span>
            <span className="tabular">{longDate(view.date)}</span>
            <span aria-hidden>·</span>
            <span className="font-medium text-green-strong">{DIMENSION_LABEL[dim]}</span>
          </p>
        </div>
        <button ref={expanded ? undefined : expandButton} type="button" onClick={expanded ? close : () => { playback.stop(); setExpanded(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-sunken hover:text-ink">
          {expanded ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
          {expanded ? "Close" : "Expand"}
        </button>
      </div>

      <div className="relative border-y border-line">
        <Scene state={view} dim={dim} callouts={callouts} tall={expanded} controls={expanded} />

        {/* The page's dimension cards and date bar drive the scene; expanded, it carries its own */}
        {expanded && <>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
          <div role="group" aria-label="Show part of the field" className={clsx(OVERLAY, "flex max-w-full gap-0.5 overflow-x-auto p-1")}>
            {DIMS.map(({ key, icon: Icon, short }) => {
              const on = key === dim;
              return (
                <button key={key} type="button" aria-pressed={on} onClick={() => onDim(key)} title={DIMENSION_LABEL[key]}
                  className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                    on ? "bg-green text-white" : "text-ink-soft hover:bg-sunken hover:text-ink")}>
                  <Icon size={15} aria-hidden />
                  <span className={clsx(!on && "max-sm:sr-only")}>{short}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Timeline */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
          <div className={clsx(OVERLAY, "mx-auto flex max-w-2xl items-center gap-3 px-3 py-2")}>
            <button type="button" onClick={playback.toggle} aria-label={playback.playing ? "Pause season" : "Play season"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:bg-green-strong">
              {playback.playing ? <Pause size={14} aria-hidden /> : <Play size={14} className="ml-0.5" aria-hidden />}
            </button>
            <span className="tabular w-[52px] shrink-0 text-[13px] font-semibold text-ink">{shortDate(view.date)}</span>
            <input aria-label="Simulation date" type="range" min={minIndex} max={maxIndex} value={idx}
              aria-valuetext={longDate(view.date)} className="min-w-0 flex-1"
              onChange={(e) => { playback.stop(); onDate(Number(e.target.value)); }} />
            <span className="tabular hidden shrink-0 text-xs text-muted sm:inline">{shortDate(dates[maxIndex])}</span>
            <button type="button" onClick={playback.cycleSpeed} aria-label={`Playback speed ${playback.speed}×`}
              className="tabular shrink-0 rounded-md px-1.5 py-1 text-xs font-semibold text-ink-soft hover:bg-sunken">{playback.speed}×</button>
          </div>
        </div>
        </>}
      </div>

      {/* For screen readers: what the scene shows */}
      <ul className="sr-only" aria-live="polite">
        {callouts.map((c) => <li key={c.id}>{c.label}: {c.value}{c.sub ? `, ${c.sub}` : ""}</li>)}
      </ul>

      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[13px] font-medium text-ink">Scenario</span>
          <Segmented label="Scenario" value={preset} onChange={(id) => { setPreset(id); setOverrides({}); }}
            options={(Object.keys(PRESETS) as SimulationPresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }))} />
          {view.isSimulated && (
            <button type="button" onClick={() => { setPreset("record"); setOverrides({}); }} className="text-[13px] font-medium text-green hover:text-green-strong">
              Back to field record
            </button>
          )}
        </div>
        {view.isSimulated && <p className="text-xs text-muted">What-if values: not observations and not a forecast.</p>}
        <Disclosure title="Adjust values">
          <div className="grid gap-x-8 gap-y-4 pb-4 sm:grid-cols-2">
            {(Object.keys(CONTROL_RANGES) as (keyof typeof CONTROL_RANGES)[]).map((k) => {
              const [min, max, step, unit] = CONTROL_RANGES[k];
              const value = k === "dap" ? view.crop.dap : Number(view.metrics[k] ?? min);
              const top = k === "storageMm" ? view.metrics.capacityMm : max;
              return (
                <label key={k} className="block text-[13px]">
                  <span className="flex justify-between gap-2">
                    <span className="font-medium text-ink">{CONTROL_LABEL[k]}</span>
                    <span className="tabular text-ink-soft">{Number(value.toFixed(step < 1 ? 2 : 0))} {unit}</span>
                  </span>
                  <input type="range" className="mt-1 w-full" min={min} max={top} step={step} value={value}
                    onChange={(e) => setOverrides((o) => ({ ...o, [k]: Number(e.target.value) }))} />
                </label>
              );
            })}
            <label className="block text-[13px]">
              <span className="font-medium text-ink">Crop</span>
              <select className="mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px]" value={view.crop.id}
                onChange={(e) => setOverrides((o) => ({ ...o, cropId: e.target.value as CropId }))}>
                {CROP_LIST.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
        </Disclosure>
      </div>
    </Card>
  );

  return expanded
    ? createPortal(
      <dialog ref={dialog} aria-label="Field environment, expanded"
        className="fixed inset-0 m-auto max-h-[96vh] w-[96vw] max-w-none overflow-auto rounded-xl bg-surface p-0 text-ink backdrop:bg-black/50"
        onCancel={(e) => { e.preventDefault(); close(); }}>
        {content}
      </dialog>,
      document.body,
    )
    : content;
}
