"use client";

import clsx from "clsx";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, CircleAlert, Info } from "lucide-react";
import { InfoTip } from "@/components/visual/InfoTip";
import { Sparkline } from "@/components/visual/Sparkline";
import type { Provenance } from "@/types";

/* ───────────────────────── Layout ───────────────────────── */

/** A white surface. Use it for a unit of content that stands alone, not for every block. */
export function Card({ className, children, as: Tag = "section" }: { className?: string; children: React.ReactNode; as?: "section" | "div" | "article" }) {
  return <Tag className={clsx("print-avoid rounded-xl border border-line bg-surface shadow-card", className)}>{children}</Tag>;
}

export function PageHeader({ title, lead, actions, children }: { title: string; lead?: string; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {lead && <p className="mt-2 text-[15px] leading-relaxed text-muted">{lead}</p>}
        {children}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled region of a page. Separation comes from space and the heading, not a box. */
export function Section({ title, description, info, actions, children, className }: { title: string; description?: React.ReactNode; info?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("print-avoid", className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="flex items-center gap-1.5 text-[17px] font-semibold tracking-tight text-ink">{title}{info && <InfoTip label={title}>{info}</InfoTip>}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Heading row inside a Card. */
export function CardHeader({ title, description, info, actions }: { title: string; description?: React.ReactNode; info?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5 sm:px-6">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">{title}{info && <InfoTip label={title}>{info}</InfoTip>}</h3>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ───────────────────────── Data provenance ───────────────────────── */

const PROVENANCE: Record<Provenance, { label: string; short: string; dot: string; help: string }> = {
  measurement: { label: "Field measurement", short: "Sensor", dot: "bg-green", help: "Field measurement: read by a sensor in the field." },
  satellite: { label: "Satellite estimate", short: "Satellite", dot: "bg-blue", help: "Satellite estimate: from orbit, over an area larger than the field." },
  model: { label: "Model output", short: "Model", dot: "bg-violet", help: "Model output: calculated from other data using stated assumptions." },
  simulated: { label: "Simulation", short: "Simulation", dot: "bg-amber", help: "Simulation: a what-if result, not an observation or a forecast." },
};

export function provenanceLabel(kind: Provenance): string {
  return PROVENANCE[kind].label;
}

/**
 * States how a value came to exist: a quiet dot and label. `retrieved` marks a
 * real record; otherwise the tooltip reminds the reader the value is demo data.
 */
export function SourceTag({ kind, detail, retrieved = false, short = false, className }: { kind: Provenance; detail?: string; retrieved?: boolean; short?: boolean; className?: string }) {
  const p = PROVENANCE[kind];
  return (
    <span title={`${p.help}${retrieved ? " Retrieved record." : " Demo data in this build."}`} className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted", className)}>
      <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", p.dot)} aria-hidden />
      {short ? p.short : p.label}{detail ? ` · ${detail}` : ""}
    </span>
  );
}

/* ───────────────────────── Metrics ───────────────────────── */

export interface MetricProps {
  label: string;
  value: string;
  unit?: string;
  /** Signed change over the stated period, already formatted */
  trend?: { direction: "up" | "down" | "flat"; text: string; tone?: "neutral" | "warning" };
  source: Provenance;
  /** Observation date or measurement period */
  when: string;
  /** Recent values for a sparkline; nulls are gaps */
  spark?: (number | null)[];
}

const SOURCE_COLOR: Record<Provenance, string> = { measurement: "#2F7D46", satellite: "#2F6FB2", model: "#7A5AC2", simulated: "#B7791F" };

/** One measurement: value and unit first, then a sparkline, the change, the source and the date. */
export function Metric({ label, value, unit, trend, source, when, spark }: MetricProps) {
  const TrendIcon = trend?.direction === "up" ? ArrowUpRight : trend?.direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="tabular text-[26px] font-semibold leading-none tracking-tight text-ink">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {spark && <div className="mt-2.5"><Sparkline values={spark} color={SOURCE_COLOR[source]} label={`${label}, recent trend`} /></div>}
      {trend && (
        <div className={clsx("mt-1.5 flex items-center gap-1 text-[13px] font-medium", trend.tone === "warning" ? "text-amber" : "text-ink-soft")}>
          <TrendIcon size={14} className="shrink-0" aria-hidden />
          <span>{trend.text}</span>
        </div>
      )}
      <div className="mt-2 truncate text-xs text-faint">
        <SourceTag kind={source} short detail={when} className="!text-faint" />
      </div>
    </div>
  );
}

/** A plain labelled fact, for supporting figures that do not need a trend. */
export function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="tabular mt-1 text-lg font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-muted">{sub}</div>}
    </div>
  );
}

/** Label / value row for detail panels. Wrap rows in a <dl>. */
export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
      <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="tabular text-right text-[13px] font-medium text-ink">{children}</dd>
    </div>
  );
}

/* ───────────────────────── Controls ───────────────────────── */

export function Button({ variant = "secondary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-green text-white hover:bg-green-strong",
        variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-sunken",
        variant === "ghost" && "text-ink-soft hover:bg-sunken hover:text-ink",
        className,
      )}
    />
  );
}

/** Shared look for a text link that leads somewhere. */
export const LINK = "inline-flex items-center gap-1 text-sm font-medium text-green hover:text-green-strong";

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-lg bg-sunken p-0.5">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={clsx("rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
            o.value === value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Progressive disclosure: methods and technical detail stay one click away. */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-line first:border-t">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-sm font-medium text-ink marker:hidden hover:text-green-strong">
        {title}
        <ChevronDown size={16} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-5 text-sm leading-relaxed text-ink-soft">{children}</div>
    </details>
  );
}

/* ───────────────────────── Status and feedback ───────────────────────── */

type Tone = "good" | "warning" | "critical" | "neutral" | "info";

export function StatusDot({ tone = "good", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const color = { good: "bg-green", warning: "bg-amber", critical: "bg-red", neutral: "bg-faint", info: "bg-blue" }[tone];
  return <span className={clsx("inline-block h-2 w-2 shrink-0 rounded-full", color, pulse && "terra-pulse")} aria-hidden />;
}

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const style = {
    good: "bg-green-soft text-green-strong",
    warning: "bg-amber-soft text-amber",
    critical: "bg-red-soft text-red",
    neutral: "bg-sunken text-ink-soft",
    info: "bg-blue-soft text-blue",
  }[tone];
  return <span className={clsx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", style)}>{children}</span>;
}

export function Loading({ label = "Loading field data" }: { label?: string }) {
  return (
    <div className="flex h-48 items-center justify-center gap-2.5 text-sm text-muted" role="status" aria-live="polite">
      <StatusDot pulse /> {label}…
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red/25 bg-red-soft px-5 py-4">
      <CircleAlert size={18} className="mt-0.5 shrink-0 text-red" aria-hidden />
      <div>
        <p className="text-sm font-medium text-ink">This data could not be loaded.</p>
        <p className="mt-0.5 text-sm text-ink-soft">{message} Check the connection to the TERRA data service and reload the page.</p>
      </div>
    </div>
  );
}

/** A short note about how to read what follows: scope, caveats, simulated data. */
export function Notice({ tone = "info", children }: { tone?: "info" | "caution"; children: React.ReactNode }) {
  return (
    <p className={clsx("flex items-start gap-2.5 rounded-lg px-4 py-3 text-[13px] leading-relaxed text-ink-soft", tone === "caution" ? "border border-amber-line bg-amber-soft" : "bg-sunken")}>
      <Info size={15} className={clsx("mt-0.5 shrink-0", tone === "caution" ? "text-amber" : "text-muted")} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/* ───────────────────────── Tables ───────────────────────── */

export const TABLE = "w-full border-collapse text-sm";
export const TH = "border-b border-line px-3 py-2.5 text-left text-[13px] font-medium text-muted first:pl-0 last:pr-0";
export const TD = "border-b border-line px-3 py-3 align-top text-ink-soft first:pl-0 last:pr-0";

/** Coloured square that identifies a rotation plan next to its name. */
export function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />;
}
