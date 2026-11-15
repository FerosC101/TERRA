"use client";

import { Info } from "lucide-react";
import { useId, useRef } from "react";

/**
 * Explanations live behind a small "i" instead of in the page. Opens on hover,
 * focus, click or tap. Uses the native popover top layer, so it is never clipped
 * by a scrolling table or card.
 */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const hoverOpened = useRef(false);

  const place = () => {
    const b = button.current?.getBoundingClientRect();
    const p = pop.current;
    if (!b || !p) return;
    const width = Math.min(300, window.innerWidth - 24);
    p.style.width = `${width}px`;
    const left = Math.min(Math.max(12, b.left + b.width / 2 - width / 2), window.innerWidth - width - 12);
    const below = b.bottom + 8;
    const height = p.offsetHeight;
    p.style.left = `${left}px`;
    p.style.top = `${below + height > window.innerHeight - 8 ? Math.max(8, b.top - height - 8) : below}px`;
  };
  const show = () => {
    const p = pop.current;
    if (!p || p.matches(":popover-open")) return;
    hoverOpened.current = true;
    p.showPopover();
  };
  const hide = () => {
    if (hoverOpened.current) pop.current?.hidePopover();
    hoverOpened.current = false;
  };

  return (
    <>
      <button ref={button} type="button" popoverTarget={id} aria-label={`About ${label}`}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={() => { hoverOpened.current = false; }}
        className={`no-print inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-faint hover:bg-sunken hover:text-ink ${className ?? ""}`}>
        <Info size={14} aria-hidden />
      </button>
      {/* A span, so the tip can sit inside a paragraph or heading without breaking the HTML */}
      <span ref={pop} id={id} popover="auto" role="tooltip" onToggle={(e) => { if (e.newState === "open") place(); }}
        className="fixed m-0 rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-left text-[13px] font-normal leading-relaxed text-ink-soft shadow-pop">
        {children}
      </span>
    </>
  );
}
