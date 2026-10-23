"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Timer } from "lucide-react";
import { Alert, api, EmptyState, localDay, PageHeader, Segmented, Stat, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";
import { PresenceAvatar, PresenceLabel, usePresence } from "@/components/Presence";
import { getViewerTz, tzParts, zoneName } from "@/lib/viewerTz";

type DayWork = { ms: number; first: string; last: string };
type Row = { _id: string; name: string; email: string; role: string; avatar: string; totalMs: number; days: Record<string, DayWork> };
type Range = "today" | "week" | "lastweek" | "month" | "custom";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User", caller: "Caller", bidder: "Bidder" };
/** Up to this many days get a column each; longer ranges show a strip of daily bars. */
const DAY_COLUMNS = 7;

/** "6 h 20 min", "45 min", "—". */
function hours(ms: number) {
  if (ms < 60_000) return ms ? "<1 min" : "—";
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const weekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();
const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
const dayLong = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const clockTime = (iso: string) => {
  const p = tzParts(iso);
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
};

/** [from, to] day keys for a preset, in the viewer's time zone. Weeks start on Monday. */
function presetRange(r: Exclude<Range, "custom">): [string, string] {
  const today = localDay();
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  if (r === "today") return [today, today];
  if (r === "week") return [monday, today];
  if (r === "lastweek") return [addDays(monday, -7), addDays(monday, -1)];
  return [`${today.slice(0, 8)}01`, today];
}

const tip = (key: string, d?: DayWork) => (d ? `${dayLong(key)}: ${hours(d.ms)} · ${clockTime(d.first)}–${clockTime(d.last)}` : `${dayLong(key)}: no work time`);

export default function Page() {
  const [range, setRange] = useState<Range>("week");
  const [custom, setCustom] = useState<[string, string]>(() => presetRange("week"));
  const [from, to] = range === "custom" ? custom : presetRange(range);
  const [role, setRole] = useState("");
  const [everyone, setEveryone] = useState(false);
  const tz = getViewerTz();
  const res = useAsync(
    () => api<{ days: string[]; users: Row[] }>(`/api/admin/work-time?${new URLSearchParams({ from, to, tz })}`),
    [from, to, tz]
  );
  const { people } = usePresence();

  const days = useMemo(() => res.data?.days ?? [], [res.data]);
  const rows = (res.data?.users ?? []).filter((u) => (!role || u.role === role) && (everyone || u.totalMs > 0)).sort((a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name));
  const { pageRows, pager } = useClientPaging(rows, "work-time");
  const max = Math.max(1, ...rows.flatMap((u) => Object.values(u.days).map((d) => d.ms)));
  const total = rows.reduce((t, u) => t + u.totalMs, 0);
  const worked = rows.filter((u) => u.totalMs > 0).length;
  const columns = days.length <= DAY_COLUMNS;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Work Time"
        subtitle={`Active time in TailorBid and the Interview Assistant: open and in use (idle over 5 minutes isn't counted). Times in ${zoneName(tz)}.`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Online now" value={people.filter((p) => p.status === "online").length} hint={`${people.filter((p) => p.status === "away").length} away`} />
        <Stat label="Work time in range" value={hours(total)} />
        <Stat label="People who worked" value={worked} />
        <Stat label="Average per person" value={worked ? hours(total / worked) : "—"} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented
          label="Date range"
          value={range}
          onChange={setRange}
          options={[
            { value: "today", label: "Today" },
            { value: "week", label: "This week" },
            { value: "lastweek", label: "Last week" },
            { value: "month", label: "This month" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {range === "custom" && (
          <div className="flex items-end gap-2">
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={custom[1]} min={custom[0]} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} />
            </div>
          </div>
        )}
        <div>
          <label className="label">Role</label>
          <select className="input w-36" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All</option>
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-[13px] text-slate-600">
          <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
          Include accounts with no time
        </label>
      </div>

      {res.error && <Alert>{res.error}</Alert>}
      <div className="card overflow-hidden p-0">
        {res.loading && !res.data ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !rows.length ? (
          <EmptyState icon={Timer} title="No work time in this range." description="Time is recorded while TailorBid or the Interview Assistant is open and in use." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num">Total</th>
                  {columns ? (
                    days.map((k) => (
                      <th key={k} className="min-w-24">
                        {dayLabel(k)}
                      </th>
                    ))
                  ) : (
                    <>
                      <th className="num">Days</th>
                      <th className="num">Per day</th>
                      <th>Each day</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u) => {
                  const active = Object.values(u.days).filter((d) => d.ms > 0).length;
                  return (
                    <tr key={u._id}>
                      <td className="min-w-56">
                        <span className="flex items-center gap-2.5">
                          <PresenceAvatar userId={u._id} avatar={u.avatar} name={u.name} />
                          <span className="min-w-0">
                            <Link href={`/admin/users/${u._id}`} className="block truncate font-medium text-slate-900 hover:text-indigo-600">
                              {u.name}
                            </Link>
                            <span className="flex items-center gap-2 text-xs text-slate-500">
                              {ROLE_LABEL[u.role] ?? u.role}
                              <PresenceLabel userId={u._id} />
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="num font-medium text-slate-900">{hours(u.totalMs)}</td>
                      {columns ? (
                        days.map((k) => <DayCell key={k} day={k} work={u.days[k]} max={max} />)
                      ) : (
                        <>
                          <td className="num">{active}</td>
                          <td className="num">{active ? hours(u.totalMs / active) : "—"}</td>
                          <td>
                            <DayStrip days={days} work={u.days} max={max} />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!!rows.length && <div className="border-t border-slate-200 px-4 pb-3">{pager}</div>}
      </div>
    </div>
  );
}

/** One day: the time, a bar (longest day in the table = full width), and start–end on hover. */
function DayCell({ day, work, max }: { day: string; work?: DayWork; max: number }) {
  return (
    <td title={tip(day, work)} className="align-middle">
      <div className="text-xs whitespace-nowrap text-slate-700 tabular-nums">{work ? hours(work.ms) : <span className="text-slate-300">—</span>}</div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
        {work && <div className="h-1.5 rounded-full" style={{ width: `max(${(100 * work.ms) / max}%, 4px)`, background: "var(--series-1)" }} />}
      </div>
    </td>
  );
}

/** Longer ranges: one small bar per day (height = time worked), with the details on hover. */
function DayStrip({ days, work, max }: { days: string[]; work: Record<string, DayWork>; max: number }) {
  return (
    <div className="flex h-7 items-end gap-0.5" role="img" aria-label={`${Object.keys(work).length} of ${days.length} days with work time`}>
      {days.map((k) => {
        const d = work[k];
        return (
          <span key={k} title={tip(k, d)} className="flex h-full w-2 items-end">
            <span
              className="w-full rounded-t-[2px]"
              style={d ? { height: `max(${(100 * d.ms) / max}%, 3px)`, background: "var(--series-1)" } : { height: 2, background: "var(--line)" }}
            />
          </span>
        );
      })}
    </div>
  );
}
