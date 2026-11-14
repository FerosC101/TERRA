"use client";

import clsx from "clsx";
import { ChevronDown, Gauge, Cpu, FlaskConical, Satellite } from "lucide-react";
import type { Provenance } from "@/types";

export function Panel({ className, children, as: Tag = "section" }: { className?: string; children: React.ReactNode; as?: "section" | "div" | "article" }) {
  return (
    <Tag className={clsx("print-avoid rounded-lg border border-line bg-surface/80 backdrop-blur-sm", className)}>
      {children}
    </Tag>
  );
}

/** Small technical label in the display face — used for section eyebrows. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-muted", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow: string; title: string; lead?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        <Eyebrow className="!text-terra">{eyebrow}</Eyebrow>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-wide text-silver sm:text-[28px]">{title}</h1>
        {lead && <p className="mt-2 text-sm leading-relaxed text-muted">{lead}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const PROVENANCE: Record<Provenance, { label: string; icon: typeof Gauge; tone: string; help: string }> = {
  measurement: { label: "Field measurement", icon: Gauge, tone: "text-terra-soft border-terra/30", help: "Read by a sensor in the field." },
  satellite: { label: "Satellite estimate", icon: Satellite, tone: "text-water border-water/30", help: "Estimated from orbit over an area larger than the field." },
  model: { label: "Model output", icon: Cpu, tone: "text-violet border-violet/30", help: "Calculated from other data using stated assumptions." },
  simulated: { label: "Simulation", icon: FlaskConical, tone: "text-amber border-amber/30", help: "A what-if result, not an observation or a forecast." },
};

/** States how a value came to exist. `demo` adds the reminder that this build's data is generated. */
export function ProvenanceTag({ kind, demo = true, className }: { kind: Provenance; demo?: boolean; className?: string }) {
  const p = PROVENANCE[kind];
  const Icon = p.icon;
  return (
    <span title={`${p.help}${demo ? " Demo data in this build." : ""}`}
      className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium", p.tone, className)}>
      <Icon size={11} aria-hidden />
      {p.label}
      {demo && <span className="text-muted">· demo</span>}
    </span>
  );
}

export function Button({ variant = "secondary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-terra text-forest-deep hover:bg-terra-soft",
        variant === "secondary" && "border border-line-strong text-silver hover:border-terra/60 hover:text-terra-soft",
        variant === "ghost" && "text-muted hover:bg-white/5 hover:text-silver",
        className,
      )}
    />
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap rounded-md border border-line bg-forest-deep/60 p-0.5">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={clsx("rounded px-2.5 py-1 text-xs font-medium transition-colors",
            o.value === value ? "bg-terra/15 text-terra-soft" : "text-muted hover:text-silver")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Progressive disclosure: scientific detail stays one click away. */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-md border border-line bg-forest-deep/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] font-medium text-silver marker:hidden">
        {title}
        <ChevronDown size={15} className="text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-3.5 py-3 text-[13px] leading-relaxed text-muted">{children}</div>
    </details>
  );
}

export function StatusDot({ tone = "good", pulse = false }: { tone?: "good" | "warning" | "critical" | "neutral"; pulse?: boolean }) {
  const color = { good: "bg-terra", warning: "bg-amber", critical: "bg-alert", neutral: "bg-muted" }[tone];
  return <span className={clsx("inline-block h-2 w-2 shrink-0 rounded-full", color, pulse && "terra-pulse")} aria-hidden />;
}

export function Loading({ label = "Loading field data" }: { label?: string }) {
  return (
    <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted" role="status">
      <StatusDot pulse /> {label}…
    </div>
  );
}

export function DemoNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-amber/25 bg-amber/5 px-3 py-2 text-xs leading-relaxed text-silver/90">
      <FlaskConical size={14} className="mt-0.5 shrink-0 text-amber" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
