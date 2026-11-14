"use client";

import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART } from "@/lib/chartTheme";
import { fmt } from "@/lib/format";

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  type?: "line" | "area" | "bar";
  dashed?: boolean;
  /** Sparse series (satellite overpasses) are drawn as connected points */
  sparse?: boolean;
  stack?: string;
}

interface Props {
  data: object[];
  xKey: string;
  series: SeriesDef[];
  unit?: string;
  height?: number;
  digits?: number;
  xFormat?: (v: string) => string;
  /** Vertical marker, e.g. the date selected on a timeline */
  markerX?: string;
  markerLabel?: string;
  /** Horizontal reference, e.g. a baseline */
  refY?: { value: number; label: string };
  domain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"];
  xInterval?: number | "preserveStartEnd";
  ariaLabel: string;
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: number | string | null; color?: string; name?: string }[];
}

function ChartTooltip({ active, payload, label, unit, digits, xFormat }: TipProps & { unit?: string; digits: number; xFormat?: (v: string) => string }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  return (
    <div className="rounded-md border border-line-strong bg-raised px-3 py-2 text-xs shadow-xl shadow-black/40">
      <div className="mb-1 font-medium text-silver">{xFormat ? xFormat(String(label)) : label}</div>
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5 text-muted">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="tabular ml-auto pl-4 font-medium text-silver">{fmt(Number(p.value), digits)}{unit ? ` ${unit}` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/** One chart, one axis. Measures with different units get their own chart. */
export function SeriesChart({ data, xKey, series, unit, height = 260, digits = 1, xFormat, markerX, markerLabel, refY, domain, xInterval, ariaLabel }: Props) {
  // Bars encode value by length, so their axis must include zero
  const hasBars = series.some((s) => s.type === "bar");
  const yDomain = domain ?? (hasBars ? [(min: number) => Math.min(0, min), "auto"] as const : ["auto", "auto"] as const);
  return (
    <div role="img" aria-label={ariaLabel} className="w-full text-[11px]">
      {unit && <div className="mb-1 pl-1 text-[10px] uppercase tracking-wider text-muted">{unit}</div>}
      <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: markerLabel ? 18 : 8, right: 12, bottom: 0, left: -8 }} barCategoryGap="22%">
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={xFormat} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={36} interval={xInterval} />
          <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={46} domain={yDomain as never} />
          <Tooltip content={<ChartTooltip unit={unit} digits={digits} xFormat={xFormat} />} cursor={{ stroke: CHART.reference, strokeDasharray: "3 3", fill: "rgba(255,255,255,0.03)" }} />
          {series.length > 1 && <Legend itemSorter={null} iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} formatter={(v) => <span style={{ color: "var(--silver)" }}>{v}</span>} />}
          {refY && <ReferenceLine y={refY.value} stroke={CHART.reference} strokeDasharray="4 4" label={{ value: refY.label, fill: CHART.axis, fontSize: 10, position: "insideTopLeft" }} />}
          {series.map((s) => {
            if (s.type === "bar") {
              return <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={s.stack} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />;
            }
            if (s.type === "area") {
              return <Area key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={s.color} fillOpacity={0.12} dot={false} isAnimationActive={false} />;
            }
            return (
              <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={s.sparse ? { r: 3, fill: s.color, stroke: "var(--surface)", strokeWidth: 1.5 } : false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} connectNulls={s.sparse} isAnimationActive={false} />
            );
          })}
          {markerX && <ReferenceLine x={markerX} stroke="#D9D9D9" strokeWidth={1} label={markerLabel ? { value: markerLabel, fill: "#D9D9D9", fontSize: 10, position: "top" } : undefined} />}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
