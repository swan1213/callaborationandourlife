"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Calendar, CalendarDays, ChevronLeft, ChevronRight, Clock, CornerDownRight, List, Play, Search, SearchX, SquareKanban } from "lucide-react";
import {
  CallerAvatar,
  LockBadge,
  ProfileTag,
  profileColor,
  StepBar,
  calendarTime,
  callerColor,
  deadlineLabel,
  fmtDay,
  fmtDayTime,
  fmtTime,
  InterviewStatus,
  reportDue,
  type Interview,
} from "./interviews";
import { EmptyState, useClientPaging } from "./ui";
import { PresenceDot } from "./Presence";
import { tzDayKey } from "@/lib/viewerTz";

/* ------------------------------------------------------------ view switch */

export type ViewMode = "calendar" | "week" | "board" | "list";
const VIEW_LABEL: Record<ViewMode, string> = { calendar: "Month", week: "Week", board: "Board", list: "List" };
const VIEW_KEY = "tb-interview-view";

/** A value remembered per page in this browser (view mode, board grouping). */
function useRemembered<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const [v, setV] = useState<T>(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key) as T | null;
      if (saved && allowed.includes(saved)) setV(saved);
    } catch {
      /* storage unavailable */
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {
      /* ignore */
    }
  };
  return [v, set] as const;
}

export function useViewMode(page: string, fallback: ViewMode = "calendar") {
  return useRemembered<ViewMode>(`${VIEW_KEY}:${page}`, ["calendar", "week", "board", "list"], fallback);
}

const ICONS: Record<ViewMode, React.ReactNode> = {
  calendar: <Calendar aria-hidden />,
  week: <CalendarDays aria-hidden />,
  board: <SquareKanban aria-hidden />,
  list: <List aria-hidden />,
};

export function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="segmented max-w-full overflow-x-auto" role="tablist" aria-label="View">
      {(["calendar", "week", "board", "list"] as const).map((v) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}>
          {ICONS[v]}
          {VIEW_LABEL[v]}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ status columns */

export type ColumnKey = "pending" | "open" | "scheduled" | "report" | "completed" | "cancelled";
export const columnOf = (i: Interview): ColumnKey => (i.status === "scheduled" ? (reportDue(i) ? "report" : "scheduled") : i.status);

const byDeadline = (a: Interview, b: Interview) => +new Date(a.scheduleBy) - +new Date(b.scheduleBy);
const byTime = (a: Interview, b: Interview) => +calendarTime(a) - +calendarTime(b);
/** `accent` is the colour of the small status dot in the column header. */
export const STATUS_COLUMNS: { key: ColumnKey; title: string; accent: string; sort: (a: Interview, b: Interview) => number }[] = [
  { key: "pending", title: "Waiting for caller", accent: "bg-amber-500", sort: byDeadline },
  { key: "open", title: "Open to all callers", accent: "bg-indigo-500", sort: byDeadline },
  { key: "scheduled", title: "Scheduled", accent: "bg-emerald-500", sort: byTime },
  { key: "report", title: "Report due", accent: "bg-orange-500", sort: byTime },
  { key: "completed", title: "Completed", accent: "bg-slate-400", sort: (a, b) => byTime(b, a) },
  { key: "cancelled", title: "Cancelled", accent: "bg-rose-400", sort: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt) },
];

/* ------------------------------------------------------------ board */

/** Where a card was dropped: a status column or a calendar day ("YYYY-MM-DD", local). */
/** `day` is "YYYY-MM-DD" in the viewer's time zone. */
export type DropTarget = { kind: "status"; key: ColumnKey } | { kind: "day"; day: string } | { kind: "unscheduled" };

type Col = { id: string; title: React.ReactNode; label: string; accent: string; items: Interview[]; target: DropTarget; today?: boolean };
const PER_COLUMN = 40;
// Board days are "YYYY-MM-DD" keys in the viewer's time zone (default GMT-04:00, or the zone picked on the page).
const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekdayOf = (key: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${key}T12:00:00Z`).getUTCDay()];

/**
 * Trello-style board. Grouped by date (default: one column per day, plus "Needs scheduling") or by status.
 * Cards can be dragged where the move is a real action; the page decides via `canDrop` and opens the dialog in `onDrop`.
 */
export function BoardView({
  page,
  items,
  onOpen,
  canDrop,
  onDrop,
  hint,
}: {
  page: string;
  items: Interview[];
  onOpen: (i: Interview) => void;
  canDrop: (i: Interview, to: DropTarget) => boolean;
  onDrop: (i: Interview, to: DropTarget) => void;
  hint?: string;
}) {
  const [group, setGroup] = useRemembered<"date" | "status">(`tb-interview-board:${page}`, ["date", "status"], "date");
  const [start, setStart] = useState(() => tzDayKey(new Date()));
  const [dragging, setDragging] = useState<Interview | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const columns: Col[] = useMemo(() => {
    if (group === "status") {
      return STATUS_COLUMNS.map((c) => ({
        id: c.key,
        title: c.title,
        label: c.title,
        accent: c.accent,
        items: items.filter((i) => columnOf(i) === c.key).sort(c.sort),
        target: { kind: "status", key: c.key } as DropTarget,
      }));
    }
    const active = items.filter((i) => i.status !== "cancelled");
    const days = Array.from({ length: 7 }, (_, k) => addDays(start, k));
    const today = tzDayKey(new Date());
    return [
      {
        id: "unscheduled",
        title: "Needs scheduling",
        label: "Needs scheduling",
        accent: "bg-amber-500",
        items: active.filter((i) => i.status === "pending" || i.status === "open").sort(byDeadline),
        target: { kind: "unscheduled" } as DropTarget,
      },
      ...days.map((d) => ({
        id: d,
        label: d,
        title: (
          <span className="flex items-baseline gap-1.5">
            <span className="tabular-nums">{d}</span>
            <span className={`text-xs font-normal ${d === today ? "text-indigo-600" : "text-slate-500"}`}>{d === today ? "Today" : weekdayOf(d)}</span>
          </span>
        ),
        accent: d === today ? "bg-indigo-500" : d < today ? "bg-slate-300" : "bg-emerald-500",
        today: d === today,
        items: active.filter((i) => (i.status === "scheduled" || i.status === "completed") && i.scheduledAt && tzDayKey(i.scheduledAt) === d).sort(byTime),
        target: { kind: "day", day: d } as DropTarget,
      })),
    ];
  }, [group, items, start]);

  const outside =
    group === "date"
      ? items.filter((i) => (i.status === "scheduled" || i.status === "completed") && i.scheduledAt && (tzDayKey(i.scheduledAt) < start || tzDayKey(i.scheduledAt) >= addDays(start, 7)))
      : [];
  const earlier = outside.filter((i) => tzDayKey(i.scheduledAt!) < start).length;
  const later = outside.length - earlier;
  const sameColumn = (i: Interview, c: Col) => c.items.some((x) => x._id === i._id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="segmented" role="group" aria-label="Group board">
          {(["date", "status"] as const).map((g) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>
              {g === "date" ? "By date" : "By status"}
            </button>
          ))}
        </div>
        {group === "date" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="btn btn-secondary btn-sm" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
              <ChevronLeft />
              {earlier ? <span className="text-slate-500 tabular-nums">{earlier}</span> : null}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setStart(tzDayKey(new Date()))}>
              Today
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">
              {later ? <span className="text-slate-500 tabular-nums">{later}</span> : null}
              <ChevronRight />
            </button>
            <span className="ml-1.5 text-[13px] font-medium whitespace-nowrap text-slate-700 tabular-nums">
              {start} – {addDays(start, 6)}
            </span>
          </div>
        )}
        {hint && <p className="text-xs text-slate-500 sm:ml-auto">{hint}</p>}
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:snap-none sm:px-0">
        {columns.map((c) => {
          const droppable = !!dragging && !sameColumn(dragging, c) && canDrop(dragging, c.target);
          const shown = expanded.has(c.id) ? c.items : c.items.slice(0, PER_COLUMN);
          return (
            <section
              key={c.id}
              aria-label={c.label}
              onDragOver={(e) => {
                if (!droppable) return;
                e.preventDefault();
                setOver(c.id);
              }}
              onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && droppable) onDrop(dragging, c.target);
                setDragging(null);
                setOver(null);
              }}
              className={`flex w-[16rem] max-w-[85vw] shrink-0 snap-start flex-col rounded-xl border transition sm:w-auto sm:max-w-none sm:min-w-60 sm:flex-1 sm:shrink ${c.today ? "bg-indigo-50/40" : "bg-slate-50"} ${
                droppable
                  ? over === c.id
                    ? "border-indigo-400 ring-2 ring-indigo-500/20"
                    : "border-dashed border-indigo-300"
                  : `${c.today ? "border-indigo-200" : "border-slate-200"} ${dragging ? "opacity-60" : ""}`
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                <h3 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-slate-900">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${c.accent}`} />
                  <span className="truncate">{c.title}</span>
                </h3>
                <span className="rounded-md border border-slate-200 bg-white px-1.5 text-xs font-medium text-slate-500 tabular-nums">{c.items.length}</span>
              </div>
              <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {shown.map((i) => (
                  <Card
                    key={i._id}
                    i={i}
                    showDate={group === "status" || c.id === "unscheduled"}
                    onOpen={() => onOpen(i)}
                    draggable={columns.some((t) => !sameColumn(i, t) && canDrop(i, t.target))}
                    onDragStart={() => setDragging(i)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}
                {!c.items.length && (
                  <div className={`rounded-lg border border-dashed p-4 text-center text-xs ${droppable ? "border-indigo-300 text-indigo-600" : "border-slate-200 text-slate-400"}`}>
                    {droppable ? "Drop here" : "Nothing"}
                  </div>
                )}
                {c.items.length > shown.length && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((s) => new Set(s).add(c.id))}>
                    Show {c.items.length - shown.length} more
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Card({
  i,
  showDate,
  onOpen,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  i: Interview;
  showDate: boolean;
  onOpen: () => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const dl = i.status === "pending" || i.status === "open" ? deadlineLabel(i.scheduleBy) : null;
  const t = calendarTime(i);
  const booked = i.status === "scheduled" || i.status === "completed";
  return (
    <article
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", i._id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      tabIndex={0}
      className={`rounded-lg border border-l-[3px] border-slate-200 ${profileColor(i.profile?._id).border} bg-white p-3 text-sm shadow-xs transition hover:border-slate-300 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${i.status === "cancelled" ? "opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`flex min-w-0 flex-wrap items-center gap-1.5 text-xs tabular-nums ${booked ? "font-semibold text-slate-900" : "text-slate-500"}`}>
          <Clock className="size-3.5 text-slate-400" aria-hidden />
          {showDate && `${fmtDay(t)}, `}
          {fmtTime(t)}
          <span className="font-normal text-slate-400">
            {!booked && " (requested)"} · {i.durationMinutes}m
          </span>
        </span>
        {i.lockedCaller && <LockBadge />}
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate font-medium text-slate-900">{i.company}</div>
        {i.jobTitle && <div className="truncate text-xs text-slate-500">{i.jobTitle}</div>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StepBar step={i.step} />
        <ProfileTag i={i} />
      </div>
      <div className="mt-2.5 flex min-w-0 items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
          <CallerAvatar caller={i.status === "open" ? null : i.caller} size={18} />
          <span className="truncate">{i.status === "open" ? <span className="text-indigo-700">Any caller</span> : (i.caller?.name ?? "—")}</span>
        </span>
        <span className="truncate text-slate-400">by {i.requestedBy?.name}</span>
      </div>
      {(reportDue(i) || i.status === "completed") && (
        <div className="mt-2">
          <InterviewStatus i={i} />
        </div>
      )}
      {dl && (
        <div
          className={`mt-2 inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${dl.late ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}`}
        >
          {dl.text}
        </div>
      )}
      {i.status === "open" && i.transfers.length > 0 && (
        <div className="mt-2 flex items-center gap-1 truncate text-[11px] text-slate-500" title={i.transfers[i.transfers.length - 1].reason}>
          <CornerDownRight className="size-3 shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">
            {i.transfers[i.transfers.length - 1].fromName}: {i.transfers[i.transfers.length - 1].reason}
          </span>
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------ list */

type SortKey = "when" | "step" | "status" | "caller" | "profile" | "company" | "bidder";
const STATUS_ORDER: Record<ColumnKey, number> = { pending: 0, open: 1, report: 2, scheduled: 3, completed: 4, cancelled: 5 };

/** Searchable, sortable table of every interview in scope. */
export function ListView({ items, onOpen, initialStatus = "" }: { items: Interview[]; onOpen: (i: Interview) => void; initialStatus?: "" | ColumnKey }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | ColumnKey>(initialStatus);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "when", dir: 1 });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const val = (i: Interview): string | number => {
      switch (sort.key) {
        case "when":
          return calendarTime(i).getTime();
        case "step":
          return i.step ?? 1;
        case "status":
          return STATUS_ORDER[columnOf(i)];
        case "caller":
          return (i.caller?.name ?? "").toLowerCase();
        case "profile":
          return (i.profile?.label ?? i.profileLabel).toLowerCase();
        case "company":
          return i.company.toLowerCase();
        case "bidder":
          return (i.requestedBy?.name ?? "").toLowerCase();
      }
    };
    return items
      .filter((i) => !status || columnOf(i) === status)
      .filter((i) => !needle || [i.company, i.jobTitle, i.profile?.label, i.profileLabel, i.caller?.name, i.requestedBy?.name].some((s) => (s ?? "").toLowerCase().includes(needle)))
      .sort((a, b) => {
        const [x, y] = [val(a), val(b)];
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [items, q, status, sort]);
  const { pageRows, pager } = useClientPaging(rows, "interviews-list");

  const th = (key: SortKey, label: string) => {
    const active = sort.key === key;
    const Icon = sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          className={`inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-slate-900 ${active ? "text-slate-900" : ""}`}
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
        >
          {label}
          {active && <Icon className="size-3" aria-hidden />}
        </button>
      </th>
    );
  };

  return (
    <div>
      <div className="card overflow-hidden p-0">
        <div className="card-header">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="input pl-9" aria-label="Search interviews" placeholder="Search company, role, profile, people" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input w-full sm:w-auto sm:min-w-44" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as "" | ColumnKey)}>
              <option value="">All statuses</option>
              {STATUS_COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {rows.length} interview{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        {!rows.length ? (
          <EmptyState icon={SearchX} title="No interviews match." description="Try a different search or status." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table" data-list="interviews">
              <thead>
                <tr>
                  {th("when", "When")}
                  {th("step", "Step")}
                  {th("status", "Status")}
                  {th("caller", "Caller")}
                  {th("profile", "Profile")}
                  {th("company", "Company")}
                  {th("bidder", "Bidder")}
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((i) => {
                  const dl = i.status === "pending" || i.status === "open" ? deadlineLabel(i.scheduleBy) : null;
                  return (
                    <tr key={i._id} className="cursor-pointer" onClick={() => onOpen(i)}>
                      <td className="whitespace-nowrap">
                        <div className="font-medium text-slate-900 tabular-nums">{fmtDayTime(calendarTime(i))}</div>
                        <div className="text-xs text-slate-500 tabular-nums">
                          {i.durationMinutes} min{i.status !== "scheduled" && i.status !== "completed" && " · requested"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <StepBar step={i.step} />
                        {i.lockedCaller && (
                          <div className="mt-1">
                            <LockBadge />
                          </div>
                        )}
                      </td>
                      <td>
                        <InterviewStatus i={i} />
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <span className={`size-2.5 rounded-full ${i.caller ? callerColor(i.caller._id) : "border border-slate-400"}`} />
                          {i.status === "open" ? <span className="text-indigo-700">Any caller</span> : (i.caller?.name ?? "—")}
                          {i.status !== "open" && i.caller && <PresenceDot userId={i.caller._id} />}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        <ProfileTag i={i} />
                      </td>
                      <td className="min-w-[12rem]">
                        <div className="font-medium text-slate-900">{i.company}</div>
                        <div className="text-xs text-slate-500">{i.jobTitle}</div>
                      </td>
                      <td className="whitespace-nowrap text-slate-600">{i.requestedBy?.name}</td>
                      <td className="text-xs whitespace-nowrap">
                        {dl ? (
                          <span className={dl.late ? "font-medium text-rose-600" : "text-amber-700"}>{dl.text}</span>
                        ) : i.status === "completed" && i.report?.recordingUrl ? (
                          <a
                            href={i.report.recordingUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="link inline-flex items-center gap-1"
                          >
                            <Play className="size-3" aria-hidden />
                            Recording
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!!rows.length && pager}
    </div>
  );
}
