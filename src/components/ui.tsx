"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Info, X } from "lucide-react";
import { fromTzInput, fromWallTime, tzParts } from "@/lib/viewerTz";
import DateInput from "./DateInput";

/* ------------------------------------------------------------ fetch helper */

export class ApiError extends Error {
  constructor(public status: number, message: string, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data);
  return data as T;
}

/** Downloads a file endpoint, surfacing JSON errors instead of saving them. */
export async function downloadFile(url: string, fallbackName: string, json?: unknown) {
  const res = await fetch(url, json === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Download failed (${res.status})`);
  }
  const cd = res.headers.get("Content-Disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  const name = (star && decodeURIComponent(star)) || /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * Row onClick that toggles the row's selection, except on links, buttons, inputs and other controls inside it,
 * clicks from portals (menus, dialogs) and when the click ends a text selection.
 */
export function selectOnRowClick(onToggle: () => void) {
  return (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target)) return;
    if (target.closest("a, button, input, select, textarea, label, summary, [role='button'], [role='menuitem'], [contenteditable='true']")) return;
    if (window.getSelection()?.toString()) return;
    onToggle();
  };
}

/* ------------------------------------------------------------- formatting */

const p2 = (n: number) => String(n).padStart(2, "0");
/** "2025-12-31" (YYYY-MM-DD, the app's standard date format) in the viewer's time zone (default GMT-04:00). */
export const fmtDate = (d?: string | Date | null) => {
  if (!d) return "—";
  const x = tzParts(d);
  return `${x.y}-${p2(x.m)}-${p2(x.d)}`;
};
/** "2025-12-31 14:05" in the viewer's time zone. */
export const fmtDateTime = (d?: string | Date | null) => {
  if (!d) return "—";
  const x = tzParts(d);
  return `${x.y}-${p2(x.m)}-${p2(x.d)} ${p2(x.h)}:${p2(x.min)}`;
};
/** Short label for why an application is "not generated" (from its generationError). */
export function notGeneratedReason(reason?: string) {
  if (reason?.startsWith("Resume generation failed")) return "AI step failed";
  if (reason?.startsWith("Generation did not finish")) return "Timed out";
  return "Job description not readable";
}

/** "YYYY-MM-DD HH:MM:SS" in the viewer's time zone. */
export const fmtStamp = (d?: string | Date | null) => {
  if (!d) return "—";
  const x = tzParts(d);
  return `${x.y}-${p2(x.m)}-${p2(x.d)} ${p2(x.h)}:${p2(x.min)}:${p2(x.s)}`;
};
export const money = (n?: number) => `$${(n ?? 0).toFixed(2)}`;

/** Date inputs ("YYYY-MM-DD", days in the viewer's time zone) → ISO range boundaries for the API. */
export function rangeParams(from: string, to: string) {
  const p = new URLSearchParams();
  if (from) p.set("from", fromTzInput(from).toISOString());
  if (to) {
    const [y, m, d] = to.split("-").map(Number);
    p.set("to", new Date(fromWallTime(y, m, d + 1).getTime() - 1).toISOString());
  }
  return p;
}

/** "YYYY-MM-DD" for today (± days) in the viewer's time zone. */
export function localDay(offsetDays = 0) {
  const t = tzParts(new Date());
  const d = new Date(Date.UTC(t.y, t.m - 1, t.d + offsetDays));
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------- components */

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Tone per status value: text + soft background; the dot inherits the text color. */
const badgeColors: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  submitted: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  scheduled: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  not_generated: "bg-amber-50 text-amber-700 ring-amber-600/20",
  generated: "bg-sky-50 text-sky-700 ring-sky-600/20",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
  deleted: "bg-rose-50 text-rose-700 ring-rose-600/20",
  admin: "bg-violet-50 text-violet-700 ring-violet-600/20",
  open: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  caller: "bg-teal-50 text-teal-700 ring-teal-600/20",
  suspended: "bg-slate-100 text-slate-600 ring-slate-500/20",
  inactive: "bg-slate-100 text-slate-600 ring-slate-500/20",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-500/20",
  user: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export function Badge({ value, label, dot = true }: { value: string; label?: string; dot?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap capitalize ring-1 ring-inset ${badgeColors[value] ?? "bg-slate-100 text-slate-600 ring-slate-500/20"}`}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />}
      {label ?? (value === "not_generated" ? "not-generated" : value.replace(/_/g, " "))}
    </span>
  );
}

export type IconType = ComponentType<{ className?: string }>;

export function Stat({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: IconType }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-medium text-slate-500">{label}</div>
        {Icon && <Icon className="size-4 text-slate-400" />}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Small link above the title, e.g. { href: "/admin/users", label: "All users" }. */
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900">
          <ArrowLeft className="size-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A titled card: header row (title, description, actions) above a padded body. */
export function Section({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "card-body",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Pass "" for flush content such as a table or a list with its own padding. */
  bodyClassName?: string;
}) {
  return (
    <section className={`card p-0 ${className}`}>
      <div className="card-header">
        <div className="min-w-0">
          <h2 className="card-title">{title}</h2>
          {description && <p className="card-description">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Centered placeholder for an empty list or table. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: IconType;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      {Icon && (
        <div className="mb-3 grid size-10 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
          <Icon className="size-5" />
        </div>
      )}
      <div className="text-sm font-medium text-slate-900">{title}</div>
      {description && <div className="mt-1 max-w-sm text-[13px] text-slate-500">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Segmented control for switching views or filters. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
  label,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`segmented ${className}`}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="text-xs text-slate-400 tabular-nums">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

const ALERT_ICON = { error: AlertTriangle, success: CheckCircle2, info: Info };

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const c = {
    error: "border-rose-200 bg-rose-50 text-rose-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  }[kind];
  const Icon = ALERT_ICON[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`flex animate-fade-in items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${c}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Rendered at <body> so no transformed/overflowing ancestor can clip or offset it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px] sm:p-10" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`popover w-full animate-pop-in ${wide ? "max-w-4xl" : "max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <button className="btn btn-ghost btn-sm btn-icon -mr-1.5" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const presets: [string, () => [string, string]][] = [
    ["Today", () => [localDay(), localDay()]],
    ["7 days", () => [localDay(-6), localDay()]],
    ["30 days", () => [localDay(-29), localDay()]],
    [
      "This month",
      () => [`${localDay().slice(0, 7)}-01`, localDay()],
    ],
    ["All", () => ["", ""]],
  ];
  return (
    <div className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap">
      <div className="min-w-0">
        <label className="label">From</label>
        <DateInput aria-label="From date" className="w-full sm:w-40" value={from} onChange={(v) => onChange(v, to)} />
      </div>
      <div className="min-w-0">
        <label className="label">To</label>
        <DateInput aria-label="To date" className="w-full sm:w-40" value={to} onChange={(v) => onChange(from, v)} />
      </div>
      <div className="col-span-2 flex flex-wrap gap-1">
        {presets.map(([label, fn]) => (
          <button key={label} type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(...fn())}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- skeletons */

/** A shimmering placeholder block; size it with className (e.g. "h-4 w-32"). */
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

const SK_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5", "w-3/5"];

/** A few lines of text. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? "w-2/5" : SK_WIDTHS[i % SK_WIDTHS.length]}`} />
      ))}
    </div>
  );
}

/** Table placeholder (header + rows), for inside a `card p-0` table container. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-slate-200">
      <div className="flex gap-6 bg-slate-50 px-5 py-3">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className={`h-3 ${c === 0 ? "w-32" : "w-20"}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-5 py-4" style={{ opacity: 1 - r * (0.5 / rows) }}>
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className={c === 0 ? "w-40 shrink-0 space-y-2" : "flex-1"}>
              <Skeleton className={`h-3.5 ${c === 0 ? "w-36" : SK_WIDTHS[(r + c) % SK_WIDTHS.length]}`} />
              {c === 0 && <Skeleton className="h-3 w-24" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A card with a title and a few lines. */
export function CardSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`card ${className}`}>
      <Skeleton className="mb-4 h-4 w-40" />
      <SkeletonText lines={lines} />
    </div>
  );
}

/** A row of stat tiles. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Whole-page placeholder: header, optional stats, then a table, cards or form sections. */
export function PageSkeleton({ stats = false, variant = "table" }: { stats?: boolean; variant?: "table" | "cards" | "form" }) {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-7xl animate-fade-in">
      <div className="mb-6 space-y-2.5">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {stats && (
        <div className="mb-6">
          <StatsSkeleton />
        </div>
      )}
      {variant === "table" && (
        <div className="card overflow-hidden p-0">
          <TableSkeleton />
        </div>
      )}
      {variant === "cards" && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}
      {variant === "form" && (
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card grid gap-5 md:grid-cols-2">
              <Skeleton className="h-4 w-32 md:col-span-2" />
              {Array.from({ length: 4 }, (_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- pagination */

export type PageSize = 25 | 50 | 100 | "all";
export const PAGE_SIZES: PageSize[] = [25, 50, 100, "all"];
const PAGE_SIZE_KEY = "tb-page-size";

/** Rows-per-page preference, remembered per table (falls back to the last size used anywhere). */
export function usePageSize(table: string, fallback: PageSize = 25) {
  const [size, setSize] = useState<PageSize>(fallback);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${PAGE_SIZE_KEY}:${table}`) ?? localStorage.getItem(PAGE_SIZE_KEY);
      const parsed = raw === "all" ? "all" : Number(raw);
      if (PAGE_SIZES.includes(parsed as PageSize)) setSize(parsed as PageSize);
    } catch {
      /* storage unavailable */
    }
  }, [table]);
  const update = (s: PageSize) => {
    setSize(s);
    try {
      localStorage.setItem(`${PAGE_SIZE_KEY}:${table}`, String(s));
      localStorage.setItem(PAGE_SIZE_KEY, String(s));
    } catch {
      /* storage unavailable */
    }
  };
  return [size, update] as const;
}

/** Query-string value for server-side paging ("all" → no limit). */
export const limitParam = (size: PageSize) => String(size);

/** Page numbers with ellipses: 1 … 4 5 [6] 7 8 … 20 */
function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

/** Table footer: "Showing 1–25 of 312", rows-per-page (25 / 50 / 100 / All) and page buttons. */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: PageSize;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (s: PageSize) => void;
}) {
  const per = pageSize === "all" ? Math.max(total, 1) : pageSize;
  const pages = Math.max(1, Math.ceil(total / per));
  const current = Math.min(page, pages);
  const first = total ? (current - 1) * per + 1 : 0;
  const last = Math.min(current * per, total);
  const nav = "btn btn-ghost btn-sm min-w-7 px-1.5 tabular-nums";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-[13px] text-slate-500">
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {total ? (
            <>
              Showing <b className="font-medium text-slate-700">{first.toLocaleString()}</b>–<b className="font-medium text-slate-700">{last.toLocaleString()}</b> of{" "}
              <b className="font-medium text-slate-700">{total.toLocaleString()}</b>
            </>
          ) : (
            "No rows"
          )}
        </span>
        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">Rows per page</span>
          <select
            className="input w-auto py-1 pr-7 pl-2 text-xs"
            value={String(pageSize)}
            onChange={(e) => {
              onPageSize((e.target.value === "all" ? "all" : Number(e.target.value)) as PageSize);
              onPage(1);
            }}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((s) => (
              <option key={String(s)} value={String(s)}>
                {s === "all" ? "All" : s}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pages > 1 && (
        <nav className="flex items-center gap-0.5" aria-label="Pagination">
          <button className={nav} disabled={current <= 1} onClick={() => onPage(1)} aria-label="First page" title="First page">
            <ChevronsLeft />
          </button>
          <button className={nav} disabled={current <= 1} onClick={() => onPage(current - 1)} aria-label="Previous page" title="Previous page">
            <ChevronLeft />
          </button>
          {pageList(current, pages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === current ? "page" : undefined}
                className={p === current ? "btn btn-sm btn-primary min-w-7 px-1.5 tabular-nums" : nav}
              >
                {p}
              </button>
            )
          )}
          <button className={nav} disabled={current >= pages} onClick={() => onPage(current + 1)} aria-label="Next page" title="Next page">
            <ChevronRight />
          </button>
          <button className={nav} disabled={current >= pages} onClick={() => onPage(pages)} aria-label="Last page" title="Last page">
            <ChevronsRight />
          </button>
        </nav>
      )}
    </div>
  );
}

/** Client-side paging for tables whose rows are already loaded. */
export function useClientPaging<T>(rows: T[], table: string) {
  const [pageSize, setPageSize] = usePageSize(table);
  const [page, setPage] = useState(1);
  const per = pageSize === "all" ? Math.max(rows.length, 1) : pageSize;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  // Stay in range when filters shrink the list.
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const current = Math.min(page, pages);
  const pageRows = pageSize === "all" ? rows : rows.slice((current - 1) * per, current * per);
  const pager = <Pagination page={current} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={setPageSize} />;
  return { pageRows, pager, setPage };
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && (setData(d), setError("")))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}
