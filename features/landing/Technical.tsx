"use client";

import clsx from "clsx";
import { ArrowDown, ArrowRight, Ban, CheckCircle2, Clock, Database, Eye, FileCode2, History, Satellite, Tag } from "lucide-react";
import { useState } from "react";
import {
  FLAG_RATES, LIMITS, MODELS, OLD_RAIN_BAND, RAIN_EVENTS, RAIN_LIMITS, REPORT, ROTATION_SHORT, STRESS_SEASONS, type ModelStatus,
} from "./modelReport";

/* ------------------------------------------------------------------ shared */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-green">{children}</p>;
}

function Head({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="terra-reveal max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-[32px] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[40px]">{title}</h2>
      {lead && <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">{lead}</p>}
    </div>
  );
}

function SubHead({ n, title, lead }: { n: string; title: string; lead?: string }) {
  return (
    <div className="terra-reveal max-w-3xl">
      <p className="tabular text-[13px] font-semibold text-muted">{n}</p>
      <h3 className="mt-1 text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]">{title}</h3>
      {lead && <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{lead}</p>}
    </div>
  );
}

const PANEL = "rounded-2xl border border-line bg-surface shadow-card";

function Figure({ src, alt, caption, width, height }: { src: string; alt: string; caption: string; width: number; height: number }) {
  return (
    <figure className={clsx(PANEL, "terra-reveal overflow-hidden")}>
      <div className="bg-white p-3 sm:p-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- static figure exported from the model report */}
        <img src={src} alt={alt} width={width} height={height} loading="lazy" className="h-auto w-full" />
      </div>
      <figcaption className="border-t border-line px-5 py-3 text-[13px] leading-relaxed text-muted">{caption}</figcaption>
    </figure>
  );
}

/* -------------------------------------------------------------- technology */

const FLOW = [
  { title: "NASA and open data", items: ["NASA POWER", "GPM IMERG", "SMAP L3 and L4", "MODIS and HLS NDVI", "SoilGrids", "Farmer's crop calendar"], tone: "blue" },
  { title: "Adapters", items: ["One FieldDay record per local day (Asia/Manila)", "Each value carries its source, product, provenance, depth, period and quality"], tone: "ink" },
  { title: "Models", items: ["Discovery Engine: rain, moisture, NDVI, sensor offset", "Water balance and Living Field Model", "Rotation planner, 10-day steps over real years", "Next Best Observation"], tone: "violet" },
  { title: "The platform", items: ["Discoveries", "Living Field Model", "Rotation Lab", "Reports"], tone: "green" },
] as const;

const TONE: Record<(typeof FLOW)[number]["tone"], string> = {
  blue: "bg-blue-soft text-blue", ink: "bg-sunken text-ink", violet: "bg-violet-soft text-violet", green: "bg-green-soft text-green-strong",
};

const RULES = [
  { icon: History, title: "No look-ahead", text: "Each detector sees only the days up to the day it judges, so it behaves as it would running live." },
  { icon: Ban, title: "Missing is missing", text: "A day without data gives the verdict “unknown”, never a guess. It neither starts nor ends an alarm." },
  { icon: Clock, title: "One alarm per onset", text: "A pattern that lasts weeks is reported once, on the day it starts." },
  { icon: FileCode2, title: "Settings in data files", text: "Every threshold lives in data/, with a test that ties it to the calibration output it came from." },
  { icon: Tag, title: "Provenance on every value", text: "Field measurement, satellite estimate, model output or simulation: the label travels with the number." },
];

const DATASETS = [
  { name: "NASA POWER", product: "Agroclimatology, daily", res: "~50 km", use: "Rain normals and monthly limits (2001–2023), FAO-56 reference evapotranspiration, rotation runs over real years" },
  { name: "NASA GPM IMERG", product: "GPM_3IMERGDF", res: "0.1° (~10 km), daily", use: "Rain for the daily water balance, with POWER on days IMERG is missing" },
  { name: "NASA SMAP L4", product: "SPL4SMGP", res: "9 km, daily", use: "Topsoil (0–5 cm) and root zone (0–100 cm) for moisture divergence and the Living Field Model; live map in the Field Explorer" },
  { name: "NASA SMAP L3", product: "SPL3SMP_E", res: "9 km, every 2–3 days", use: "The earlier Living Field Model corrections, replaced by L4" },
  { name: "NASA MODIS NDVI", product: "MOD13Q1", res: "250 m, 16-day composite", use: "“Below normal for the date” greenness rule from 2001–2023 history" },
  { name: "HLS NDVI", product: "Harmonized Landsat and Sentinel-2", res: "30 m", use: "Plot-scale greenness; clouds left 13 usable views of Plot A in two years" },
  { name: "SoilGrids", product: "Soil properties", res: "Gridded soil map", use: "Field capacity and wilting point, so total available water (83 mm per metre at Lipa)" },
];

const FORMULAS = [
  { name: "Crop water need", f: "ETc = Kc × ET₀", note: "FAO-56, with Kc over four growth stages" },
  { name: "Water the root zone can hold", f: "TAW = (FC − WP) × root depth", note: "Soil from SoilGrids" },
  { name: "Stress starts", f: "RAW = p × TAW", note: "Ks falls below 1 once water used exceeds RAW" },
  { name: "Rain departure", f: "ratio = 14-day rain ÷ expected rain", note: "Expected: the monthly normal spread over the same days" },
  { name: "Model update", f: "w = σ²model ÷ (σ²model + σ²reading)", note: "Weight given to each new soil-moisture reading" },
  { name: "Next Best Observation", f: "score = causes separated ÷ effort (min)", note: "Prefers cheap, quick checks" },
];

export function Technology() {
  return (
    <section id="technology" className="scroll-mt-20 border-t border-line py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Head eyebrow="Technology" title="From NASA orbit to a verdict for one field."
          lead="Every source is converted into one daily record per field. Every model reads that record, and every page shows where each number came from." />

        {/* Data flow */}
        <ol className="mt-12 grid gap-3 lg:grid-cols-4 lg:gap-0">
          {FLOW.map((step, i) => (
            <li key={step.title} className="terra-reveal flex flex-col lg:flex-row" style={{ transitionDelay: `${i * 90}ms` }}>
              <div className={clsx(PANEL, "flex-1 p-5")}>
                <span className={clsx("inline-flex rounded-md px-2 py-0.5 text-[12px] font-semibold", TONE[step.tone])}>{i + 1} · {step.title}</span>
                <ul className="mt-3 space-y-1.5 text-[14px] leading-snug text-ink-soft">
                  {step.items.map((t) => <li key={t} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden />{t}</li>)}
                </ul>
              </div>
              {i < FLOW.length - 1 && (
                <span className="flex items-center justify-center py-1 text-faint lg:px-2 lg:py-0" aria-hidden>
                  <ArrowDown size={18} className="lg:hidden" /><ArrowRight size={18} className="hidden lg:block" />
                </span>
              )}
            </li>
          ))}
        </ol>

        {/* Engine rules */}
        <div className="mt-14 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-5">
          {RULES.map((r, i) => (
            <div key={r.title} className="terra-reveal" style={{ transitionDelay: `${(i % 5) * 70}ms` }}>
              <r.icon size={20} className="text-green" aria-hidden />
              <p className="mt-3 text-[15px] font-semibold">{r.title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{r.text}</p>
            </div>
          ))}
        </div>

        {/* Datasets and formulas */}
        <div className="mt-16 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className={clsx(PANEL, "terra-reveal overflow-hidden")}>
            <div className="flex items-center gap-2 border-b border-line px-5 py-4">
              <Satellite size={17} className="text-blue" aria-hidden />
              <h3 className="text-[15px] font-semibold">Datasets and what each one does</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13.5px]">
                <thead className="text-[12px] text-muted">
                  <tr><th className="px-5 py-2.5 font-medium">Dataset</th><th className="px-3 py-2.5 font-medium">Resolution</th><th className="px-5 py-2.5 font-medium">Used for</th></tr>
                </thead>
                <tbody>
                  {DATASETS.map((d) => (
                    <tr key={d.name} className="border-t border-line align-top">
                      <td className="px-5 py-3"><span className="block font-semibold text-ink">{d.name}</span><span className="text-[12px] text-muted">{d.product}</span></td>
                      <td className="tabular whitespace-nowrap px-3 py-3 text-ink-soft">{d.res}</td>
                      <td className="px-5 py-3 leading-relaxed text-ink-soft">{d.use}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={clsx(PANEL, "terra-reveal p-5")}>
            <div className="flex items-center gap-2">
              <Database size={17} className="text-violet" aria-hidden />
              <h3 className="text-[15px] font-semibold">The science, stated</h3>
            </div>
            <dl className="mt-3 divide-y divide-line">
              {FORMULAS.map((f) => (
                <div key={f.name} className="py-3">
                  <dt className="text-[12px] font-medium text-muted">{f.name}</dt>
                  <dd className="mt-1 font-mono text-[14px] text-ink">{f.f}</dd>
                  <dd className="mt-0.5 text-[12.5px] text-muted">{f.note}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">Water balance after FAO Irrigation and Drainage Paper 56. Simple, inspectable rules first; a more complex model only once a simpler one is shown to fall short.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ charts */

/** Log scale for rain ratios: 0.06 at the bottom, 4 at the top. */
const LOG_MIN = Math.log10(0.06), LOG_MAX = Math.log10(4);
const ly = (v: number) => ((Math.log10(v) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
const TICKS = [0.1, 0.25, 0.5, 1, 2, 3];

function RainLimitsChart() {
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? RAIN_LIMITS[hover] : null;
  return (
    <figure className={clsx(PANEL, "terra-reveal p-5")}>
      <figcaption>
        <p className="text-[15px] font-semibold">What counts as unusual 14-day rain, by month</p>
        <p className="mt-0.5 text-[13px] text-muted">14-day rain ÷ normal for those days (log scale). NASA POWER, Lipa, 2001–2023.</p>
      </figcaption>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-green bg-green-soft" aria-hidden /> New normal band, 5th–95th percentile</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-dashed border-muted bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgba(104,118,109,0.35)_3px_4px)]" aria-hidden /> Old fixed band, {OLD_RAIN_BAND.dry}–{OLD_RAIN_BAND.wet} (guessed)</span>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="relative h-64 w-9 shrink-0 text-right text-[11px] text-muted" aria-hidden>
          {TICKS.map((t) => <span key={t} className="tabular absolute right-0 translate-y-1/2" style={{ bottom: `${ly(t)}%` }}>{t}</span>)}
        </div>
        <div className="relative h-64 flex-1" onMouseLeave={() => setHover(null)}>
          {TICKS.map((t) => <span key={t} className={clsx("absolute inset-x-0 border-t", t === 1 ? "border-line-strong" : "border-line")} style={{ bottom: `${ly(t)}%` }} aria-hidden />)}
          <span className="absolute inset-x-0 border-y border-dashed border-muted bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgba(104,118,109,0.16)_5px_6px)]"
            style={{ bottom: `${ly(OLD_RAIN_BAND.dry)}%`, top: `${100 - ly(OLD_RAIN_BAND.wet)}%` }} aria-hidden />
          <div className="absolute inset-0 flex" role="img" aria-label="Monthly limits for unusual 14-day rain; values in the table below">
            {RAIN_LIMITS.map((m, i) => (
              <div key={m.month} className="relative flex-1" onMouseEnter={() => setHover(i)}>
                <span className={clsx("absolute inset-x-[18%] rounded-[4px] border transition-colors",
                  hover === i ? "border-green-strong bg-green/35" : "border-green bg-green/15")}
                  style={{ bottom: `${ly(m.dry14)}%`, top: `${100 - ly(m.wet14)}%` }} />
              </div>
            ))}
          </div>
          {h && hover !== null && (
            <div className="pointer-events-none absolute z-10 w-44 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop"
              style={{ left: `clamp(0px, calc(${((hover + 0.5) / 12) * 100}% - 88px), calc(100% - 176px))`, top: 4 }}>
              <p className="font-semibold text-ink">{h.month}</p>
              <p className="tabular mt-1 flex justify-between text-ink-soft"><span>Dry below</span><span className="text-ink">{h.dry14.toFixed(3)}</span></p>
              <p className="tabular flex justify-between text-ink-soft"><span>Wet above</span><span className="text-ink">{h.wet14.toFixed(3)}</span></p>
              <p className="tabular flex justify-between text-ink-soft"><span>90-day drought below</span><span className="text-ink">{h.drought90.toFixed(3)}</span></p>
            </div>
          )}
        </div>
      </div>
      <div className="ml-11 flex text-center text-[11px] text-muted" aria-hidden>
        {RAIN_LIMITS.map((m) => <span key={m.month} className="flex-1">{m.month}</span>)}
      </div>
      <details className="mt-4 text-[13px]">
        <summary className="cursor-pointer font-medium text-ink-soft hover:text-ink">Show the monthly limits</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tabular w-full min-w-[420px] text-left">
            <thead className="text-[12px] text-muted"><tr><th className="py-1.5 font-medium">Month</th><th className="py-1.5 font-medium">Dry, 14 days (5th pct.)</th><th className="py-1.5 font-medium">Wet, 14 days (95th pct.)</th><th className="py-1.5 font-medium">Drought, 90 days (10th pct.)</th></tr></thead>
            <tbody>{RAIN_LIMITS.map((m) => <tr key={m.month} className="border-t border-line"><td className="py-1.5">{m.month}</td><td>{m.dry14.toFixed(3)}</td><td>{m.wet14.toFixed(3)}</td><td>{m.drought90.toFixed(3)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function FlagRateChart() {
  return (
    <figure className={clsx(PANEL, "terra-reveal flex flex-col p-5")}>
      <figcaption>
        <p className="text-[15px] font-semibold">How often the rule raises an alarm</p>
        <p className="mt-0.5 text-[13px] text-muted">Share flagged, old fixed limits against the new monthly limits.</p>
      </figcaption>
      <div className="mt-3 flex gap-5 text-[12.5px] text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-line-strong" aria-hidden /> Old limits</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-green" aria-hidden /> New limits</span>
      </div>
      <div className="mt-4 grid flex-1 grid-cols-3 gap-4">
        {FLAG_RATES.map((g) => (
          <div key={g.label} className="flex flex-col">
            <div className="flex h-48 items-end justify-center gap-1.5 border-b border-line-strong">
              {[{ v: g.old, c: "bg-line-strong", k: "Old" }, { v: g.next, c: "bg-green", k: "New" }].map((b) => (
                <div key={b.k} className="flex w-9 flex-col items-center justify-end" style={{ height: "100%" }}>
                  <span className="tabular mb-1 text-[12px] font-semibold text-ink">{Math.round(b.v)}%</span>
                  <span className={clsx("block w-full rounded-t-[4px]", b.c)} style={{ height: `${(b.v / 50) * 100}%` }} title={`${b.k} limits: ${b.v}%`} />
                </div>
              ))}
            </div>
            <p className="tabular mt-2 text-center text-[13px] font-semibold">{g.label}</p>
            <p className="mt-0.5 text-center text-[12px] leading-snug text-muted">{g.detail}</p>
          </div>
        ))}
      </div>
    </figure>
  );
}

function StressChart() {
  return (
    <figure className={clsx(PANEL, "terra-reveal p-5")}>
      <figcaption>
        <p className="text-[15px] font-semibold">Crop water-stress days per season</p>
        <p className="mt-0.5 text-[13px] text-muted">Plot A corn, farmer&apos;s planting dates, real weather. Bar: stress days; track: days in the record.</p>
      </figcaption>
      <ul className="mt-5 space-y-4">
        {STRESS_SEASONS.map((s) => (
          <li key={s.season}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-semibold text-ink">{s.season}</span>
              <span className="tabular text-muted"><span className="font-semibold text-ink">{s.stressDays}</span> of {s.daysInRecord} days</span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-sunken">
              <div className={clsx("h-full rounded-full", s.stressDays > 20 ? "bg-amber" : "bg-green")} style={{ width: `${(s.stressDays / s.daysInRecord) * 100}%` }} />
            </div>
            <p className="tabular mt-1 text-[12px] text-muted">Stress {s.period} · most water used {s.maxUsed}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">The 2024 dry season starts 17 days before the record, so its record is 74 days.</p>
    </figure>
  );
}

/* ----------------------------------------------------------------- results */

const STATUS: Record<ModelStatus, { cls: string; icon: typeof CheckCircle2 }> = {
  works: { cls: "bg-green-soft text-green-strong", icon: CheckCircle2 },
  pending: { cls: "bg-amber-soft text-amber", icon: Clock },
  blocked: { cls: "bg-sunken text-muted", icon: Ban },
};

const HEADLINES = [
  { value: "48% → 18%", label: "Days flagged by the rain alarm in 2024–2025", note: "Old guessed limits against limits from 23 years of Lipa rain" },
  { value: "2 of 3", label: "Real 2024 events caught on time", note: "Both storms on time; the El Niño drought caught late" },
  { value: "48 days", label: "Crop water stress in the 2024 dry season", note: "Agrees with the farmer's report of drought in Feb–Mar 2024" },
  { value: "10 of 24", label: "Years dry-season corn ran short of water", note: "The average-climate run showed no shortfall at all" },
];

export function ModelResults() {
  return (
    <section id="results" className="scroll-mt-20 border-y border-line bg-surface py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Head eyebrow="Models and results" title="Calibrated on real NASA data from Lipa."
          lead="The AI/ML workstream moved every model that can use real data onto NASA records for Lipa, Batangas, and set each threshold from Lipa's own history instead of a guess. No synthetic data is used for any result below." />

        {/* Headline numbers */}
        <dl className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HEADLINES.map((h, i) => (
            <div key={h.label} className="terra-reveal rounded-2xl border border-line bg-canvas p-5" style={{ transitionDelay: `${i * 80}ms` }}>
              <dd className="tabular text-[30px] font-semibold leading-none tracking-tight text-ink">{h.value}</dd>
              <dt className="mt-3 text-[14px] font-semibold leading-snug text-ink">{h.label}</dt>
              <dd className="mt-1 text-[13px] leading-snug text-muted">{h.note}</dd>
            </div>
          ))}
        </dl>

        {/* Model status */}
        <div className={clsx(PANEL, "terra-reveal mt-10 overflow-hidden")}>
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-[15px] font-semibold">What each model does now</h3>
            <p className="mt-0.5 text-[13px] text-muted">Before and after moving onto real data.</p>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {MODELS.map((m) => {
              const s = STATUS[m.status];
              return (
                <li key={m.name} className="px-5 py-4">
                  <p className="text-[15px] font-semibold text-ink">{m.name}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{m.after}</p>
                  <p className="mt-1 text-[12.5px] text-muted">Before: {m.before}</p>
                  <span className={clsx("mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", s.cls)}><s.icon size={13} aria-hidden />{m.statusLabel}</span>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-[13.5px]">
              <thead className="text-[12px] text-muted"><tr><th className="px-5 py-2.5 font-medium">Model</th><th className="px-3 py-2.5 font-medium">Before</th><th className="px-3 py-2.5 font-medium">After</th><th className="px-5 py-2.5 font-medium">Status</th></tr></thead>
              <tbody>
                {MODELS.map((m) => {
                  const s = STATUS[m.status];
                  return (
                    <tr key={m.name} className="border-t border-line align-top">
                      <td className="px-5 py-3 font-semibold text-ink">{m.name}</td>
                      <td className="px-3 py-3 leading-relaxed text-muted">{m.before}</td>
                      <td className="px-3 py-3 leading-relaxed text-ink-soft">{m.after}</td>
                      <td className="px-5 py-3"><span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", s.cls)}><s.icon size={13} aria-hidden />{m.statusLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rain departure */}
        <div className="mt-24">
          <SubHead n="01" title="Discovery Engine: rain departure"
            lead="It flags a 14-day period whose rain is far below or far above what is normal for that time of year. With no rain gauge at Lipa it uses NASA POWER rain and compares it only with POWER's own normal, so the comparison is like with like. A 90-day check catches droughts that build up over a season." />
          <ol className="terra-reveal mt-6 grid gap-3 text-[14px] leading-relaxed text-ink-soft md:grid-cols-4">
            {[
              "Expected rain for the window: the monthly normal (POWER 2001–2023) spread over its 14 days.",
              "Ratio: actual 14-day total ÷ expected. 1.0 is normal, 0.1 a tenth of normal.",
              "Too dry below the month's 5th percentile; too wet above its 95th.",
              "Drought: the same ratio over 90 days, below the month's 10th percentile.",
            ].map((t, i) => (
              <li key={t} className="flex gap-3 rounded-xl border border-line bg-canvas p-4">
                <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{i + 1}</span>{t}
              </li>
            ))}
          </ol>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <RainLimitsChart />
            <FlagRateChart />
          </div>
          <p className="terra-reveal mt-4 max-w-3xl text-[14px] leading-relaxed text-ink-soft">
            The old limits (0.45 and 1.7 times normal) were guessed for a rain gauge. Over 23 years of Lipa rain they flagged 30% of all 14-day
            windows, because dry months are naturally very variable. Monthly percentiles flag only the rarest 10%, and still hold on years they
            were not fitted to.
          </p>

          <div className={clsx(PANEL, "terra-reveal mt-8 overflow-hidden")}>
            <div className="border-b border-line px-5 py-4">
              <h4 className="text-[15px] font-semibold">Checked against real dated events, 2024</h4>
              <p className="mt-0.5 text-[13px] text-muted">From the farmer and from opened public reports. Agreement on three events, not an accuracy rate.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13.5px]">
                <thead className="text-[12px] text-muted"><tr><th className="px-5 py-2.5 font-medium">Event</th><th className="px-3 py-2.5 font-medium">Dates</th><th className="px-3 py-2.5 font-medium">Old rule</th><th className="px-3 py-2.5 font-medium">New rule</th><th className="px-5 py-2.5 font-medium">Result</th></tr></thead>
                <tbody>
                  {RAIN_EVENTS.map((e) => (
                    <tr key={e.event} className="border-t border-line align-top">
                      <td className="px-5 py-3"><span className="flex items-start gap-2 font-semibold text-ink"><span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.kind === "dry" ? "bg-amber" : "bg-blue")} aria-hidden />{e.event}</span><span className="ml-4 text-[12px] text-muted">{e.kind === "dry" ? "Dry" : "Wet"}</span></td>
                      <td className="tabular whitespace-nowrap px-3 py-3 text-ink-soft">{e.dates}</td>
                      <td className="px-3 py-3 text-muted">{e.oldRule}</td>
                      <td className="px-3 py-3 text-ink-soft">{e.newRule}</td>
                      <td className="px-5 py-3"><span className={clsx("inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium", e.verdict === "Caught" ? "bg-green-soft text-green-strong" : "bg-amber-soft text-amber")}>{e.verdict}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-[13px] leading-relaxed text-muted">
              16 alarm onsets in 2024–2025 instead of 22. One more wet alarm ends on 9 Nov 2025, the day Super Typhoon Uwan crossed Luzon; it is not
              scored because no opened source confirms heavy rain at Lipa.
            </p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Figure src="/landing/results/rain-ratio-2024-2025.webp" width={1453} height={825}
              alt="Rain ratio over 2024–2025 with the monthly dry and wet limits, and the days each rule flags"
              caption="The 14-day rain ratio with the new limits (top) and the days each rule flags (bottom). Shaded: the three real events." />
            <div className="space-y-6">
              <Figure src="/landing/results/rain-drought-90-day.webp" width={1419} height={474}
                alt="90-day rain ratio in 2024 crossing the drought limit in mid-April"
                caption="The 90-day check crosses the drought limit in mid-April 2024, after a January with normal rain: about two weeks after the farmer-reported window." />
              <div className="terra-reveal rounded-2xl border border-line bg-canvas p-5 text-[14px] leading-relaxed">
                <p className="font-semibold">Reading the result</p>
                <ul className="mt-2 space-y-1.5 text-ink-soft">
                  <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green" aria-hidden />False alarms cut by more than half, without missing either storm.</li>
                  <li className="flex gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden />Drought detection is late: POWER recorded some rain in Jan–Mar 2024.</li>
                  <li className="flex gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden />The wet side flags more than designed (12.9% instead of 5% in 2019–2023): recent years were wetter.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Water balance */}
        <div className="mt-24 grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <SubHead n="02" title="Daily crop water balance"
              lead="It tracks, day by day, how much of the root zone's water the crop has used, and flags water stress once the crop can no longer take water as fast as it needs. It runs the farmer's four corn seasons on Plot A, with growth stages stretched to each season (91–102 days) and Plot A's own SoilGrids soil. Rain comes from IMERG, with POWER on days IMERG is missing." />
            <div className="mt-6"><StressChart /></div>
          </div>
          <div className="space-y-6 lg:pt-16">
            <Figure src="/landing/results/water-balance-plot-a.webp" width={1466} height={531}
              alt="Daily root-zone depletion for Plot A corn in 2024–2025 against the stress and empty points"
              caption="Water used from the root zone against the stress point (RAW) and the empty point (TAW), with crop-stress days marked." />
            <p className="terra-reveal text-[14px] leading-relaxed text-ink-soft">
              The 2024 dry season has by far the most stress, 48 days from 27 January to 14 March, matching the farmer&apos;s report of drought in
              February–March 2024 with weakened corn. It is one event and the dry season is dry every year, so this is agreement, not proof.
            </p>
          </div>
        </div>

        {/* Rotation planner */}
        <div className="mt-24 grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <SubHead n="03" title="Rotation planner on real years"
              lead="Lipa's average month smooths every dry spell away, so every default rotation showed zero shortfall. The planner now also runs each rotation through every real year from 2001 to 2025, with 10-day rain from NASA POWER, and reports how often each season ran short." />
            <ul className="terra-reveal mt-6 space-y-3">
              {ROTATION_SHORT.map((r) => (
                <li key={r.rotation} className="rounded-2xl border border-line bg-canvas p-4">
                  <p className="text-[14px] font-semibold">{r.rotation}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{r.season}</p>
                  <p className="tabular mt-2 text-[14px] text-ink-soft"><span className="text-[20px] font-semibold text-ink">{r.years}</span> years short · driest-20% shortfall {r.shortfall}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-6 lg:pt-16">
            <Figure src="/landing/results/rotation-shortfall.webp" width={1548} height={501}
              alt="Water shortfall of the December to May corn season in each year from 2001 to 2025"
              caption="Shortfall of Rotation A's December–May corn season in each real year. Orange: Dec 2023 – May 2024, the farmer's drought season." />
            <p className="terra-reveal text-[14px] leading-relaxed text-ink-soft">
              The worst years, 2018–19, 2013–14 and 2009–10, are the same dry seasons the rain calibration found independently. The farmer&apos;s
              drought season ranks 6 of 24; the next dry season, with no reported drought, has no shortfall. Mungbean in the same season never ran short.
            </p>
          </div>
        </div>

        {/* Pending, checks, limits */}
        <div className="mt-24 grid gap-6 lg:grid-cols-2">
          <div className="terra-reveal rounded-2xl border border-line bg-canvas p-6">
            <h3 className="text-[17px] font-semibold">Built, waiting on NASA history</h3>
            <ul className="mt-4 space-y-4 text-[14px] leading-relaxed text-ink-soft">
              <li><span className="font-semibold text-ink">Moisture divergence.</span> Topsoil drying fast while deeper soil holds steady. With no probes, it uses SMAP L4 topsoil (0–5 cm) and root zone (0–100 cm), with limits from Lipa&apos;s L4 history 2015–2023.</li>
              <li><span className="font-semibold text-ink">NDVI below normal.</span> A composite below the 10th percentile for the same date in 2001–2023 MODIS history: unusually brown for the time of year.</li>
              <li><span className="font-semibold text-ink">Living Field Model.</span> SMAP L3 read wetter than the soil can hold, pinning topsoil at field capacity on 65% of days. It now uses SMAP L4 for both layers, rescaled to this soil.</li>
              <li><span className="font-semibold text-ink">Sensor offset</span> cannot run: it needs a ground sensor on at least 21 days with a satellite reading. Nothing is substituted for missing ground data.</li>
            </ul>
            <p className="mt-4 text-[13px] text-muted">Results pending: the SMAP L4 and MODIS histories had not been delivered by NASA when the report was built.</p>
          </div>
          <div className="terra-reveal rounded-2xl border border-line bg-canvas p-6">
            <h3 className="text-[17px] font-semibold">How the results were checked</h3>
            <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-ink-soft">
              {[
                `Unit tests: ${REPORT.tests}.`,
                "Every calibrated number in the code is tested against the calibration output it came from.",
                "Hand calculations: one rotation step, one water-balance step, the stage scaling, one SMAP L4 daily mean, one IMERG monthly value.",
                "Held-out years: each calibration was also fitted on early years and tested on later ones.",
                "The earlier synthetic experiments E-001 to E-004 give identical metrics after every engine change.",
                "Real events used for checking come only from sources that were opened.",
              ].map((t) => <li key={t} className="flex gap-2.5"><Eye size={15} className="mt-1 shrink-0 text-green" aria-hidden />{t}</li>)}
            </ul>
          </div>
        </div>

        <div className={clsx(PANEL, "terra-reveal mt-6 overflow-hidden")}>
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-[15px] font-semibold">What limits the results, and what would fix it</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <thead className="text-[12px] text-muted"><tr><th className="px-5 py-2.5 font-medium">Limit</th><th className="px-3 py-2.5 font-medium">Effect</th><th className="px-5 py-2.5 font-medium">What would fix it</th></tr></thead>
              <tbody>
                {LIMITS.map((l) => (
                  <tr key={l.limit} className="border-t border-line align-top">
                    <td className="px-5 py-3 font-semibold text-ink">{l.limit}</td>
                    <td className="px-3 py-3 leading-relaxed text-ink-soft">{l.effect}</td>
                    <td className="px-5 py-3 leading-relaxed text-ink-soft">{l.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="terra-reveal mt-6 max-w-3xl text-[13px] leading-relaxed text-muted">
          Source: the AI/ML workstream&apos;s report &ldquo;{REPORT.title}&rdquo; and its rain-departure section, built {REPORT.built}. In the platform, Lipa
          Cropland now runs on its real 2024–2025 NASA record with these calibrated settings; station-only panels and the other
          demonstration fields still use labelled demo data.
        </p>
      </div>
    </section>
  );
}
