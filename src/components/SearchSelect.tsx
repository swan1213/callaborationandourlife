"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export type SearchOption = { value: string; label: string; hint?: string };

/**
 * A select with a find box: click to open, type to filter, arrows + Enter to pick, Esc to close.
 * Every word typed must appear in the option's label or hint.
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
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = options.filter((o) => words.every((w) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(w)));
    return emptyOption && !words.length ? [{ value: "", label: emptyOption }, ...hits] : hits;
  }, [q, options, emptyOption]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => setActive(0), [q, open]);
  // Start each opening with an empty find box.
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (o: SearchOption) => {
    onChange(o.value);
    setOpen(false);
  };

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    } else if (e.key === "Escape") {
      // Close the list only, not the surrounding modal.
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="input flex cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
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
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {/* Lets the browser's required-field check cover this control. */}
      {required && <input tabIndex={-1} aria-hidden required value={value} onChange={() => {}} className="pointer-events-none absolute inset-0 opacity-0" />}
      {open && (
        <div className="popover absolute z-20 mt-1.5 w-full animate-pop-in overflow-hidden sm:min-w-56">
          <div className="relative border-b border-slate-200 p-1.5">
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
          <ul ref={list} id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {filtered.map((o, i) => (
              <li
                key={o.value || "__none"}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-slate-700 ${i === active ? "bg-slate-100 text-slate-900" : ""} ${o.value === value ? "font-medium text-slate-900" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs font-normal text-slate-500">{o.hint}</span>}
                </span>
                {o.value === value && <Check className="size-4 shrink-0 text-indigo-600" aria-hidden />}
              </li>
            ))}
            {!filtered.length && <li className="px-2.5 py-6 text-center text-[13px] text-slate-500">{emptyText}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
