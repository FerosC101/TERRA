"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Card, SourceTag } from "@/components/ui";
import { CROPS } from "@/data/crops";
import type { CropId, DimensionKey, Field } from "@/types";
import type { ModelState } from "./state";
import {
  buildFieldSceneState,
  CONTROL_RANGES,
  PRESETS,
  type SimulationOverrides,
  type SimulationPresetId,
} from "./simulation";

const Scene = dynamic(() => import("@/components/three/FieldScene"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] p-6" role="status">
      Loading field environment…
    </div>
  ),
});

const DIMS: DimensionKey[] = [
  "water",
  "soil",
  "vegetation",
  "climate",
  "rotation",
];

export default function FieldSimulationPanel({
  field,
  state,
  dim,
  onDim,
  idx,
  minIndex,
  maxIndex,
  onDate,
}: {
  field: Field;
  state: ModelState;
  dim: DimensionKey;
  onDim: (d: DimensionKey) => void;
  idx: number;
  minIndex: number;
  maxIndex: number;
  onDate: (n: number) => void;
}) {
  const [preset, setPreset] = useState<SimulationPresetId>("record");
  const [overrides, setOverrides] = useState<SimulationOverrides>({});
  const [follow, setFollow] = useState(true);
  const [reset, setReset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [expanded, setExpanded] = useState(false);

  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const position = useRef(idx);
  const lastStep = useRef<number | null>(null);

  const view = useMemo(
    () => buildFieldSceneState(field, state, preset, overrides),
    [field, state, preset, overrides],
  );

  useEffect(() => {
    position.current = idx;
    if (lastStep.current !== idx) setPlaying(false);
  }, [idx]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = position.current + 1;
      if (next > maxIndex) {
        setPlaying(false);
        return;
      }
      position.current = next;
      lastStep.current = next;
      onDate(next);
      if (next === maxIndex) setPlaying(false);
    }, 1000 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, maxIndex, onDate]);

  useEffect(() => {
    const node = dialog.current;
    if (expanded) {
      node?.showModal();
    }
    return () => {
      node?.close();
    };
  }, [expanded]);

  const close = () => {
    setExpanded(false);
    requestAnimationFrame(() => expandButton.current?.focus());
  };

  const content = (
    <Card className="overflow-hidden p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Field environment simulation</h2>
          <SourceTag kind={view.provenance} />
          <span className="ml-2 text-xs text-muted">
            Illustrative view · {view.date}
          </span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setFollow(true);
              setReset((n) => n + 1);
            }}
          >
            Reset view
          </button>
          {expanded ? (
            <button type="button" onClick={close}>
              Close
            </button>
          ) : (
            <button
              ref={expandButton}
              type="button"
              onClick={() => {
                setPlaying(false);
                setExpanded(true);
              }}
            >
              Expand
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />{" "}
          Auto-focus on selected tab
        </label>
        {DIMS.map((d) => (
          <button
            type="button"
            key={d}
            aria-pressed={dim === d}
            onClick={() => {
              onDim(d);
              setFollow(true);
              setReset((n) => n + 1);
            }}
            className="rounded border border-line px-2 py-1 capitalize"
          >
            {d}
          </button>
        ))}
      </div>

      <Scene state={view} activeDim={dim} follow={follow} reset={reset} />

      <dl className="grid grid-cols-2 gap-2 rounded-lg bg-sunken p-3 text-sm sm:grid-cols-5">
        <div>
          <dt>Root-zone storage</dt>
          <dd>{view.metrics.storageMm?.toFixed(0)} mm</dd>
        </div>
        <div>
          <dt>Soil / bulk EC</dt>
          <dd>
            {view.metrics.soilTempC} °C / {view.metrics.ecDsM} dS/m
          </dd>
        </div>
        <div>
          <dt>NDVI / stage</dt>
          <dd>
            {view.metrics.ndvi ?? "Unavailable"} / {view.crop.stage}
          </dd>
        </div>
        <div>
          <dt>Rain / ET₀</dt>
          <dd>
            {view.metrics.rainMm} / {view.metrics.et0Mm} mm/day
          </dd>
        </div>
        <div>
          <dt>Crop</dt>
          <dd>{view.crop.name}</dd>
        </div>
      </dl>

      <p className="mt-2 text-xs text-muted">
        Cutaway: 10 cm and 40 cm probes. Blue fill illustrates available
        root-zone water storage. Rear strips show rotation history; green marks
        legumes, amber marks repeated families. Crop size and weather are
        illustrative.
      </p>

      {view.soil.salinityAlert !== "none" && (
        <p className="mt-2 text-sm">
          Elevated bulk EC: indicative EC/moisture stress signal; laboratory
          salinity is unconfirmed.
        </p>
      )}
      {view.crop.heatStress && (
        <p className="text-sm">Indicative crop heat threshold exceeded.</p>
      )}
      {!view.isSimulated && (
        <p className="mt-2 text-xs text-muted">
          Field-record visualization: retain the source and demo notices on the
          existing page. NDVI observation: {view.ndviDate ?? "unavailable"}.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (idx === maxIndex) {
              lastStep.current = minIndex;
              position.current = minIndex;
              onDate(minIndex);
            }
            setPlaying((v) => !v);
          }}
        >
          {playing ? "Pause" : "Play season"}
        </button>
        <label>
          Speed{" "}
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            <option value={1}>1×</option>
            <option value={3}>3×</option>
          </select>
        </label>
        <label className="flex flex-1 items-center gap-2">
          Date{" "}
          <input
            aria-label="Simulation date"
            type="range"
            min={minIndex}
            max={maxIndex}
            value={idx}
            onChange={(e) => {
              setPlaying(false);
              onDate(Number(e.target.value));
            }}
            className="w-full"
          />
        </label>
      </div>

      <div
        className="mt-4 flex flex-wrap gap-2"
        aria-label="Simulation scenarios"
      >
        {(Object.keys(PRESETS) as SimulationPresetId[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={preset === id}
            className="rounded-lg border border-line px-3 py-2 text-sm"
            onClick={() => {
              setPreset(id);
              setOverrides({});
            }}
          >
            {PRESETS[id].label}
          </button>
        ))}
      </div>

      <details className="mt-4">
        <summary>What-if metric controls</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(CONTROL_RANGES).map(([key, r]) => {
            const k = key as keyof typeof CONTROL_RANGES;
            return (
              <label key={key} className="text-sm">
                {key}: {view.metrics[k as keyof typeof view.metrics] ?? view.crop.dap}{" "}
                {r[3]}
                <input
                  className="block w-full"
                  type="range"
                  min={r[0]}
                  max={k === "storageMm" ? view.metrics.capacityMm : r[1]}
                  step={r[2]}
                  value={
                    k === "dap"
                      ? view.crop.dap
                      : Number(view.metrics[k as keyof typeof view.metrics] ?? r[0])
                  }
                  onChange={(e) =>
                    setOverrides((o) => ({
                      ...o,
                      [key]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            );
          })}
          <label>
            Crop
            <select
              className="ml-2"
              value={view.crop.id}
              onChange={(e) =>
                setOverrides((o) => ({
                  ...o,
                  cropId: e.target.value as CropId,
                }))
              }
            >
              {Object.values(CROPS).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      {view.isSimulated && (
        <button
          type="button"
          className="mt-4 text-sm font-medium text-green"
          onClick={() => {
            setPreset("record");
            setOverrides({});
          }}
        >
          Reset to field record
        </button>
      )}
    </Card>
  );

  return expanded
    ? createPortal(
        <dialog
          ref={dialog}
          aria-label="Expanded field environment simulation"
          className="fixed inset-0 m-auto max-h-[95vh] w-[96vw] max-w-none overflow-auto rounded-xl bg-surface p-0 text-ink backdrop:bg-black/50"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          {content}
        </dialog>,
        document.body,
      )
    : content;
}
