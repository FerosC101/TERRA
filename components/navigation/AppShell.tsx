"use client";

import clsx from "clsx";
import { Bell, ChevronDown, Database, Menu, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { StatusDot } from "@/components/ui";
import { longDate, shortDate } from "@/lib/dates";
import { useApp } from "@/lib/store";
import { useService } from "@/lib/useService";
import { getDiscoveries } from "@/services/discoveryService";
import { getConnectionStatus } from "@/services/nasaDataService";
import { NAV } from "./nav";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={clsx("group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors",
              active ? "bg-terra/10 text-silver" : "text-muted hover:bg-white/[0.04] hover:text-silver")}>
            <span className={clsx("absolute left-0 top-2 bottom-2 w-0.5 rounded-full transition-colors", active ? "bg-terra" : "bg-transparent")} />
            <Icon size={17} className={active ? "text-terra" : "text-muted group-hover:text-silver"} aria-hidden />
            <span className="flex-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="block px-5 pb-6 pt-5"><Logo /></Link>
      <div className="flex-1 overflow-y-auto px-3"><NavLinks onNavigate={onNavigate} /></div>
      <div className="m-3 rounded-md border border-line p-3">
        <div className="font-display text-[9px] font-semibold tracking-[0.18em] text-muted">TERRA WORKFLOW</div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Observe → Discover → Investigate → Understand → Experiment → Adapt
        </p>
      </div>
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

const POP = "absolute right-0 top-full z-[1200] mt-2 rounded-lg border border-line-strong bg-raised p-1.5 shadow-2xl shadow-black/50";

function FieldSelector() {
  const { field, fields, setFieldId } = useApp();
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative min-w-0" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}
        className="flex max-w-full items-center gap-2 rounded-md border border-line px-3 py-1.5 text-left hover:border-line-strong">
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wider text-muted">Field</span>
          <span className="block truncate text-[13px] font-medium text-silver">{field.name}</span>
        </span>
        <ChevronDown size={15} className="shrink-0 text-muted" aria-hidden />
      </button>
      {open && (
        <ul role="listbox" aria-label="Select field" className={clsx(POP, "left-0 right-auto w-72")}>
          {fields.map((f) => (
            <li key={f.id} role="option" aria-selected={f.id === field.id}>
              <button type="button" onClick={() => { setFieldId(f.id); setOpen(false); }}
                className={clsx("flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-white/5", f.id === field.id && "bg-terra/10")}>
                <span className="mt-1.5"><StatusDot tone={f.id === field.id ? "good" : "neutral"} /></span>
                <span>
                  <span className="block text-[13px] font-medium text-silver">{f.name}</span>
                  <span className="block text-[11px] text-muted">{f.location} · {f.areaHa} ha</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SyncStatus() {
  const status = getConnectionStatus();
  const { open, setOpen, ref } = usePopover();
  const demo = status.mode === "demo";
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className={clsx("flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium",
          demo ? "border-amber/30 text-amber" : "border-terra/30 text-terra-soft")}>
        <Database size={14} aria-hidden />
        <span className="hidden md:inline">{status.label}</span>
      </button>
      {open && (
        <div className={clsx(POP, "w-72 p-3.5")}>
          <div className="text-[13px] font-medium text-silver">{status.label}</div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{status.detail}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">Record ends {longDate("2026-11-14")}. Every value carries a tag saying whether it is a measurement, a satellite estimate, a model output or a simulation.</p>
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
      <button type="button" onClick={() => setOpen(!open)} aria-label={`Notifications, ${pending.length} open`} aria-expanded={open}
        className="relative rounded-md border border-line p-2 text-muted hover:border-line-strong hover:text-silver">
        <Bell size={16} aria-hidden />
        {pending.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-terra px-1 text-[10px] font-bold text-forest-deep">{pending.length}</span>
        )}
      </button>
      {open && (
        <div className={clsx(POP, "w-80")}>
          <div className="px-2.5 py-2 font-display text-[10px] font-semibold tracking-[0.18em] text-muted">OPEN DISCOVERIES · {field.name.toUpperCase()}</div>
          {pending.length === 0 && <p className="px-2.5 pb-3 text-xs text-muted">Nothing needs attention right now.</p>}
          {pending.map((d) => (
            <Link key={d.id} href={`/discoveries/${d.id}`} onClick={() => setOpen(false)} className="block rounded-md px-2.5 py-2 hover:bg-white/5">
              <span className="block text-[13px] font-medium text-silver">{d.title}</span>
              <span className="block text-[11px] text-muted">{d.category} · detected {shortDate(d.detectedOn)}</span>
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
        className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-line-strong bg-terra/10 text-terra-soft hover:border-terra/50">
        <User size={16} aria-hidden />
      </button>
      {open && (
        <div className={clsx(POP, "w-60")}>
          <div className="px-2.5 py-2">
            <div className="text-[13px] font-medium text-silver">Demo analyst</div>
            <div className="text-[11px] text-muted">Local session · no account connected</div>
          </div>
          <Link href="/reports" onClick={() => setOpen(false)} className="block rounded-md px-2.5 py-2 text-[13px] text-silver hover:bg-white/5">Field report</Link>
          <button type="button" onClick={() => { resetRotations(); setOpen(false); }} className="block w-full rounded-md px-2.5 py-2 text-left text-[13px] text-silver hover:bg-white/5">
            Reset rotation plans to examples
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="terra-atmosphere min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-forest-deep/70 backdrop-blur lg:block">
        <SidebarBody />
      </aside>

      {drawer && (
        <div className="no-print fixed inset-0 z-[1300] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-line bg-forest-deep">
            <button type="button" aria-label="Close navigation" onClick={() => setDrawer(false)} className="absolute right-3 top-4 rounded p-1.5 text-muted hover:text-silver">
              <X size={18} />
            </button>
            <SidebarBody onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-[1100] flex h-16 items-center gap-3 border-b border-line bg-forest/85 px-4 backdrop-blur sm:px-6">
          <button type="button" aria-label="Open navigation" onClick={() => setDrawer(true)} className="rounded-md border border-line p-2 text-silver lg:hidden">
            <Menu size={17} />
          </button>
          <div className="lg:hidden"><Logo compact /></div>
          <div className="hidden min-w-0 sm:block lg:ml-0"><FieldSelector /></div>
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            <Notifications />
            <Profile />
          </div>
        </header>
        <div className="no-print border-b border-line px-4 py-2 sm:hidden"><FieldSelector /></div>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
