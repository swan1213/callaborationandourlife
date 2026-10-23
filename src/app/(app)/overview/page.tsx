"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, FileText, Minus, Plus, Send, TrendingDown, TrendingUp } from "lucide-react";
import { Alert, api, PageHeader, PageSkeleton, Segmented, useAsync } from "@/components/ui";
import { zoneName } from "@/lib/viewerTz";

type Bucket = { key: string; label: string; created: number; submitted: number; interviews: number };
type Stats = { timezone: string; weeks: Bucket[]; months: Bucket[]; allTime: { created: number; submitted: number; interviews: number } };

const SERIES = [
  { key: "created", label: "Resumes created", color: "var(--series-1)", icon: FileText },
  { key: "submitted", label: "Submitted", color: "var(--series-2)", icon: Send },
  { key: "interviews", label: "Initial interviews", color: "var(--series-3)", icon: CalendarCheck },
] as const;
type Key = (typeof SERIES)[number]["key"];

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default function OverviewPage() {
  const stats = useAsync(() => api<Stats>("/api/me/stats"), []);
  const [period, setPeriod] = useState<"weeks" | "months">("weeks");

  if (stats.error) return <Alert>{stats.error}</Alert>;
  if (!stats.data) return <PageSkeleton stats />;
  const { weeks, months, allTime, timezone } = stats.data;
  const buckets = period === "weeks" ? weeks : months;
  const cur = { week: weeks[weeks.length - 1], lastWeek: weeks[weeks.length - 2], month: months[months.length - 1], lastMonth: months[months.length - 2] };

  return (
    <div className="viz mx-auto max-w-6xl">
      <PageHeader
        title="Overview"
        subtitle={`Your bids and interviews at a glance. Interviews count initial interviews (step 1) only. Weeks start Monday (${zoneName(timezone)}).`}
        actions={
          <Link href="/dashboard" className="btn btn-primary">
            <Plus />
            New application
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <PeriodCard title="This week" sub={cur.week.label} now={cur.week} prev={cur.lastWeek} prevLabel="last week" />
        <PeriodCard title="This month" sub={cur.month.label} now={cur.month} prev={cur.lastMonth} prevLabel="last month" />
      </div>

      <section className="card mb-6 p-0">
        <div className="card-header">
          <div className="min-w-0">
            <h2 className="card-title">Activity</h2>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500">
              {SERIES.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
                </span>
              ))}
            </div>
          </div>
          <Segmented
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "weeks", label: "Weekly" },
              { value: "months", label: "Monthly" },
            ]}
          />
        </div>
        <div className="card-body">
          <div className="-mx-5 overflow-x-auto px-5">
            <BarChart buckets={buckets} />
          </div>
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="card-header">
          <div>
            <h2 className="card-title">{period === "weeks" ? "Weekly breakdown" : "Monthly breakdown"}</h2>
            <p className="card-description">Submission rate = submitted / created. Interview rate = interviews / submitted.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{period === "weeks" ? "Week" : "Month"}</th>
                <th className="num">Created</th>
                <th className="num">Submitted</th>
                <th className="num">Submit rate</th>
                <th className="num">Interviews</th>
                <th className="num">Interview rate</th>
              </tr>
            </thead>
            <tbody>
              {[...buckets].reverse().map((b, i) => (
                <tr key={b.key} className={i === 0 ? "font-medium" : ""}>
                  <td className="whitespace-nowrap">
                    {b.label}
                    {i === 0 && <span className="chip ml-2 font-normal">{period === "weeks" ? "this week" : "this month"}</span>}
                  </td>
                  <td className="num">{b.created}</td>
                  <td className="num">{b.submitted}</td>
                  <td className="num text-slate-500">{pct(b.submitted, b.created)}</td>
                  <td className="num">{b.interviews}</td>
                  <td className="num text-slate-500">{pct(b.interviews, b.submitted)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold [&>td]:border-b-0">
                <td>All time</td>
                <td className="num">{allTime.created}</td>
                <td className="num">{allTime.submitted}</td>
                <td className="num">{pct(allTime.submitted, allTime.created)}</td>
                <td className="num">{allTime.interviews}</td>
                <td className="num">{pct(allTime.interviews, allTime.submitted)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function PeriodCard({ title, sub, now, prev, prevLabel }: { title: string; sub: string; now: Bucket; prev?: Bucket; prevLabel: string }) {
  return (
    <section className="card p-0">
      <div className="card-header py-3">
        <h2 className="card-title">{title}</h2>
        <div className="text-xs text-slate-500 tabular-nums">{sub}</div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-200">
        {SERIES.map((s) => {
          const v = now[s.key as Key];
          const p = prev?.[s.key as Key] ?? 0;
          const diff = v - p;
          const Icon = s.icon;
          const Trend = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
          return (
            <div key={s.key} className="min-w-0 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-1.5 text-xs leading-snug font-medium text-slate-500 sm:text-[13px]">
                  <span aria-hidden className="mt-1 size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0">{s.label}</span>
                </div>
                <Icon className="hidden size-4 shrink-0 text-slate-400 sm:block" />
              </div>
              <div className="mt-2 text-xl font-semibold sm:text-2xl tracking-tight text-slate-900 tabular-nums">{v}</div>
              <div className={`mt-1 flex flex-wrap items-center gap-x-1 text-xs tabular-nums ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-slate-400"}`}>
                <Trend className="size-3.5" />
                {Math.abs(diff)} <span className="text-slate-500">vs {prevLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Grouped bar chart (SVG, no dependencies). */
function BarChart({ buckets }: { buckets: Bucket[] }) {
  const W = 760;
  const H = 260;
  const pad = { l: 36, r: 8, t: 12, b: 36 };
  const max = Math.max(1, ...buckets.flatMap((b) => SERIES.map((s) => b[s.key as Key])));
  const step = max <= 5 ? 1 : Math.ceil(max / 5);
  const top = Math.ceil(max / step) * step;
  const gw = (W - pad.l - pad.r) / buckets.length;
  const bw = Math.min(22, (gw - 12) / SERIES.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[34rem]" role="img" aria-label="Resumes created, submitted and initial interviews per period">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-slate-200" strokeWidth={1} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="fill-slate-400" fontSize={11}>
            {t}
          </text>
        </g>
      ))}
      {buckets.map((b, i) => {
        const gx = pad.l + i * gw + (gw - bw * SERIES.length) / 2;
        return (
          <g key={b.key}>
            {SERIES.map((s, k) => {
              const v = b[s.key as Key];
              return (
                <rect key={s.key} x={gx + k * bw} y={y(v)} width={bw - 3} height={Math.max(0, y(0) - y(v))} rx={3} fill={s.color} opacity={i === buckets.length - 1 ? 1 : 0.75}>
                  <title>{`${b.label} · ${s.label}: ${v}`}</title>
                </rect>
              );
            })}
            <text x={pad.l + i * gw + gw / 2} y={H - pad.b + 18} textAnchor="middle" fontSize={11} className={i === buckets.length - 1 ? "fill-slate-900 font-semibold" : "fill-slate-500"}>
              {b.label.length > 7 ? b.label.slice(5, 10) : b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
