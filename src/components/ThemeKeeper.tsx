"use client";

import { useLayoutEffect } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

export type ThemePref = "light" | "dark" | "system";

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const wantsDark = (pref: ThemePref) => pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

/** Sets <html class="dark"> for the saved (or given) choice. Only touches the class when it is wrong. */
export function applyTheme(pref: ThemePref = readThemePref()) {
  const root = document.documentElement;
  const dark = wantsDark(pref);
  if (root.classList.contains("dark") !== dark) root.classList.toggle("dark", dark);
}

/**
 * Keeps the theme on every page. React 19 owns <html> and rewrites its attributes when it renders it again
 * (e.g. when hydration falls back to a client render), which drops the "dark" class the theme script in
 * layout.tsx set before paint: the page turned light after a refresh. This puts it back whenever that
 * happens, and follows the system theme live while "System" is chosen.
 */
export default function ThemeKeeper() {
  useLayoutEffect(() => {
    applyTheme();
    const observer = new MutationObserver(() => applyTheme());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => applyTheme();
    mq.addEventListener("change", onSystemChange);
    // Another tab changed the theme.
    const onStorage = (e: StorageEvent) => e.key === THEME_STORAGE_KEY && applyTheme();
    window.addEventListener("storage", onStorage);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
