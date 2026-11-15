"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { ASPECT, LOGO_PATHS, VIEWBOX } from "./Logo";

/**
 * The TERRA mark, assembling itself: the planet rises in, the orbit sweeps across,
 * the two leaves grow from their stems. Pure CSS (see `.terra-logo-*` in globals.css),
 * so it starts with the page and stops for people who prefer reduced motion.
 */
export function AnimatedLogoMark({ size = 96, className = "text-ink" }: { size?: number; className?: string }) {
  return (
    <svg width={Math.round(size * ASPECT)} height={size} viewBox={VIEWBOX} fill="none" className={clsx("terra-logo-anim overflow-visible", className)} role="img" aria-label="TERRA logo">
      {LOGO_PATHS.map((p) => (
        <g key={p.part} className={`terra-logo-${p.part}`}>
          <path d={p.d} fill={p.fill} transform={p.transform} />
        </g>
      ))}
    </svg>
  );
}

/** How long the loading screen stays, so the mark finishes before the page shows */
export const LOADER_MS = 2600;

/** Full-screen loading screen with the animated mark and wordmark. Click to skip. */
export function LogoLoader({ onDone, tagline = "Agricultural discovery from Earth observation" }: { onDone: () => void; tagline?: string }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stay = window.setTimeout(() => setLeaving(true), reduce ? 500 : LOADER_MS);
    return () => window.clearTimeout(stay);
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const done = window.setTimeout(onDone, 600);
    return () => window.clearTimeout(done);
  }, [leaving, onDone]);

  return (
    <div role="status" aria-label="Loading TERRA" onClick={() => setLeaving(true)}
      className={clsx("fixed inset-0 z-[2000] flex cursor-pointer flex-col items-center justify-center bg-canvas transition-[opacity,transform] duration-500 ease-out",
        leaving && "pointer-events-none scale-[1.03] opacity-0")}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(55,134,74,0.10),transparent_60%)]" aria-hidden />
      <AnimatedLogoMark size={112} />
      <p className="mt-7 flex text-[30px] font-semibold tracking-[0.32em] text-ink" aria-hidden>
        {"TERRA".split("").map((ch, i) => (
          <span key={i} className="terra-logo-letter" style={{ animationDelay: `${1350 + i * 70}ms` }}>{ch}</span>
        ))}
      </p>
      <p className="terra-logo-tagline mt-3 text-sm text-muted">{tagline}</p>
      <span className="terra-logo-progress mt-8 block h-[3px] w-28 overflow-hidden rounded-full bg-line" aria-hidden><span className="block h-full rounded-full bg-green" /></span>
    </div>
  );
}
