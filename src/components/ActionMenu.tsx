"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import type { IconType } from "./ui";

export type ActionItem = { label: string; icon: IconType; onSelect: () => void; danger?: boolean; disabled?: boolean } | "divider";

const WIDTH = 192;

/**
 * "⋯" button that opens a small menu of row actions. Rendered at <body> with fixed positioning, so a table's
 * scrolling container can't clip it; opens upwards when there is no room below.
 */
export function ActionMenu({ items, label = "More actions", children }: { items: ActionItem[]; label?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const h = menu.current?.offsetHeight ?? 0;
    const below = r.bottom + 4 + h <= window.innerHeight - 8;
    setPos({ top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - h), left: Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {children ?? <Ellipsis />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            className="popover fixed z-50 animate-pop-in p-1"
            style={{ width: WIDTH, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, i) =>
              item === "divider" ? (
                <div key={i} className="divider my-1" />
              ) : (
                <button
                  key={item.label}
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={`flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-[13px] disabled:cursor-default disabled:opacity-50 ${
                    item.danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <item.icon className={`size-4 ${item.danger ? "" : "text-slate-400"}`} />
                  {item.label}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}
