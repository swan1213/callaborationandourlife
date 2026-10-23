"use client";

import { useEffect, useState } from "react";

import { THEME_STORAGE_KEY as KEY } from "@/lib/theme";
import { applyTheme, readThemePref, type ThemePref } from "./ThemeKeeper";

const Icon = {
  light: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
};

/** Light / Dark / System segmented control. The choice persists per browser; ThemeKeeper applies it on every page. */
export default function ThemeToggle({ className = "", compact = false }: { className?: string; /** Icons only (narrow spots such as the account menu). */ compact?: boolean }) {
  // null until the saved choice is read: applying a default first flashed the wrong theme.
  const [pref, setPref] = useState<ThemePref | null>(null);

  useEffect(() => setPref(readThemePref()), []);

  const choose = (p: ThemePref) => {
    setPref(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* storage unavailable */
    }
    applyTheme(p);
  };

  return (
    <div role="radiogroup" aria-label="Color theme" className={`segmented ${className}`}>
      {(["light", "dark", "system"] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={pref === p}
          title={p === "system" ? "Match system" : `${p[0].toUpperCase()}${p.slice(1)} theme`}
          aria-label={compact ? (p === "system" ? "System theme" : `${p} theme`) : undefined}
          onClick={() => choose(p)}
          className={compact ? "!px-2" : "!text-xs"}
        >
          {Icon[p]}
          {!compact && <span className="capitalize">{p}</span>}
        </button>
      ))}
    </div>
  );
}
