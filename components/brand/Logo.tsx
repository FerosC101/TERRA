/**
 * TERRA mark: a growing plant held inside an orbital path, with a small
 * satellite on it. Earth observation wrapped around the field.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} role="img" aria-label="TERRA logo">
      <path d="M6.2 30.6C3.4 26.4 9 19.3 18.9 14.6c9.9-4.7 20.3-5 23.1-.8" stroke="#37864A" strokeOpacity="0.35" strokeWidth="1.8" strokeLinecap="round" transform="rotate(-8 24 24)" />
      <path d="M24 42V21" stroke="#37864A" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M24 27c-7.2.4-11.6-3.4-12.4-9.6 6.600-.6 11.500 2.600 12.400 9.600Z" fill="#37864A" />
      <path d="M24 21.5c.3-7 4.3-11.3 11-12.3.6 6.900-3.200 11.600-11 12.300Z" fill="#6BAF7A" />
      <path d="M42 13.8c2.8 4.2-2.8 11.3-12.700 16-9.900 4.700-20.300 5-23.100.8" stroke="#37864A" strokeWidth="2" strokeLinecap="round" transform="rotate(-8 24 24)" />
      <circle cx="40.6" cy="20.4" r="2.4" fill="#183B2A" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-[0.14em] text-ink">TERRA</span>
    </span>
  );
}
