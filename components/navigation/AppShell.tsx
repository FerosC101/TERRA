"use client";

import clsx from "clsx";
import { Bell, Check, ChevronDown, Database, Menu, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { CropImage } from "@/components/visual/Crop";
import { CROPS } from "@/data/crops";
import { recordEndDate } from "@/data/nasa/realRecords";
import { DEMO_TODAY, daysBetween, longDate, shortDate } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getConnectionStatus } from "@/services/nasaDataService";
import { NAV } from "./nav";

/** Last day of a field's record: 31 Dec 2025 for the real Lipa records, DEMO_TODAY for demo fields. */
const recordEnd = (fieldId: string) => recordEndDate(fieldId, DEMO_TODAY);

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <Link href="/overview" onClick={onNavigate} className="flex h-16 items-center px-5" aria-label="TERRA overview"><Logo /></Link>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-green-soft text-green-strong" : "text-ink-soft hover:bg-sunken hover:text-ink")}>
              <Icon size={16} className={active ? "text-green" : "text-muted"} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Closes a popover when the user clicks elsewhere or presses Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

const POP = "absolute top-full z-[1200] mt-2 rounded-xl border border-line-strong bg-surface p-1.5 shadow-pop";
const ICON_BUTTON = "relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-sunken hover:text-ink";

/** Place name without the country, for compact labels */
const shortPlace = (location: string) => location.split(",").slice(0, 2).join(",").trim();

function FieldSelector() {
  const { field, fields, setFieldId } = useApp();
  const { open, setOpen, ref } = usePopover();
  const options = useRef<(HTMLButtonElement | null)[]>([]);

  // Open with focus on the current field; arrows, Home and End move through the list
  useEffect(() => {
    if (open) options.current[Math.max(0, fields.findIndex((f) => f.id === field.id))]?.focus();
  }, [open, fields, field.id]);
  const onKey = (e: React.KeyboardEvent) => {
    const list = options.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    list[(to + list.length) % list.length]?.focus();
  };

  return (
    <div className="relative min-w-0" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open} aria-label={`Field: ${field.name}. Change field`}
        className={clsx("group flex h-11 max-w-full items-center gap-2.5 rounded-xl border bg-surface py-1 pl-1 pr-2.5 text-left shadow-card transition-colors",
          open ? "border-green ring-2 ring-green/15" : "border-line hover:border-line-strong")}>
        <CropImage id={field.fallow ? "fallow" : field.currentCrop} size="xs" className="h-9! w-9! rounded-lg" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight text-ink">{field.name}</span>
          <span className="hidden truncate text-xs leading-tight text-muted sm:block">{shortPlace(field.location)} · {fmt(field.areaHa, 1)} ha</span>
        </span>
        <ChevronDown size={16} className={clsx("ml-0.5 shrink-0 text-muted transition-transform", open && "rotate-180 text-ink")} aria-hidden />
      </button>
      {open && (
        <div onKeyDown={onKey} className={clsx(POP, "left-0 w-[22rem] max-w-[calc(100vw-2rem)] p-2 max-sm:fixed max-sm:inset-x-3 max-sm:top-[60px] max-sm:mt-0 max-sm:w-auto max-sm:max-w-none")}>
          <p className="flex items-center justify-between px-2 pb-2 pt-1 text-xs font-medium text-muted">
            <span>Switch field</span><span className="tabular">{fields.length} fields</span>
          </p>
          <ul aria-label="Fields" className="space-y-1">
            {fields.map((f, i) => {
              const current = f.id === field.id;
              const crop = CROPS[f.currentCrop];
              const day = daysBetween(f.plantedOn, recordEnd(f.id));
              const badge = f.role === "primary" ? "Primary" : f.role === "farm" ? "Farm site" : "Demo";
              return (
                <li key={f.id}>
                  <button ref={(n) => { options.current[i] = n; }} type="button" aria-current={current ? "true" : undefined}
                    onClick={() => { setFieldId(f.id); setOpen(false); }}
                    className={clsx("grid w-full grid-cols-[44px_minmax(0,1fr)_20px] items-center gap-3 rounded-lg p-2 text-left outline-none transition-colors",
                      current ? "bg-green-soft" : "hover:bg-sunken focus-visible:bg-sunken", "focus-visible:ring-2 focus-visible:ring-green/40")}>
                    <CropImage id={f.fallow ? "fallow" : f.currentCrop} size="xs" className="h-11! w-11! rounded-lg" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{f.name}</span>
                        <span className={clsx("shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-medium", f.role === "secondary" ? "bg-black/[0.05] text-muted" : "bg-green/10 text-green-strong")}>
                          {badge}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{shortPlace(f.location)} · {fmt(f.areaHa, 1)} ha</span>
                      <span className="block truncate text-xs text-ink-soft">{f.fallow ? `Fallow · next planting ${f.fallow.next}` : `${crop.name}${day >= 0 ? `, day ${day}` : ""}`}</span>
                    </span>
                    <span className="flex justify-center">{current && <Check size={17} className="text-green" aria-hidden />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 border-t border-line px-2 pt-2 text-[11px] leading-snug text-muted">Every page follows the field you choose. Lipa fields run on real NASA data (2024–2025) with a simulated station; demo fields use illustrative climate.</p>
        </div>
      )}
    </div>
  );
}

function DataStatus() {
  const { field } = useApp();
  const status = getConnectionStatus();
  const { open, setOpen, ref } = usePopover();
  const demo = status.mode === "demo";
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Data status: ${status.label}`}
        className={clsx("flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium", demo ? "bg-amber-soft text-amber hover:bg-amber-line/60" : "bg-green-soft text-green-strong")}>
        <Database size={14} aria-hidden />
        <span className="hidden md:inline">{status.label}</span>
      </button>
      {open && (
        <div className={clsx(POP, "right-0 w-80 max-w-[calc(100vw-2rem)] p-4")}>
          <div className="text-sm font-medium text-ink">{status.label}</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{status.detail}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">The record ends {longDate(recordEnd(field.id))}. Every value states whether it is a field measurement, a satellite estimate, a model output or a simulation.</p>
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { field, followUps } = useApp();
  const { open, setOpen, ref } = usePopover();
  const { data } = useService(`disc:${field.id}:${followUps.length}`, () => getDiscoveries(field.id, followUps));
  const pending = (data ?? []).filter((d) => d.status !== "resolved");
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-label={`Notifications, ${pending.length} open`} aria-expanded={open} className={ICON_BUTTON}>
        <Bell size={17} aria-hidden />
        {pending.length > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-green px-1 text-[10px] font-semibold text-white">{pending.length}</span>
        )}
      </button>
      {open && (
        <div className={clsx(POP, "right-0 w-80 max-w-[calc(100vw-2rem)]")}>
          <div className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted">Open discoveries · {field.name}</div>
          {pending.length === 0 && <p className="px-2.5 pb-3 pt-1 text-[13px] text-muted">Nothing needs attention right now.</p>}
          {pending.map((d) => (
            <Link key={d.id} href={`/discoveries/${d.id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-2 hover:bg-sunken">
              <span className="block text-sm font-medium text-ink">{d.title}</span>
              <span className="block text-xs text-muted">{d.category} · detected {shortDate(d.detectedOn)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Profile() {
  const { open, setOpen, ref } = usePopover();
  const { resetRotations } = useApp();
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-label="User profile" aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-green-soft text-green-strong hover:bg-green-soft/70">
        <User size={16} aria-hidden />
      </button>
      {open && (
        <div className={clsx(POP, "right-0 w-64")}>
          <div className="px-2.5 py-2">
            <div className="text-sm font-medium text-ink">Demo analyst</div>
            <div className="text-xs text-muted">Local session · no account connected</div>
          </div>
          <Link href="/reports" onClick={() => setOpen(false)} className="block rounded-lg px-2.5 py-2 text-sm text-ink hover:bg-sunken">Field report</Link>
          <button type="button" onClick={() => { resetRotations(); setOpen(false); }} className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-sunken">
            Reset rotation plans to examples
          </button>
        </div>
      )}
    </div>
  );
}

/** Pages that use the full content area edge to edge (the map). */
const FULL_BLEED = ["/explorer"];
/** Pages that bring their own layout, without the app's sidebar and header: the website at / */
const isBare = (pathname: string) => pathname === "/";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const fullBleed = FULL_BLEED.some((p) => pathname.startsWith(p));
  if (isBare(pathname)) return <>{children}</>;
  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-56 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="no-print fixed inset-0 z-[1300] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-ink/30" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-line bg-surface shadow-pop">
            <button type="button" aria-label="Close navigation" onClick={() => setDrawer(false)} className={clsx(ICON_BUTTON, "absolute right-2 top-3.5")}>
              <X size={18} />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-56">
        <header className="no-print sticky top-0 z-[1100] flex h-16 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6 lg:px-10">
          <button type="button" aria-label="Open navigation" onClick={() => setDrawer(true)} className={clsx(ICON_BUTTON, "-ml-1.5 lg:hidden")}>
            <Menu size={19} />
          </button>
          <FieldSelector />
          <div className="ml-auto flex items-center gap-1.5">
            <DataStatus />
            <Notifications />
            <Profile />
          </div>
        </header>
        <main className={fullBleed ? "relative" : "mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10"}>{children}</main>
      </div>
    </div>
  );
}
