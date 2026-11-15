"use client";

import clsx from "clsx";
import {
  ArrowRight, CloudSun, Hand, Compass, Eye, FlaskConical, Layers3, LineChart, Map as MapIcon, Network, RefreshCw, Satellite, Search, Sprout, Waypoints,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { LogoLoader } from "@/components/brand/LogoLoader";

const StationModel = dynamic(() => import("@/components/three/StationModel"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading 3D model…</div>,
});

const NAV = [
  { href: "#problem", label: "Problem" },
  { href: "#solution", label: "Solution" },
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
];

/** Fade sections up as they scroll into view. */
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".terra-reveal")];
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -10% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-green">{children}</p>;
}

function SectionHead({ eyebrow, title, lead, center = false }: { eyebrow: string; title: string; lead?: string; center?: boolean }) {
  return (
    <div className={clsx("terra-reveal max-w-2xl", center && "mx-auto text-center")}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-[32px] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[40px]">{title}</h2>
      {lead && <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">{lead}</p>}
    </div>
  );
}

const PROBLEMS = [
  { icon: Satellite, title: "Satellite data is hard to use", text: "NASA observes soil moisture, rain and vegetation every day, but it arrives as coarse grids and technical files that are hard to act on for one farm." },
  { icon: Compass, title: "One sensor sees one spot", text: "A field sensor measures a single point. Without context, it is hard to tell whether a reading is normal for this field or a sign of trouble." },
  { icon: RefreshCw, title: "Rotations rely on habit", text: "Choosing what to plant next often follows last season. There is rarely a simple way to compare options against a field's water, soil and climate." },
];

const SOURCES = [
  { dot: "bg-blue", label: "From orbit", text: "NASA soil moisture (SMAP), rainfall (GPM IMERG), vegetation (MODIS NDVI) and climate records (POWER)." },
  { dot: "bg-green", label: "From the field", text: "A solar-powered station: soil moisture at 10 and 40 cm, soil temperature, conductivity and rainfall." },
  { dot: "bg-violet", label: "From simple models", text: "Stated, inspectable calculations, such as the FAO-56 crop water balance, never a black box." },
];

const FEATURES = [
  { icon: Eye, title: "Field Overview", text: "What needs attention, the crop's stage and today's key readings, on one screen." },
  { icon: MapIcon, title: "Field Explorer", text: "A 3D map of the field with sensor beacons, satellite layers and a live NASA soil-moisture view." },
  { icon: Search, title: "Discovery Center", text: "Unusual patterns flagged automatically, each with its evidence and what to check next." },
  { icon: Network, title: "Living Field Model", text: "Water, soil, vegetation, climate and rotation in one picture, with a 3D field simulation." },
  { icon: Sprout, title: "Rotation Lab", text: "Build crop sequences and compare them on water use, soil health and risk before planting." },
  { icon: CloudSun, title: "Future Earth", text: "Test how rotations hold up under hotter, drier or wetter seasons." },
];

const STEPS = [
  { icon: Satellite, title: "Observe", text: "Station and satellite readings arrive and are checked: duplicates removed, impossible values left as gaps." },
  { icon: Search, title: "Discover", text: "Each new reading is compared with the field's own history. What departs from it is flagged." },
  { icon: Waypoints, title: "Investigate", text: "Every discovery shows its evidence and the next observation that would confirm or rule it out." },
  { icon: Layers3, title: "Understand", text: "The Living Field Model connects the finding to water, soil, vegetation, climate and rotation." },
  { icon: FlaskConical, title: "Experiment", text: "Rotation Lab and Future Earth test options against this field before anything is planted." },
  { icon: LineChart, title: "Adapt", text: "Choose, plant and keep observing. The next season starts the loop again." },
];

export function Landing() {
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const done = useCallback(() => setLoading(false), []);
  useReveal();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {loading && <LogoLoader onDone={done} />}

      {/* Navigation */}
      <header className={clsx("sticky top-0 z-50 transition-colors", scrolled ? "border-b border-line bg-canvas/85 backdrop-blur" : "border-b border-transparent")}>
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8" aria-label="Landing page">
          <Link href="/" className="flex items-center gap-2.5" aria-label="TERRA home">
            <LogoMark size={24} />
            <span className="text-[17px] font-semibold tracking-[0.14em]">TERRA</span>
          </Link>
          <ul className="ml-6 hidden items-center gap-6 text-sm text-ink-soft md:flex">
            {NAV.map((n) => <li key={n.href}><a href={n.href} className="hover:text-ink">{n.label}</a></li>)}
          </ul>
          <Link href="/overview" className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-green-strong">
            Open TERRA <ArrowRight size={15} aria-hidden />
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(55,134,74,0.12),transparent)]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-16 text-center sm:px-8 sm:pt-24">
            <p className="terra-reveal mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-soft shadow-card">
              <span className="h-1.5 w-1.5 rounded-full bg-green" aria-hidden /> Crop-rotation intelligence for every field
            </p>
            <h1 className="terra-reveal mx-auto mt-6 max-w-3xl text-[40px] font-semibold leading-[1.07] tracking-tight sm:text-[60px]">
              See what your field <span className="text-green">is telling you.</span>
            </h1>
            <p className="terra-reveal mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-soft sm:text-lg">
              TERRA combines NASA Earth observation with an in-field sensor station to notice what is changing in a field,
              explain why, and test crop rotations before you plant.
            </p>
            <div className="terra-reveal mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/overview" className="inline-flex items-center gap-2 rounded-xl bg-green px-5 py-3 text-[15px] font-medium text-white shadow-card hover:bg-green-strong">
                Explore the demo field <ArrowRight size={16} aria-hidden />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 text-[15px] font-medium text-ink hover:border-line-strong">
                How it works
              </a>
            </div>
          </div>
          <div className="terra-reveal relative mx-auto max-w-6xl px-3 sm:px-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered device mockup */}
            <img src="/landing/overview-combo.webp" alt="TERRA's field overview on a laptop and a phone" width={2400} height={1317} className="h-auto w-full" />
          </div>
        </section>

        {/* Problem */}
        <section id="problem" className="scroll-mt-20 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SectionHead eyebrow="The problem" title="Farm decisions are made with too little field-specific evidence."
              lead="The data exists. It is just scattered, coarse and hard to read for the field you are standing in." />
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {PROBLEMS.map((p, i) => (
                <article key={p.title} className="terra-reveal rounded-2xl border border-line bg-surface p-7 shadow-card" style={{ transitionDelay: `${i * 90}ms` }}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-soft text-amber"><p.icon size={20} aria-hidden /></span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{p.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Solution */}
        <section id="solution" className="scroll-mt-20 border-y border-line bg-surface py-24 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <div>
              <SectionHead eyebrow="The solution" title="One living picture of one field."
                lead="TERRA brings three kinds of evidence together and keeps them honest: every number is labelled as a field measurement, a satellite estimate, a model output or a simulation." />
              <ul className="mt-8 space-y-5">
                {SOURCES.map((s, i) => (
                  <li key={s.label} className="terra-reveal flex gap-4" style={{ transitionDelay: `${i * 90}ms` }}>
                    <span className={clsx("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", s.dot)} aria-hidden />
                    <span>
                      <span className="block text-[15px] font-semibold">{s.label}</span>
                      <span className="mt-0.5 block text-[15px] leading-relaxed text-ink-soft">{s.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="terra-reveal">
              {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered device mockup */}
              <img src="/landing/explorer-laptop.webp" alt="Field Explorer: the field in 3D with soil-moisture beacons" width={2000} height={1202} className="h-auto w-full" loading="lazy" />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SectionHead eyebrow="Features" title="Everything about a field, in six places." center
              lead="Each page answers one question, from what is happening today to what to plant next season." />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <article key={f.title} className="terra-reveal group rounded-2xl border border-line bg-surface p-7 shadow-card transition-colors hover:border-green/40" style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-soft text-green"><f.icon size={20} aria-hidden /></span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{f.text}</p>
                </article>
              ))}
            </div>

            <div className="mt-16 grid items-center gap-10 rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,4fr)]">
              <div className="terra-reveal order-2 lg:order-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered device mockup */}
                <img src="/landing/model-laptop.webp" alt="Living Field Model: a 3D field simulation with soil water and readings" width={2000} height={1202} className="h-auto w-full" loading="lazy" />
              </div>
              <div className="terra-reveal order-1 lg:order-2">
                <Eyebrow>Spotlight</Eyebrow>
                <h3 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight">Watch the field respond.</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                  The field environment turns the record into a scene: soil fills with stored water, crops grow with the season,
                  and rain or sun follows the day&apos;s gauge. Try a dry spell or a monsoon to see the difference.
                </p>
                <Link href="/model" className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-green hover:text-green-strong">
                  Open the Living Field Model <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 border-y border-line bg-surface py-24 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SectionHead eyebrow="How it works" title="A simple loop, every season." center
              lead="Observe, Discover, Investigate, Understand, Experiment, Adapt." />
            <ol className="mt-14 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="terra-reveal relative flex gap-4" style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-canvas text-green">
                    <s.icon size={20} aria-hidden />
                    <span className="tabular absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">{i + 1}</span>
                  </span>
                  <span>
                    <span className="block text-lg font-semibold tracking-tight">{s.title}</span>
                    <span className="mt-1 block text-[15px] leading-relaxed text-ink-soft">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Station */}
        <section className="py-24 sm:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
            <div className="terra-reveal relative h-[380px] overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-green-soft to-surface shadow-card sm:h-[440px]">
              <StationModel className="absolute inset-0" />
              <p className="pointer-events-none absolute left-4 top-4 flex items-center gap-1.5 text-xs text-muted"><Hand size={13} aria-hidden /> Drag to rotate</p>
            </div>
            <div>
              <SectionHead eyebrow="Ground truth" title="A station in the field keeps the satellites honest."
                lead="Satellites see a whole landscape. The TERRA station measures the soil where the crop actually grows, so the two can be compared." />
              <ul className="terra-reveal mt-7 grid gap-3 text-[15px] text-ink-soft sm:grid-cols-2">
                {["Soil moisture at 10 cm", "Soil moisture at 40 cm", "Soil temperature", "Bulk electrical conductivity", "Rainfall (tipping bucket)", "Solar powered"].map((t) => (
                  <li key={t} className="flex items-center gap-2.5"><span className="h-1.5 w-1.5 rounded-full bg-green" aria-hidden />{t}</li>
                ))}
              </ul>
              <p className="terra-reveal mt-6 text-[13px] text-muted">Prototype hardware. In this demonstration build, station readings are simulated.</p>
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="terra-reveal relative overflow-hidden rounded-3xl bg-ink px-6 py-16 text-center text-white sm:px-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,rgba(75,206,77,0.25),transparent)]" aria-hidden />
            <LogoMark size={44} className="relative mx-auto text-white" />
            <h2 className="relative mx-auto mt-6 max-w-2xl text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">Explore a field in Batangas, Philippines.</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-white/75">
              Walk through Lipa Cropland: its discoveries, 3D map, field model and rotation options, with demo readings.
            </p>
            <Link href="/overview" className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[15px] font-medium text-ink hover:bg-green-soft">
              Open TERRA <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-[13px] text-muted sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5 text-ink">
            <LogoMark size={20} />
            <span className="font-semibold tracking-[0.14em]">TERRA</span>
          </div>
          <p className="max-w-xl sm:text-right">
            Demonstration build. Field readings are demo data; the NASA soil-moisture map is live from NASA GIBS.
            Data: NASA SMAP, GPM IMERG, MODIS and POWER. Imagery © Esri. Map data © OpenStreetMap contributors.
          </p>
        </div>
      </footer>
    </div>
  );
}
