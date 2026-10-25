"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

/** `group` puts the option under a heading (options of one group should be next to each other); `disabled` shows it greyed out, not pickable. */
export type SearchOption = { value: string; label: string; hint?: string; group?: string; disabled?: boolean };

/** Lists longer than this get the find box (unless `searchable` says otherwise). */
const SEARCH_FROM = 8;

/**
 * The app's dropdown: click to open, arrows + Enter to pick, Esc to close. Long lists get a find box (every word typed
 * must appear in the option's label or hint). The list is drawn over the page (fixed, in a portal) so tables, cards
 * and modals with overflow never cut it off, and opens upwards when there is no room below.
 */
export default function SearchSelect({
  id,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  searchPlaceholder = "Type to find…",
  emptyText = "No matches",
  emptyOption,
  disabled,
  required,
  searchable,
  size,
  className = "",
  "aria-label": ariaLabel,
  title,
}: {
  id?: string;
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Optional "none" choice shown first (value ""). */
  emptyOption?: string;
  disabled?: boolean;
  required?: boolean;
  /** Show the find box; by default only lists longer than 8 options get one. */
  searchable?: boolean;
  /** "sm": compact control (toolbars, Rows per page). */
  size?: "sm";
  /** Classes for the wrapper, e.g. a width ("w-40", "w-auto"). Full width by default. */
  className?: string;
  "aria-label"?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = value === "" && emptyOption ? { value: "", label: emptyOption } : options.find((o) => o.value === value);
  const withSearch = searchable ?? options.length + (emptyOption ? 1 : 0) > SEARCH_FROM;

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = options.filter((o) => words.every((w) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(w)));
    return emptyOption && !words.length ? [{ value: "", label: emptyOption } as SearchOption, ...hits] : hits;
  }, [q, options, emptyOption]);

  // Where the list goes: under the control, or above it when there is more room there.
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 240 && above > below;
    const width = Math.max(r.width, size === "sm" ? 96 : 224);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos(up ? { left, width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(360, above) } : { left, width, top: r.bottom + 6, maxHeight: Math.min(360, below) });
  }, [size]);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    // The list is portaled to <body>, so clicks inside it are not inside `box`.
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  // Start each opening on the current choice, with an empty find box.
  useEffect(() => {
    if (open) setActive(Math.max(0, filtered.findIndex((o) => o.value === value)));
    else setQ("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (q) setActive(0);
  }, [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (o: SearchOption) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    btn.current?.focus();
  };

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    } else if (e.key === "Escape" || e.key === "Tab") {
      // Close the list only, not the surrounding modal.
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
      setOpen(false);
    }
  }

  const sm = size === "sm";
  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        ref={btn}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={withSearch ? undefined : onKey}
        className={`input flex w-full cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${sm ? "py-1 pr-1.5 pl-2 text-xs" : ""}`}
      >
        <span className={`min-w-0 truncate ${selected ? "" : "text-slate-400"}`}>
          {selected ? (
            <>
              {selected.label}
              {selected.hint && <span className="text-slate-500"> · {selected.hint}</span>}
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className={`${sm ? "size-3.5" : "size-4"} shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {/* Lets the browser's required-field check cover this control. */}
      {required && <input tabIndex={-1} aria-hidden required value={value} onChange={() => {}} className="pointer-events-none absolute inset-0 opacity-0" />}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            className="popover fixed z-[60] flex animate-pop-in flex-col overflow-hidden"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          >
            {withSearch && (
              <div className="relative shrink-0 border-b border-slate-200 p-1.5">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  autoFocus
                  className="input border-transparent pl-8 shadow-none hover:border-transparent focus:border-transparent focus:ring-0"
                  placeholder={searchPlaceholder}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKey}
                  role="combobox"
                  aria-controls={listId}
                  aria-expanded
                  aria-label="Find"
                />
              </div>
            )}
            <ul ref={list} id={listId} role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto p-1">
              {filtered.map((o, i) => (
                <li key={o.value || "__none"} role="presentation">
                  {o.group && o.group !== filtered[i - 1]?.group && (
                    <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-slate-400">{o.group}</div>
                  )}
                  <div
                    data-i={i}
                    role="option"
                    aria-selected={o.value === value}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(o);
                    }}
                    className={`flex items-center gap-2 rounded-md ${o.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${sm ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm"} text-slate-700 ${i === active ? "bg-slate-100 text-slate-900" : ""} ${o.value === value ? "font-medium text-slate-900" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && <span className="block truncate text-xs font-normal text-slate-500">{o.hint}</span>}
                    </span>
                    {o.value === value && <Check className={`${sm ? "size-3.5" : "size-4"} shrink-0 text-indigo-600`} aria-hidden />}
                  </div>
                </li>
              ))}
              {!filtered.length && <li className="px-2.5 py-6 text-center text-[13px] text-slate-500">{emptyText}</li>}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
