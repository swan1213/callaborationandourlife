"use client";

import { useState, type ReactNode } from "react";
import type { Analytics } from "@/lib/analytics";
import { CalendarCheck, ChartColumn, Coins, FileCheck, MessageSquare, Send } from "lucide-react";
import { Alert, api, EmptyState, PageHeader, PageSkeleton, Segmented, Stat, useAsync } from "@/components/ui";
import { useRole } from "@/components/AppShell";

const DAY = 86_400_000;
const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 },
] as const;

const n = (v: number) => v.toLocaleString("en-US");
const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0)}%`;
const usd = (v: number) => `$${v.toFixed(2)}`;
const weekLabel = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function AnalyticsPage() {
  const isAdmin = useRole() === "admin";
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("90");
  const days = RANGES.find((r) => r.key === range)!.days;
  const data = useAsync(() => {
    const p = new URLSearchParams({ from: new Date(Date.now() - (days - 1) * DAY).toISOString(), to: new Date().toISOString() });
    return api<Analytics>(`/api/admin/analytics?${p}`);
  }, [days]);

  const header = (
    <PageHeader
      title="Analytics"
      subtitle={isAdmin ? "How applications turn into interviews, by profile, bidder and resume design." : "How your profiles' applications turn into interviews."}
      actions={
        <Segmented label="Date range" className="max-w-full overflow-x-auto" options={RANGES.map((r) => ({ value: r.key, label: r.label }))} value={range} onChange={setRange} />
      }
    />
  );

  if (data.error)
    return (
      <div className="mx-auto max-w-7xl">
        {header}
        <Alert>{data.error}</Alert>
      </div>
    );
  if (!data.data) return <PageSkeleton stats variant="cards" />;
  const a = data.data;
  const t = a.totals;

  // Skip leading weeks before the first application, so a long range doesn't open with empty columns.
  const firstActive = a.weekly.findIndex((w) => w.generated || w.submitted || w.interviews);
  const weekly = firstActive > 0 ? a.weekly.slice(firstActive) : a.weekly;

  return (
    <div className={`viz mx-auto max-w-7xl space-y-6 transition-opacity ${data.loading ? "opacity-60" : ""}`}>
      {header}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Generated" icon={FileCheck} value={n(t.generated)} hint="tailored applications" />
        <Stat label="Submitted" icon={Send} value={n(t.submitted)} hint={`${pct(t.generated ? t.submitted / t.generated : 0)} of generated`} />
        <Stat label="Got an interview" icon={CalendarCheck} value={n(t.interviews)} hint={`${pct(t.submitted ? t.interviews / t.submitted : 0)} of submitted`} />
        <Stat label="Reached a follow-up" icon={MessageSquare} value={n(t.followUps)} hint={`${n(t.passed)} reported as passed`} />
        {isAdmin && <Stat label="AI cost" icon={Coins} value={usd(t.cost)} hint={`$${t.costPerApplication.toFixed(4)} per application`} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="From application to interview" note="Each step counts the applications that reached it." className="lg:col-span-2">
          <Funnel steps={a.funnel} />
        </Panel>
        <Panel title="Applications per week" note="Weeks start on Monday." className="lg:col-span-3">
          <ColumnChart
            rows={weekly.map((w) => ({ key: w.week, label: weekLabel(w.week), values: [w.generated, w.submitted] }))}
            series={[
              { name: "Generated", color: "var(--series-1)" },
              { name: "Submitted", color: "var(--series-2)" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Interview requests per week" note="First-round interviews (step 1), by the week they were requested.">
        <ColumnChart rows={weekly.map((w) => ({ key: w.week, label: weekLabel(w.week), values: [w.interviews] }))} series={[{ name: "Interviews", color: "var(--series-3)" }]} height={140} />
      </Panel>

      <Panel title="By profile" note="Interview rate = interviews ÷ submitted applications." flush>
        <Breakdown rows={a.byProfile} nameLabel="Profile" showCost={isAdmin} />
      </Panel>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="By bidder" flush>
          <Breakdown rows={a.byBidder} nameLabel="Bidder" />
        </Panel>
        <Panel title="By resume design" note="Applications generated before designs existed count as Standard." flush>
          <Breakdown rows={a.byDesign} nameLabel="Design" />
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Panel({ title, note, className = "", flush, children }: { title: string; note?: string; className?: string; flush?: boolean; children: ReactNode }) {
  return (
    <section className={`card flex flex-col p-0 ${flush ? "overflow-hidden" : ""} ${className}`}>
      <div className="card-header">
        <div className="min-w-0">
          <h2 className="card-title">{title}</h2>
          {note && <p className="card-description">{note}</p>}
        </div>
      </div>
      <div className={flush ? "" : "card-body flex-1"}>{children}</div>
    </section>
  );
}

/** Hover card shown above a mark. */
function Tip({ children, align = "center" }: { children: ReactNode; align?: "center" | "left" | "right" }) {
  const pos = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div role="tooltip" className={`pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-[min(15rem,calc(100vw-2rem))] popover animate-fade-in rounded-lg px-3 py-2 text-xs ${pos}`}>
      {children}
    </div>
  );
}

const Swatch = ({ color }: { color: string }) => <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />;

/** Horizontal bars, one hue; each step shows its count and the share of the step before it. */
function Funnel({ steps }: { steps: Analytics["funnel"] }) {
  const [hover, setHover] = useState(-1);
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-4">
      {steps.map((s, k) => {
        const prev = k ? steps[k - 1].value : 0;
        const share = k && prev ? s.value / prev : null;
        return (
          <div key={s.key} className="relative" onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(-1)}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-700">{s.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold text-slate-900">{n(s.value)}</span>
                {share !== null && <span className="ml-1.5 text-xs text-slate-500">{pct(share)} of previous</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-2.5 rounded-full transition-[width] duration-500"
                style={{ width: s.value ? `max(${(100 * s.value) / max}%, 6px)` : 0, background: "var(--series-1)", opacity: hover === -1 || hover === k ? 1 : 0.45 }}
              />
            </div>
            {hover === k && (
              <Tip align="left">
                <div className="font-semibold text-slate-900">{s.label}</div>
                <div className="text-slate-600">
                  {n(s.value)} application{s.value === 1 ? "" : "s"}
                  {share !== null && ` · ${pct(share)} of "${steps[k - 1].label}"`}
                  {k > 0 && steps[0].value ? ` · ${pct(s.value / steps[0].value)} of all generated` : ""}
                </div>
              </Tip>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Round "nice" axis maximum (1, 2, 2.5, 5 × 10^n). */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v)!;
}

/** Grouped columns per row (one column per series), recessive grid, legend with totals and a hover tooltip per row. */
function ColumnChart({ rows, series, height = 200 }: { rows: { key: string; label: string; values: number[] }[]; series: { name: string; color: string }[]; height?: number }) {
  const [hover, setHover] = useState(-1);
  const max = niceMax(Math.max(0, ...rows.flatMap((r) => r.values)));
  const ticks = [max, max / 2, 0];
  const every = rows.length > 16 ? 4 : rows.length > 8 ? 2 : 1;
  const totals = series.map((_, s) => rows.reduce((sum, r) => sum + r.values[s], 0));
  if (!rows.length) return <EmptyState icon={ChartColumn} title="No data in this range." className="py-10" />;
  return (
    <div>
      {series.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
          {series.map((s, k) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <Swatch color={s.color} />
              {s.name} <span className="font-semibold text-slate-900 tabular-nums">{n(totals[k])}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {/* y axis */}
        <div className="flex w-8 shrink-0 flex-col justify-between text-right text-[11px] text-slate-400 tabular-nums" style={{ height }}>
          {ticks.map((v) => (
            <span key={v} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0 last:leading-none">
              {n(v)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((v, k) => (
              <div key={v} className={`absolute inset-x-0 border-t ${k === ticks.length - 1 ? "border-slate-200" : "border-dashed border-slate-200"}`} style={{ top: `${(k / (ticks.length - 1)) * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex">
              {rows.map((r, i) => (
                <div
                  key={r.key}
                  className={`relative flex flex-1 items-end justify-center gap-px rounded-t-md px-px transition-colors sm:gap-0.5 sm:px-[3px] ${hover === i ? "bg-slate-100" : ""}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(-1)}
                >
                  {r.values.map((v, s) => (
                    <div
                      key={s}
                      className="w-full max-w-4 rounded-t-[4px] transition-[height] duration-500"
                      style={{ height: v ? `max(${(100 * v) / max}%, 2px)` : 0, background: series[s].color }}
                    />
                  ))}
                  {hover === i && (
                    <Tip align={i < 2 ? "left" : i > rows.length - 3 ? "right" : "center"}>
                      <div className="mb-1 font-semibold text-slate-900">Week of {r.label}</div>
                      {series.map((s, k) => (
                        <div key={s.name} className="flex items-center gap-2 text-slate-600">
                          <Swatch color={s.color} />
                          {s.name}
                          <span className="ml-auto pl-3 font-semibold text-slate-900 tabular-nums">{n(r.values[k])}</span>
                        </div>
                      ))}
                    </Tip>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex text-[11px] text-slate-400">
            {rows.map((r, i) => (
              <span key={r.key} className="flex min-w-0 flex-1 justify-center whitespace-nowrap">
                {i % every === 0 ? r.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type BreakdownRow = Analytics["byProfile"][number];

/** Table view with an inline interview-rate bar (scaled to the best rate in the table). */
function Breakdown({ rows, nameLabel, showCost }: { rows: BreakdownRow[]; nameLabel: string; showCost?: boolean }) {
  if (!rows.length) return <EmptyState icon={ChartColumn} title="No applications in this range." className="py-10" />;
  const best = Math.max(...rows.map((r) => r.interviewRate), 0.0001);
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>{nameLabel}</th>
            <th className="num">Generated</th>
            <th className="num">Submitted</th>
            <th className="num">Interviews</th>
            <th>Interview rate</th>
            {showCost && <th className="num">AI cost</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="min-w-[10rem] font-medium text-slate-900">{r.name}</td>
              <td className="num">{n(r.generated)}</td>
              <td className="num">{n(r.submitted)}</td>
              <td className="num">
                {n(r.interviews)}
                {r.followUps > 0 && <span className="ml-1 text-xs text-slate-500">({r.followUps} follow-up{r.followUps === 1 ? "" : "s"})</span>}
              </td>
              <td className="min-w-40">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full" style={{ width: r.interviewRate ? `max(${(100 * r.interviewRate) / best}%, 4px)` : 0, background: "var(--series-1)" }} />
                  </div>
                  <span className="w-12 shrink-0 text-right text-xs font-medium text-slate-700 tabular-nums">{r.submitted ? pct(r.interviewRate) : "—"}</span>
                </div>
              </td>
              {showCost && <td className="num text-slate-600">{usd(r.cost)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
