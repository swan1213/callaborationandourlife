"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";

export type ColumnDef = { key: string; label: string; /** Hidden until the viewer turns it on. */ hiddenByDefault?: boolean };

const STORAGE_KEY = "tb-columns";

/**
 * Show/hide columns for a table, remembered per table in this browser.
 * Returns `show(key)` for rendering and a `picker` button to place above the table.
 */
export function useColumns(table: string, columns: ColumnDef[]) {
  const defaults = () => new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.key));
  const [hidden, setHidden] = useState<Set<string>>(defaults);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:${table}`);
      if (raw) setHidden(new Set((JSON.parse(raw) as string[]).filter((k) => columns.some((c) => c.key === k))));
    } catch {
      /* storage unavailable: keep defaults */
    }
  }, [table]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next: Set<string>) => {
    setHidden(next);
    try {
      localStorage.setItem(`${STORAGE_KEY}:${table}`, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const show = (key: string) => !hidden.has(key);
  const visibleCount = columns.filter((c) => show(c.key)).length;
  const picker = (
    <ColumnPicker
      columns={columns}
      hidden={hidden}
      onToggle={(key) => {
        const next = new Set(hidden);
        if (next.has(key)) next.delete(key);
        else if (visibleCount > 1) next.add(key); // keep at least one column
        save(next);
      }}
      onShowAll={() => save(new Set())}
      onReset={() => save(defaults())}
    />
  );
  // Cells carry data-col="key" inside a table with data-table={table}; hidden columns are removed with CSS,
  // so pages only tag their <th>/<td> instead of restructuring their rows.
  const style = (
    <style>{[...hidden].map((k) => `[data-table="${table}"] [data-col="${k}"]{display:none}`).join("\n")}</style>
  );
  return { show, picker, style };
}

function ColumnPicker({
  columns,
  hidden,
  onToggle,
  onShowAll,
  onReset,
}: {
  columns: ColumnDef[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = columns.length - columns.filter((c) => hidden.has(c.key)).length;
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" className="btn btn-secondary btn-sm" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Columns3 />
        Columns
        <span className="text-slate-400 tabular-nums">
          {shown}/{columns.length}
        </span>
      </button>
      {open && (
        <div className="popover absolute right-0 z-30 mt-1.5 w-60 max-w-[calc(100vw-2rem)] origin-top-right animate-pop-in overflow-hidden" role="menu">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
            <span className="text-xs font-medium text-slate-500">Show columns</span>
            <span className="flex gap-0.5">
              <button type="button" className="btn btn-ghost btn-sm h-6 px-2" onClick={onShowAll}>
                All
              </button>
              <button type="button" className="btn btn-ghost btn-sm h-6 px-2" onClick={onReset}>
                Reset
              </button>
            </span>
          </div>
          <div className="max-h-[min(20rem,60vh)] overflow-y-auto overscroll-contain p-1">
            {columns.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900">
                <input type="checkbox" className="size-4 rounded" checked={!hidden.has(c.key)} onChange={() => onToggle(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
