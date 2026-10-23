"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { tzParts } from "@/lib/viewerTz";

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A real calendar day in "YYYY-MM-DD" form? */
export function isDayKey(v: string) {
  const m = RE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const todayKey = () => {
  const t = tzParts(new Date());
  return `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
};

/** Typing helper: keep digits and put the dashes in ("20251231" → "2025-12-31"). */
function autoFormat(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join("-");
}

/**
 * Date field that always shows and accepts YYYY-MM-DD (native date inputs follow the browser's locale),
 * with a calendar picker. `value` / `onChange` use "YYYY-MM-DD" or "" (empty).
 */
export default function DateInput({
  value,
  onChange,
  id,
  className = "",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [view, setView] = useState(() => {
    const k = isDayKey(value) ? value : todayKey();
    return { y: +k.slice(0, 4), m: +k.slice(5, 7) };
  });

  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const commit = (v: string) => {
    if (v === "") {
      setInvalid(false);
      if (value !== "") onChange("");
      return;
    }
    if (isDayKey(v)) {
      setInvalid(false);
      if (v !== value) onChange(v);
    } else setInvalid(true);
  };

  // The popover is position: fixed so cards / tables with overflow can't cut it off.
  const place = useCallback(() => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const width = 272;
    const height = 320;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight && r.top - height - 6 > 8 ? r.top - height - 6 : below;
    setPos({ top, left });
  }, []);
  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  const openPicker = () => {
    const k = isDayKey(value) ? value : todayKey();
    setView({ y: +k.slice(0, 4), m: +k.slice(5, 7) });
    setOpen((o) => !o);
  };
  const shift = (n: number) =>
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m - 1 + n, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    });
  const lead = new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay();
  const days = Array.from({ length: 42 }, (_, k) => new Date(Date.UTC(view.y, view.m - 1, 1 - lead + k)).toISOString().slice(0, 10));
  const today = todayKey();
  const pick = (k: string) => {
    onChange(k);
    setDraft(k);
    setInvalid(false);
    setOpen(false);
  };

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <input
        id={id}
        className={`input pr-9 font-mono tabular-nums ${invalid ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
        placeholder="YYYY-MM-DD"
        inputMode="numeric"
        maxLength={10}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title={invalid ? "Enter a date as YYYY-MM-DD" : "YYYY-MM-DD"}
        value={draft}
        onChange={(e) => {
          const v = autoFormat(e.target.value);
          setDraft(v);
          if (v === "" || isDayKey(v)) commit(v);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
        }}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Choose a date"
        aria-expanded={open}
        className={`absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md transition-colors hover:bg-slate-100 hover:text-slate-900 ${open ? "bg-slate-100 text-slate-900" : "text-slate-400"}`}
      >
        <Calendar className="size-4" aria-hidden />
      </button>
      {open && pos && (
        <div className="popover fixed z-[70] max-h-[calc(100vh-1rem)] animate-pop-in overflow-y-auto p-3" style={{ top: pos.top, left: pos.left, width: 272 }} role="dialog" aria-label="Choose a date">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft />
            </button>
            <div className="text-sm font-semibold text-slate-900 tabular-nums">
              {view.y}-{String(view.m).padStart(2, "0")} <span className="font-normal text-slate-500">{MONTHS[view.m - 1]}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((k) => {
              const inMonth = +k.slice(5, 7) === view.m;
              const selected = k === value;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => pick(k)}
                  aria-label={k}
                  aria-pressed={selected}
                  className={`h-8 cursor-pointer rounded-md text-[13px] tabular-nums transition-colors ${
                    selected
                      ? "bg-indigo-600 font-medium text-white"
                      : k === today
                        ? "bg-indigo-50 font-semibold text-indigo-700 hover:bg-indigo-100"
                        : inMonth
                          ? "text-slate-700 hover:bg-slate-100"
                          : "text-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {+k.slice(8)}
                </button>
              );
            })}
          </div>
          <div className="-mx-3 mt-3 -mb-3 flex justify-between rounded-b-xl border-t border-slate-200 bg-page px-2 py-1.5">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => pick(today)}>
              Today
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm text-slate-500"
              onClick={() => {
                onChange("");
                setDraft("");
                setOpen(false);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
