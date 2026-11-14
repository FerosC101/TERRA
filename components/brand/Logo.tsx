/**
 * TERRA mark: a growing plant held inside an orbital trajectory.
 * The orbit passes behind the stem and in front of the leaves' base, with a
 * small satellite on the path — Earth observation wrapped around regeneration.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} role="img" aria-label="TERRA logo">
      {/* far side of the orbit */}
      <path d="M6.2 30.6C3.4 26.4 9 19.3 18.9 14.6c9.9-4.7 20.3-5 23.1-.8" stroke="#39D353" strokeOpacity="0.38" strokeWidth="1.6" strokeLinecap="round" transform="rotate(-8 24 24)" />
      {/* stem */}
      <path d="M24 42V21" stroke="#39D353" strokeWidth="2.2" strokeLinecap="round" />
      {/* leaves */}
      <path d="M24 27c-7.2.4-11.6-3.4-12.4-9.6 6.6-.6 11.5 2.6 12.4 9.6Z" fill="#39D353" />
      <path d="M24 21.5c.3-7 4.3-11.3 11-12.3.6 6.9-3.2 11.6-11 12.3Z" fill="#7EE787" />
      {/* near side of the orbit */}
      <path d="M42 13.8c2.8 4.2-2.8 11.3-12.7 16-9.9 4.700-20.300 5-23.100.8" stroke="#39D353" strokeWidth="1.8" strokeLinecap="round" transform="rotate(-8 24 24)" />
      {/* satellite */}
      <circle cx="40.6" cy="20.4" r="2.3" fill="#D9D9D9" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={compact ? 28 : 34} />
      <div className="leading-none">
        <div className="font-display text-[17px] font-bold tracking-[0.28em] text-silver">TERRA</div>
        {!compact && (
          <div className="mt-1.5 text-[8.5px] font-medium tracking-[0.22em] text-muted">DISCOVER. PREDICT. REGENERATE.</div>
        )}
      </div>
    </div>
  );
}
