"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AssignDialog,
  CallerAvatar,
  CancelDialog,
  DeleteDialog,
  FeedbackDialog,
  InterviewCalendar,
  InterviewDetail,
  InterviewNotes,
  InterviewStatus,
  noticeParts,
  ProfileTag,
  profileColor,
  registerProfiles,
  ReportDialog,
  ScheduleDialog,
  StepBar,
  reportDue,
  TransferDialog,
  calendarRange,
  calendarTime,
  monthTitle,
  deadlineLabel,
  fmtDay,
  fmtRequested,
  fmtTime,
  useTick,
  type Interview,
} from "./interviews";
import { CalendarDays, CalendarX, CircleCheck, ClipboardCheck, Clock, Eye, Filter, Flag, Globe, Hourglass, Sparkles, UserPlus } from "lucide-react";
import { Alert, api, EmptyState, Modal, Spinner, useAsync, type IconType } from "./ui";
import { useToast } from "./Alerts";
import { PresenceDot } from "./Presence";
import { DEFAULT_TZ, getHomeTz, getInterviewTz, setViewerTz, timeZoneChoices, tzDayKey } from "@/lib/viewerTz";
import SearchSelect from "./SearchSelect";
import ScheduleInterviewForm from "./ScheduleInterviewForm";
import InterviewAssistant, { canUseAssistant } from "./InterviewAssistant";
import { BoardView, ListView, ViewSwitch, columnOf, useViewMode, type ColumnKey, type DropTarget } from "./InterviewViews";

type Options = {
  profiles: { id: string; label: string }[];
  callers: { id: string; name: string; email: string }[];
};

/**
 * Calendar + agenda of interviews.
 * - caller: their accepted interviews ("Mine"), or everything on their assigned profiles.
 * - staff (admin / user): every interview in scope, filterable by profile and caller, plus requests that still need a caller.
 */
export default function InterviewBoard({
  as,
  reloadSignal = 0,
  onAddDay,
}: {
  as: "caller" | "staff";
  reloadSignal?: number;
  /** "+" on calendar days: schedule an interview on that day. */
  onAddDay?: (day: string) => void;
}) {
  useTick();
  const sp = useSearchParams();
  const [month, setMonth] = useState(() => new Date());
  const [scope, setScope] = useState<"mine" | "profiles">("mine");
  const [profile, setProfile] = useState("");
  const [caller, setCaller] = useState("");
  const [showUnscheduled, setShowUnscheduled] = useState(as === "staff");
  // Admins: show deleted interviews too ("show") or only them ("only").
  const [deleted, setDeleted] = useState<"" | "show" | "only">("");
  const [me, setMe] = useState("");
  const [myRole, setMyRole] = useState("");
  const [view, setView] = useState<Interview | null>(null);
  const [dialog, setDialog] = useState<null | {
    kind: "accept" | "reschedule" | "transfer" | "assign" | "cancel" | "report" | "edit" | "delete" | "feedback" | "assistant";
    i: Interview;
    day?: string;
  }>(null);
  const [mode, setMode] = useViewMode(as === "caller" ? "caller-schedule" : "admin-interviews");
  const toast = useToast();
  const [listStatus, setListStatus] = useState<"" | ColumnKey>("");
  // Time zone the page shows times in: opens in your own zone from My Page (default GMT-04:00).
  // Back to your usual zone when you leave the page.
  const [tz, setTz] = useState(DEFAULT_TZ);
  const zones = useMemo(() => {
    const list = timeZoneChoices();
    const mine = getInterviewTz();
    return list.map((z) => (z.value === mine && !z.label.includes("Default") ? { ...z, label: `${z.label} · your time zone` } : z));
  }, []);
  const changeTz = (z: string) => {
    setViewerTz(z);
    setTz(z);
  };
  useEffect(() => {
    changeTz(getInterviewTz());
    return () => setViewerTz(getHomeTz());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api<{ user: { id: string; role: string } }>("/api/me")
      .then((r) => {
        setMe(r.user.id);
        setMyRole(r.user.role);
      })
      .catch(() => {});
  }, []);
  const options = useAsync(() => (as === "staff" ? api<Options>("/api/interviews/options") : Promise.resolve(null)), [as]);

  const range = calendarRange(month);
  const list = useAsync(() => {
    const p = new URLSearchParams(range);
    if (as === "caller" && scope === "mine") p.set("view", "mine");
    if (profile) p.set("profile", profile);
    if (caller) p.set("caller", caller);
    p.set("status", (showUnscheduled ? "scheduled,completed,pending,open" : "scheduled,completed") + (deleted ? ",cancelled" : ""));
    if (deleted) p.set("deleted", deleted === "only" ? "only" : "include");
    return api<{ items: Interview[] }>(`/api/interviews?${p}`);
  }, [range.from, scope, profile, caller, showUnscheduled, deleted]);

  // Board / list: every request in scope (all statuses, any date).
  // Staff always load it too, for the totals overview.
  const all = useAsync(() => {
    if ((mode === "calendar" || mode === "week") && as !== "staff") return Promise.resolve(null);
    const p = new URLSearchParams();
    if (as === "caller" && scope === "mine") p.set("view", "mine");
    if (profile) p.set("profile", profile);
    if (caller) p.set("caller", caller);
    if (deleted) p.set("deleted", deleted === "only" ? "only" : "include");
    return api<{ items: Interview[] }>(`/api/interviews?${p}`);
  }, [mode, scope, profile, caller, deleted]);

  // Unscheduled requests that need a caller (staff), regardless of month.
  const attention = useAsync(
    () =>
      as === "staff"
        ? api<{ items: Interview[] }>(`/api/interviews?status=pending,open${profile ? `&profile=${profile}` : ""}`)
        : Promise.resolve({ items: [] as Interview[] }),
    [as, profile],
  );

  // Deep link: ?id=...
  useEffect(() => {
    const id = sp.get("id");
    if (!id) return;
    api<{ request: Interview }>(`/api/interviews/${id}`)
      .then((r) => {
        setView(r.request);
        setMonth(calendarTime(r.request));
      })
      .catch(() => {});
  }, [sp]);

  // Filtered here too so picking a profile shows at once, before the reload finishes.
  const items = useMemo(() => (list.data?.items ?? []).filter((i) => (i.status !== "cancelled" || (!!deleted && !!i.deletedAt)) && (!profile || i.profile?._id === profile)), [list.data, profile, deleted]);
  const agenda = useMemo(
    () =>
      items
        .filter((i) => {
          const t = calendarTime(i);
          return tzDayKey(t).slice(0, 7) === tzDayKey(month).slice(0, 7);
        })
        .sort((a, b) => calendarTime(a).getTime() - calendarTime(b).getTime()),
    [items, month, tz], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Profiles seen on the calendar (kept while one profile is shown, so the others stay clickable).
  const [knownProfiles, setKnownProfiles] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    const found = new Map<string, string>();
    for (const i of list.data?.items ?? []) if (i.profile?._id) found.set(i.profile._id, i.profile.label);
    for (const p of options.data?.profiles ?? []) found.set(p.id, p.label);
    if (!found.size) return;
    setKnownProfiles((prev) => {
      const m = new Map(prev.map((p) => [p.id, p.label]));
      found.forEach((label, id) => m.set(id, label));
      const next = [...m.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
      registerProfiles(next.map((p) => p.id));
      return next;
    });
  }, [list.data, options.data]);
  const legend = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((i) => i.status === "scheduled" && i.caller && m.set(i.caller._id, i.caller.name));
    return [...m.entries()];
  }, [items]);

  // Staff overview tiles, from every interview in scope (deleted and cancelled ones left out).
  const kpis = useMemo(() => {
    if (as !== "staff" || !all.data) return null;
    const live = all.data.items.filter((i) => !i.deletedAt && i.status !== "cancelled");
    const today = tzDayKey(new Date());
    const now = Date.now();
    const weekEnd = now + 7 * 24 * 3600 * 1000;
    const thisMonth = today.slice(0, 7);
    const completed = live.filter((i) => i.status === "completed" && i.scheduledAt && tzDayKey(i.scheduledAt).slice(0, 7) === thisMonth);
    const decided = completed.filter((i) => i.report?.outcome === "passed" || i.report?.outcome === "failed");
    return {
      today: live.filter((i) => (i.status === "scheduled" || i.status === "completed") && i.scheduledAt && tzDayKey(i.scheduledAt) === today).length,
      week: live.filter((i) => i.status === "scheduled" && i.scheduledAt && +new Date(i.scheduledAt) >= now && +new Date(i.scheduledAt) < weekEnd).length,
      waiting: live.filter((i) => i.status === "pending" || i.status === "open").length,
      late: live.filter((i) => (i.status === "pending" || i.status === "open") && deadlineLabel(i.scheduleBy).late).length,
      report: live.filter(reportDue).length,
      completed: completed.length,
      passRate: decided.length ? Math.round((100 * decided.filter((i) => i.report?.outcome === "passed").length) / decided.length) : null,
    };
  }, [as, all.data, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const openList = (status: "" | ColumnKey) => {
    setListStatus(status);
    setMode("list");
  };
  // Month agenda grouped by day ("Today", "Tomorrow", …).
  const agendaDays = useMemo(() => {
    const groups: { key: string; items: Interview[] }[] = [];
    for (const i of agenda) {
      const k = tzDayKey(calendarTime(i));
      if (groups[groups.length - 1]?.key !== k) groups.push({ key: k, items: [] });
      groups[groups.length - 1].items.push(i);
    }
    return groups;
  }, [agenda, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayLabel = (k: string) => {
    const today = tzDayKey(new Date());
    const shift = (n: number) => tzDayKey(new Date(Date.now() + n * 24 * 3600 * 1000));
    const named = k === today ? "Today" : k === shift(1) ? "Tomorrow" : k === shift(-1) ? "Yesterday" : "";
    const long = new Date(`${k}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
    return named ? `${named} · ${long}` : long;
  };

  const reload = () => {
    list.reload();
    attention.reload();
    all.reload();
  };
  const done = (msg: string) => {
    setDialog(null);
    setView(null);
    toast.success(...noticeParts(msg));
    reload();
  };
  // Parent created an interview (admin "Schedule interview").
  useEffect(() => {
    if (reloadSignal) reload();
  }, [reloadSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  const isMine = (i: Interview) => i.caller?._id === me;

  // Board drag & drop: a move is allowed only when it maps to a real action, which opens its dialog.
  const canAccept = (i: Interview) => i.status === "open" || (i.status === "pending" && isMine(i));
  const canDrop = (i: Interview, to: DropTarget) => {
    const from = columnOf(i);
    const future = (day: string) => day >= tzDayKey(new Date());
    if (as === "caller") {
      if (to.kind === "day") return future(to.day) && (canAccept(i) || (from === "scheduled" && isMine(i)));
      if (to.kind === "status" && to.key === "scheduled") return canAccept(i);
      if (to.kind === "status" && to.key === "open") return isMine(i) && !i.lockedCaller && (from === "pending" || from === "scheduled");
      if (to.kind === "status" && to.key === "completed") return isMine(i) && from === "report";
      return false;
    }
    if (to.kind !== "status") return false;
    if (to.key === "cancelled") return from !== "cancelled" && from !== "completed" && from !== "report";
    if (to.key === "pending") return from === "open" || from === "scheduled" || from === "pending";
    return false;
  };
  // Calendar (month / week) drag: callers as on the board; admins move scheduled interviews.
  const canMove = (i: Interview, day: string) =>
    day >= tzDayKey(new Date()) && (as === "caller" ? canDrop(i, { kind: "day", day }) : myRole === "admin" && i.status === "scheduled");
  const onMove = (i: Interview, day: string) => setDialog({ kind: as === "caller" && canAccept(i) ? "accept" : "reschedule", i, day });
  // Admins bring a deleted interview back.
  const [restoring, setRestoring] = useState(false);
  const restore = async (i: Interview) => {
    setRestoring(true);
    try {
      const r = await api<{ status: string }>(`/api/interviews/${i._id}`, { method: "PATCH", json: { action: "restore" } });
      done(`Restored: ${i.company} · ${i.profile?.label ?? i.profileLabel} (${r.status}).`);
    } catch (e) {
      toast.error("Couldn't restore the interview", (e as Error).message);
    } finally {
      setRestoring(false);
    }
  };

  // Admins change a scheduled interview's time right on the calendar (click its time).
  const canEditTime = (i: Interview) => as === "staff" && myRole === "admin" && i.status === "scheduled" && !i.deletedAt;
  const onEditTime = async (i: Interview, at: Date) => {
    await api(`/api/interviews/${i._id}`, { method: "PATCH", json: { action: "reschedule", scheduledAt: at.toISOString() } });
    toast.success(`${i.company}: time changed to ${fmtDay(at)} ${fmtTime(at)}`, "The caller and everyone responsible were emailed.");
    reload();
  };
  const onDrop = (i: Interview, to: DropTarget) => {
    if (to.kind === "day") return setDialog({ kind: canAccept(i) ? "accept" : "reschedule", i, day: to.day });
    if (to.kind !== "status") return;
    const kind = ({ scheduled: "accept", open: "transfer", cancelled: "cancel", pending: "assign", completed: "report" } as const)[to.key as "scheduled"];
    if (kind) setDialog({ kind, i });
  };

  return (
    <div className="space-y-4">
      {kpis && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Today" value={kpis.today} hint="interviews on the calendar" tone="indigo" icon="calendar" onClick={() => setMode("week")} />
          <Kpi label="Next 7 days" value={kpis.week} hint="scheduled and upcoming" tone="sky" icon="clock" onClick={() => openList("scheduled")} />
          <Kpi
            label="Waiting for caller"
            value={kpis.waiting}
            hint={kpis.late ? `${kpis.late} past the deadline` : "need a caller assigned"}
            tone={kpis.late ? "rose" : "amber"}
            icon="user"
            onClick={() => openList("pending")}
          />
          <Kpi label="Report due" value={kpis.report} hint="held, result not reported" tone="orange" icon="flag" onClick={() => openList("report")} />
          <Kpi
            label="Completed this month"
            value={kpis.completed}
            hint={kpis.passRate === null ? "no results reported yet" : `${kpis.passRate}% passed`}
            tone="emerald"
            icon="check"
            onClick={() => openList("completed")}
          />
        </div>
      )}

      <div className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <ViewSwitch value={mode} onChange={setMode} />
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            {(mode === "calendar" || mode === "week" ? list.loading : all.loading) && <Spinner className="h-4 w-4 text-slate-400" />}
            <label htmlFor="iv-tz" className="flex items-center text-slate-400" title="Time zone">
              <Globe className="size-4" aria-hidden />
              <span className="sr-only">Time zone</span>
            </label>
            <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
              <SearchSelect id="iv-tz" value={tz} options={zones} onChange={changeTz} searchPlaceholder="Find a time zone, e.g. GMT-05, Chicago…" emptyText="No time zone matches" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-3 sm:px-4">
          <span className="mr-1 flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
            <Filter className="size-3.5 text-slate-400" aria-hidden />
            Filters
          </span>
          {as === "caller" ? (
            <div className="segmented" role="group" aria-label="Scope">
              {(["mine", "profiles"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)}>
                  {s === "mine" ? "My interviews" : "All my profiles"}
                </button>
              ))}
            </div>
          ) : (
            <>
              <select aria-label="Profile" className="input w-full sm:w-auto sm:min-w-44" value={profile} onChange={(e) => setProfile(e.target.value)}>
                <option value="">All profiles</option>
                {options.data?.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select aria-label="Caller" className="input w-full sm:w-auto sm:min-w-40" value={caller} onChange={(e) => setCaller(e.target.value)}>
                <option value="">All callers</option>
                {options.data?.callers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}
          {as === "staff" && myRole === "admin" && (
            <select id="iv-deleted" aria-label="Deleted interviews" className="input w-full sm:w-auto" value={deleted} onChange={(e) => setDeleted(e.target.value as "" | "show" | "only")}>
              <option value="">Hide deleted</option>
              <option value="show">Show deleted too</option>
              <option value="only">Only deleted</option>
            </select>
          )}
          {(profile || caller || deleted) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setProfile("");
                setCaller("");
                setDeleted("");
              }}
            >
              Clear
            </button>
          )}
          {(mode === "calendar" || mode === "week") && (
            <label className="inline-flex cursor-pointer items-center gap-2.5 py-1 text-[13px] text-slate-600 sm:ml-auto" title="Show requests not scheduled yet, at their requested time">
              <span className="relative inline-flex h-5 w-9 shrink-0">
                <input type="checkbox" className="peer sr-only" checked={showUnscheduled} onChange={(e) => setShowUnscheduled(e.target.checked)} />
                <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40" />
                <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow-sm transition-transform peer-checked:translate-x-4" style={{ background: "#fff" }} />
              </span>
              Show unscheduled requests
            </label>
          )}
        </div>
      </div>

      {as === "staff" && mode !== "board" && mode !== "list" && !!attention.data?.items.length && (
        <section className="card overflow-hidden p-0">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
                <Hourglass className="size-3.5" aria-hidden />
              </span>
              <h2 className="card-title">Waiting for a caller</h2>
              <span className="chip tabular-nums">{attention.data.items.length}</span>
            </div>
            <span className="text-xs text-slate-500">Assign a caller before each request&apos;s deadline.</span>
          </div>
          <ul className="divide-y divide-slate-200">
            {attention.data.items.map((i) => {
              const dl = deadlineLabel(i.scheduleBy);
              return (
                <li key={i._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <CallerAvatar caller={i.status === "open" ? null : i.caller} size={32} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{i.company}</span>
                        <ProfileTag i={i} />
                        <StepBar step={i.step} size="xs" />
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {fmtRequested(i)} · {i.status === "open" ? <span className="text-indigo-700">open to all callers</span> : <span className="inline-flex items-center gap-1">waiting for {i.caller?.name}{i.caller && <PresenceDot userId={i.caller._id} />}</span>} · requested by {i.requestedBy?.name}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${dl.late ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}`}
                    >
                      {dl.text}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setView(i)}>
                      Details
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: "assign", i })}>
                      Assign caller
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {mode === "board" &&
        (all.error ? (
          <Alert>{all.error}</Alert>
        ) : (
          <BoardView
            key={tz}
            page={as === "caller" ? "caller" : "staff"}
            items={all.data?.items ?? []}
            onOpen={setView}
            canDrop={canDrop}
            onDrop={onDrop}
            hint={
              as === "caller"
                ? `Drag a card onto a day to schedule or move it.${scope === "mine" ? " Switch to All my profiles to see shared requests." : ""}`
                : "By status: drag a card to Waiting for caller to assign a caller, or to Cancelled to cancel it."
            }
          />
        ))}
      {mode === "list" &&
        (all.error ? <Alert>{all.error}</Alert> : <ListView key={`${listStatus}-${tz}`} initialStatus={listStatus} items={all.data?.items ?? []} onOpen={setView} />)}

      {(mode === "calendar" || mode === "week") && !!knownProfiles.length && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show profile">
          <span className="mr-1 text-[13px] font-medium text-slate-500">Profiles</span>
          <button
            type="button"
            onClick={() => setProfile("")}
            aria-pressed={!profile}
            className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${!profile ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            All
          </button>
          {knownProfiles.map((p) => {
            const c = profileColor(p.id);
            const on = profile === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProfile(on ? "" : p.id)}
                aria-pressed={on}
                title={on ? "Show all profiles" : `Show only ${p.label}`}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${on ? `border-transparent ${c.chip}` : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"} ${profile && !on ? "opacity-50" : ""}`}
              >
                <span className={`size-2 rounded-full ${c.dot}`} />
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      {mode === "week" && (
        <InterviewCalendar
          key={`w-${tz}`}
          span="week"
          month={month}
          onMonth={setMonth}
          items={items}
          onOpen={setView}
          onAddDay={onAddDay}
          canMove={canMove}
          onMove={onMove}
          canEditTime={canEditTime}
          onEditTime={onEditTime}
        />
      )}
      {mode === "calendar" && (
        <>
          <InterviewCalendar
            key={tz}
            month={month}
            onMonth={setMonth}
            items={items}
            onOpen={setView}
            onAddDay={onAddDay}
            canMove={canMove}
            onMove={onMove}
            canEditTime={canEditTime}
            onEditTime={onEditTime}
          />

          {!!legend.length && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-slate-600">
              <span className="text-[13px] font-medium text-slate-500">Callers</span>
              {legend.map(([id, name]) => (
                <span key={id} className="flex items-center gap-1.5">
                  <CallerAvatar caller={{ _id: id, name }} size={18} /> {name}
                </span>
              ))}
              {showUnscheduled && (
                <span className="flex items-center gap-1.5 text-slate-500">
                  <CallerAvatar caller={null} size={18} /> not scheduled yet
                </span>
              )}
            </div>
          )}

          <section className="card overflow-hidden p-0">
            <div className="card-header">
              <div className="flex items-center gap-2.5">
                <CalendarDays className="size-4 text-slate-400" aria-hidden />
                <h2 className="card-title">Agenda · {monthTitle(month)}</h2>
                <span className="chip tabular-nums">{agenda.length}</span>
              </div>
              <span className="text-xs text-slate-500 tabular-nums">
                {agenda.length} interview{agenda.length === 1 ? "" : "s"} this month
              </span>
            </div>
            {list.error ? (
              <div className="p-4">
                <Alert>{list.error}</Alert>
              </div>
            ) : !agenda.length ? (
              <EmptyState icon={CalendarX} title="No interviews this month" description="Use “Schedule interview” or the + on a calendar day to add one." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Step</th>
                      <th>Caller</th>
                      <th>Profile</th>
                      <th>Company</th>
                      <th>Bidder</th>
                      <th>Status</th>
                      <th className="actions">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  {agendaDays.map((g) => (
                    <tbody key={g.key}>
                      <tr className="hover:bg-transparent">
                        <td colSpan={8} className={`border-b border-slate-200 bg-slate-50 py-2 text-xs font-semibold ${g.key === tzDayKey(new Date()) ? "text-indigo-700" : "text-slate-700"}`}>
                          {dayLabel(g.key)}
                          <span className="ml-2 font-normal text-slate-400 tabular-nums">
                            {g.items.length} interview{g.items.length === 1 ? "" : "s"}
                          </span>
                        </td>
                      </tr>
                      {g.items.map((i) => {
                        const booked = i.status === "scheduled" || i.status === "completed";
                        return (
                          <tr key={i._id} className="cursor-pointer" onClick={() => setView(i)}>
                            <td className="whitespace-nowrap">
                              <div className="font-medium text-slate-900 tabular-nums">{fmtTime(calendarTime(i))}</div>
                              <div className="text-xs text-slate-500 tabular-nums">
                                {i.durationMinutes} min{!booked && " · requested"}
                              </div>
                            </td>
                            <td className="whitespace-nowrap">
                              <StepBar step={i.step} />
                            </td>
                            <td className="whitespace-nowrap">
                              <span className="flex items-center gap-2">
                                <CallerAvatar caller={booked || i.status === "pending" ? i.caller : null} size={24} />
                                {i.status === "open" ? <span className="text-indigo-700">Open to all</span> : (i.caller?.name ?? "—")}
                                {as === "staff" && i.status !== "open" && i.caller && <PresenceDot userId={i.caller._id} />}
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
                            <td>
                              <InterviewStatus i={i} />
                            </td>
                            <td className="actions">
                              <button
                                className="btn btn-ghost btn-sm btn-icon"
                                aria-label={`Details for ${i.company}`}
                                title="Details"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setView(i);
                                }}
                              >
                                <Eye />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {view && (
        <Modal open wide onClose={() => setView(null)} title={`${view.company} · ${view.profile?.label ?? view.profileLabel}`}>
          {view.deletedAt && (
            <div className="mb-3">
              <Alert>
                Deleted by {view.deletedByName || "an admin"} on {fmtDay(view.deletedAt)} {fmtTime(view.deletedAt)}
                {view.deleteReason ? ` · Reason: ${view.deleteReason}` : ""}
              </Alert>
            </div>
          )}
          <InterviewDetail i={view} />
          <InterviewNotes
            i={view}
            canAdd={!view.deletedAt && (myRole === "admin" || isMine(view))}
            onAdded={(comments) => {
              setView({ ...view, comments });
              list.reload();
              all.reload();
            }}
          />
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 [&>button]:flex-1 sm:[&>button]:flex-none">
            {!view.deletedAt && canUseAssistant(myRole) && (
              <button className="btn btn-secondary" onClick={() => setDialog({ kind: "assistant", i: view })}>
                <Sparkles />
                Interview Assistant
              </button>
            )}
            {as === "caller" && canAccept(view) && (
              <button className="btn btn-primary" onClick={() => setDialog({ kind: "accept", i: view })}>
                {view.status === "open" ? "Accept" : "Accept & schedule"}
              </button>
            )}
            {as === "caller" && view.status === "scheduled" && isMine(view) && (
              <>
                {reportDue(view) && (
                  <button className="btn btn-primary" onClick={() => setDialog({ kind: "report", i: view })}>
                    Report result
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setDialog({ kind: "reschedule", i: view })}>
                  Reschedule
                </button>
                {!view.lockedCaller && (
                  <button className="btn btn-ghost text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDialog({ kind: "transfer", i: view })}>
                    Can&apos;t do it
                  </button>
                )}
              </>
            )}
            {as === "caller" && view.status === "pending" && isMine(view) && !view.lockedCaller && (
              <button className="btn btn-ghost text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDialog({ kind: "transfer", i: view })}>
                Can&apos;t do it
              </button>
            )}
            {!view.deletedAt && view.status === "completed" && (myRole === "admin" || isMine(view)) && (
              <button className="btn btn-secondary" onClick={() => setDialog({ kind: "feedback", i: view })}>
                {view.report?.summary || view.report?.interviewerName ? "Edit feedback" : "Add feedback"}
              </button>
            )}
            {as === "staff" && myRole === "admin" && view.deletedAt && (
              <button className="btn btn-primary" disabled={restoring} onClick={() => restore(view)}>
                {restoring && <Spinner />} Restore
              </button>
            )}
            {as === "staff" && !view.deletedAt && view.status !== "cancelled" && view.status !== "completed" && (
              <>
                {/* Admins can record the outcome for the caller once the interview has started (the API allows it). */}
                {myRole === "admin" && reportDue(view) && (
                  <button className="btn btn-primary" onClick={() => setDialog({ kind: "report", i: view })}>
                    <ClipboardCheck />
                    Report result
                  </button>
                )}
                {myRole === "admin" && (
                  <button className={`btn ${reportDue(view) ? "btn-secondary" : "btn-primary"}`} onClick={() => setDialog({ kind: "edit", i: view })}>
                    Edit schedule
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setDialog({ kind: "assign", i: view })}>
                  {view.status === "scheduled" ? "Reassign caller" : "Assign caller"}
                </button>
                <button className="btn btn-ghost text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setDialog({ kind: "cancel", i: view })}>
                  Cancel request
                </button>
              </>
            )}
            {as === "staff" && myRole === "admin" && !view.deletedAt && (
              <button className="btn btn-danger" onClick={() => setDialog({ kind: "delete", i: view })}>
                Delete
              </button>
            )}
          </div>
        </Modal>
      )}
      {dialog?.kind === "accept" && <ScheduleDialog i={dialog.i} mode="accept" day={dialog.day} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "reschedule" && <ScheduleDialog i={dialog.i} mode="reschedule" day={dialog.day} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "report" && <ReportDialog i={dialog.i} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "transfer" && <TransferDialog i={dialog.i} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "cancel" && <CancelDialog i={dialog.i} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "edit" && (
        <Modal open wide onClose={() => setDialog(null)} title="Edit schedule">
          <ScheduleInterviewForm interview={dialog.i} onCancel={() => setDialog(null)} onDone={done} />
        </Modal>
      )}
      {dialog?.kind === "feedback" && <FeedbackDialog i={dialog.i} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "assistant" && <InterviewAssistant interview={dialog.i} onClose={() => setDialog(null)} />}
      {dialog?.kind === "delete" && <DeleteDialog i={dialog.i} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "assign" && <AssignDialog i={dialog.i} callers={options.data?.callers ?? []} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

/** Icon colour per tile (status colours only where they carry meaning). */
const KPI_TONES = {
  indigo: "text-indigo-600",
  sky: "text-sky-600",
  amber: "text-amber-600",
  rose: "text-rose-600",
  orange: "text-orange-600",
  emerald: "text-emerald-600",
} as const;
const KPI_ICONS: Record<"calendar" | "clock" | "user" | "flag" | "check", IconType> = {
  calendar: CalendarDays,
  clock: Clock,
  user: UserPlus,
  flag: Flag,
  check: CircleCheck,
};

/** Clickable overview tile: icon, count and a short hint. */
function Kpi({ label, value, hint, tone, icon, onClick }: { label: string; value: number; hint: string; tone: keyof typeof KPI_TONES; icon: keyof typeof KPI_ICONS; onClick: () => void }) {
  const Icon = KPI_ICONS[icon];
  return (
    <button type="button" onClick={onClick} className="card group flex min-w-0 cursor-pointer flex-col p-3.5 text-left sm:p-4 transition-colors hover:border-slate-300 hover:bg-slate-50">
      <span className="flex w-full items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-slate-500">{label}</span>
        <Icon className={`size-4 shrink-0 ${KPI_TONES[tone]}`} />
      </span>
      <span className="mt-2 block text-xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-2xl">{value}</span>
      <span className={`mt-1 block truncate text-xs ${tone === "rose" ? "text-rose-600" : "text-slate-500"}`}>{hint}</span>
    </button>
  );
}
