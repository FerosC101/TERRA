"use client";

import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, Clock, Lightbulb, Route, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { TOUR } from "./tourSteps";

/**
 * Guided tour of the platform. Started from the Tour button in the header (and offered once
 * to first-time visitors). It walks page by page: dims the screen, spotlights one element
 * (marked with `data-tour`), and explains it in a card with Back / Next. The page stays
 * usable underneath, so people can try what the step describes.
 */

const DONE_KEY = "terra-tour-done";
const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

type Ctx = { start: () => void; active: boolean };
const TourContext = createContext<Ctx>({ start: () => {}, active: false });
export const useTour = () => useContext(TourContext);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const go = useCallback((i: number) => {
    const step = TOUR[i];
    setIndex(i);
    if (window.location.pathname !== step.page) router.push(step.page);
  }, [router]);

  const start = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    go(0);
  }, [go]);

  const close = useCallback((finished: boolean) => {
    setIndex(null);
    write(DONE_KEY, finished ? "finished" : "skipped");
    requestAnimationFrame(() => returnFocus.current?.focus?.());
  }, []);

  return (
    <TourContext.Provider value={{ start, active: index !== null }}>
      {children}
      {index !== null && (
        <TourOverlay key="tour" index={index} pathname={pathname}
          onBack={() => go(Math.max(0, index - 1))}
          onNext={() => (index === TOUR.length - 1 ? close(true) : go(index + 1))}
          onClose={() => close(false)} />
      )}
      {index === null && <TourOffer onStart={start} />}
    </TourContext.Provider>
  );
}

/** The header button that starts the tour. */
export function TourButton() {
  const { start, active } = useTour();
  return (
    <button type="button" onClick={start} aria-pressed={active} title="Take a guided tour"
      className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-soft hover:bg-sunken hover:text-ink aria-pressed:bg-green-soft aria-pressed:text-green-strong">
      <Route size={16} aria-hidden /> <span className="hidden sm:inline">Tour</span>
      <span className="sr-only sm:hidden">Take the tour</span>
    </button>
  );
}

/* ------------------------------------------------------------------ overlay */

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const CARD_W = 360;

/** The overlay only mounts after a click, so it can read the browser directly. */
function useReducedMotion() {
  const [reduce, setReduce] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

function TourOverlay({ index, pathname, onBack, onNext, onClose }: { index: number; pathname: string; onBack: () => void; onNext: () => void; onClose: () => void }) {
  const step = TOUR[index];
  const reduce = useReducedMotion();
  const card = useRef<HTMLDivElement>(null);
  const stepKey = `${index}|${pathname}`;
  // Latest spotlight position, and which step it belongs to. It keeps the previous target
  // while the next page opens, so the spotlight glides from one to the next.
  const [found, setFound] = useState<{ key: string; rect: Rect | null; ready: boolean }>({ key: "", rect: null, ready: false });
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [cardH, setCardH] = useState(240);

  const onPage = pathname === step.page;
  const ready = onPage && (!step.target || (found.key === stepKey && found.ready));
  const rect = onPage && !step.target ? null : found.key === stepKey ? found.rect : ready ? null : found.rect;

  // Find the step's element once its page is showing; scroll it into view and follow it.
  useEffect(() => {
    if (!onPage || !step.target) return;

    let el: Element | null = null;
    let frame = 0;
    let last = "";
    const started = performance.now();
    const visible = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };

    const track = () => {
      frame = requestAnimationFrame(track);
      if (!el || !el.isConnected) {
        el = document.querySelector(`[data-tour="${step.target}"]`);
        if (el && visible(el)) {
          // One scroll: centre the target, or for a tall one, bring its top just under the header
          const r = el.getBoundingClientRect();
          const tall = r.height > window.innerHeight * 0.6;
          const offset = tall ? 88 : Math.max(88, (window.innerHeight - r.height) / 2);
          window.scrollTo({ top: Math.max(0, window.scrollY + r.top - offset), behavior: reduce ? "auto" : "smooth" });
        } else {
          el = null;
          // Not on screen (for example hidden at phone width): show the card in the middle
          if (performance.now() - started > 6000) { setFound({ key: stepKey, rect: null, ready: true }); cancelAnimationFrame(frame); }
          return;
        }
      }
      const r = el.getBoundingClientRect();
      const key = `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (key !== last) { last = key; setFound({ key: stepKey, rect: { top: r.top, left: r.left, width: r.width, height: r.height }, ready: true }); }
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [onPage, stepKey, step.target, reduce]);

  useEffect(() => {
    const size = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, []);

  // Keep the card's height for placement
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, index]);

  // Move focus to the card so screen readers announce the step and Enter presses Next
  useEffect(() => {
    if (ready) card.current?.focus({ preventScroll: true });
  }, [ready, index]);

  // Keyboard: Esc leaves, arrows move (unless typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName))) return;
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onNext(); }
      else if (e.key === "ArrowLeft" && index > 0) { e.preventDefault(); onBack(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onBack, onNext, onClose]);

  // Spotlight geometry: the target padded and kept on screen; no target = a point in the middle
  const hole = rect
    ? (() => {
        // Keep the hole inside the screen, even while the target is still scrolling into view
        const top = Math.min(view.h - 6, Math.max(6, rect.top - PAD)), left = Math.min(view.w - 6, Math.max(6, rect.left - PAD));
        const bottom = Math.max(top, Math.min(view.h - 6, rect.top + rect.height + PAD)), right = Math.max(left, Math.min(view.w - 6, rect.left + rect.width + PAD));
        return { top, left, width: right - left, height: bottom - top };
      })()
    : { top: view.h / 2, left: view.w / 2, width: 0, height: 0 };

  // Card placement: beside the spotlight where it fits; a bottom sheet on phones; centred without a target
  const phone = view.w < 640;
  const w = Math.min(CARD_W, view.w - 24);
  let pos: React.CSSProperties;
  if (!rect) pos = { top: Math.max(16, view.h / 2 - cardH / 2), left: view.w / 2 - Math.min(420, view.w - 24) / 2, width: Math.min(420, view.w - 24) };
  else if (phone) pos = { left: 12, right: 12, bottom: 12 };
  else {
    const gap = 14, clampX = (x: number) => Math.min(view.w - w - 12, Math.max(12, x)), clampY = (y: number) => Math.min(view.h - cardH - 12, Math.max(12, y));
    const below = hole.top + hole.height + gap, above = hole.top - gap - cardH;
    const rightX = hole.left + hole.width + gap, leftX = hole.left - gap - w;
    if (below + cardH <= view.h - 12) pos = { top: below, left: clampX(hole.left + hole.width / 2 - w / 2), width: w };
    else if (above >= 12) pos = { top: above, left: clampX(hole.left + hole.width / 2 - w / 2), width: w };
    else if (rightX + w <= view.w - 12) pos = { top: clampY(hole.top + hole.height / 2 - cardH / 2), left: rightX, width: w };
    else if (leftX >= 12) pos = { top: clampY(hole.top + hole.height / 2 - cardH / 2), left: leftX, width: w };
    else pos = { top: view.h - cardH - 16, left: clampX(view.w / 2 - w / 2), width: w };
    pos.top = clampY(pos.top as number); // never off screen
  }

  const first = index === 0, last = index === TOUR.length - 1;
  const move = reduce ? "none" : "top 420ms cubic-bezier(0.22,1,0.36,1), left 420ms cubic-bezier(0.22,1,0.36,1), width 420ms cubic-bezier(0.22,1,0.36,1), height 420ms cubic-bezier(0.22,1,0.36,1)";

  return (
    <div className="no-print fixed inset-0 z-[1400]" style={{ pointerEvents: "none" }}>
      {/* Dimmed screen with a hole over the target */}
      <div aria-hidden className={clsx("absolute rounded-2xl", rect && !reduce && "terra-tour-ring")}
        style={{ ...hole, transition: move, boxShadow: "0 0 0 200vmax rgba(14, 33, 23, 0.55)", outline: rect ? "2px solid rgba(75, 206, 77, 0.95)" : "none", outlineOffset: 0 }} />

      {ready && (
        <div ref={card} key={index} role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-body" tabIndex={-1}
          className={clsx("terra-tour-card absolute rounded-2xl border border-line bg-surface p-5 text-ink shadow-pop outline-none", rect && phone && "rounded-b-2xl")}
          style={{ ...pos, pointerEvents: "auto", transition: reduce ? "none" : "top 320ms ease, left 320ms ease" }}>
          {/* progress */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <div className="h-full rounded-full bg-green transition-[width] duration-500" style={{ width: `${((index + 1) / TOUR.length) * 100}%` }} />
            </div>
            <span className="tabular text-xs text-muted">{index + 1} of {TOUR.length}</span>
            <button type="button" onClick={onClose} aria-label="Close the tour" className="-mr-1.5 rounded-md p-1 text-muted hover:bg-sunken hover:text-ink"><X size={16} /></button>
          </div>

          {first && (
            <div className="mb-3 flex items-center gap-3">
              <LogoMark size={30} />
              <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 text-xs font-medium text-green-strong"><Clock size={12} aria-hidden /> About 2 minutes</span>
            </div>
          )}
          <h2 id="tour-title" className={clsx("font-semibold tracking-tight", first || last ? "text-xl" : "text-[17px]")}>{step.title}</h2>
          <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
          {step.tip && (
            <p className="mt-3 flex gap-2 rounded-lg bg-canvas px-3 py-2 text-[13px] leading-snug text-ink-soft">
              <Lightbulb size={15} className="mt-0.5 shrink-0 text-amber" aria-hidden />{step.tip}
            </p>
          )}
          {step.target && !rect && (
            <p className="mt-3 text-xs text-muted">This part is not shown at this screen size.</p>
          )}

          <div className="mt-5 flex items-center gap-2">
            {first ? (
              <button type="button" onClick={onClose} className="text-[13px] font-medium text-muted hover:text-ink">Not now</button>
            ) : !last && (
              <button type="button" onClick={onClose} className="text-[13px] font-medium text-muted hover:text-ink">Skip tour</button>
            )}
            <span className="ml-auto" />
            {!first && (
              <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-line-strong">
                <ArrowLeft size={15} aria-hidden /> Back
              </button>
            )}
            <button type="button" onClick={onNext} className="inline-flex items-center gap-1.5 rounded-lg bg-green px-3.5 py-1.5 text-sm font-medium text-white hover:bg-green-strong">
              {first ? "Start the tour" : last ? <>Finish <Check size={15} aria-hidden /></> : <>Next <ArrowRight size={15} aria-hidden /></>}
            </button>
          </div>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{ready ? `Step ${index + 1} of ${TOUR.length}: ${step.title}` : "Opening the next page"}</p>
    </div>
  );
}

/* -------------------------------------------------------------------- offer */

/** A one-time prompt for first-time visitors. */
function TourOffer({ onStart }: { onStart: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (read(DONE_KEY)) return;
    const t = window.setTimeout(() => setShow(true), 1200);
    return () => window.clearTimeout(t);
  }, []);
  if (!show) return null;
  const dismiss = () => { setShow(false); write(DONE_KEY, "dismissed"); };
  return (
    <div role="complementary" aria-label="Guided tour" className="terra-tour-card no-print fixed bottom-4 right-4 z-[1350] w-[calc(100vw-2rem)] max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-pop">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-soft text-green"><Route size={17} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">New to TERRA?</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">Take a two-minute guided tour of the platform.</p>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={() => { setShow(false); onStart(); }} className="rounded-lg bg-green px-3 py-1.5 text-[13px] font-medium text-white hover:bg-green-strong">Start the tour</button>
            <button type="button" onClick={dismiss} className="text-[13px] font-medium text-muted hover:text-ink">Maybe later</button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="-mr-1 -mt-1 rounded-md p-1 text-muted hover:bg-sunken hover:text-ink"><X size={15} /></button>
      </div>
    </div>
  );
}
