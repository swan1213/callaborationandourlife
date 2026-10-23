/** Brand mark: a tailored document with a tick, on an ink tile that flips with the theme. */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-lg bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] shadow-xs ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
        <path d="M14 3v4a1 1 0 0 0 1 1h4v4" />
        <path d="M9 9h2M9 13h5" />
        <path d="m14.5 18 2 2 4-4.5" />
      </svg>
    </span>
  );
}

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold tracking-tight text-slate-900">TailorBid</span>
    </span>
  );
}
