"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FeedbackDialog,
  InterviewDetail,
  InterviewStatus,
  LockBadge,
  Materials,
  noticeParts,
  ReportDialog,
  Screens,
  ScheduleDialog,
  StepBar,
  reportDue,
  TransferDialog,
  deadlineLabel,
  fmtDayTime,
  fmtRequested,
  useTick,
  type Interview,
} from "@/components/interviews";
import { CalendarCheck, CircleCheck, Clock, CornerDownRight, History, Inbox, Users } from "lucide-react";
import { useToast } from "@/components/Alerts";
import { Alert, api, Modal, PageHeader, CardSkeleton, EmptyState, useAsync, type IconType } from "@/components/ui";

type Tab = "mine" | "open" | "scheduled" | "report" | "history";
const EMPTY: Record<Tab, { icon: IconType; text: string }> = {
  mine: { icon: Inbox, text: "No requests waiting for you." },
  open: { icon: Users, text: "No shared requests right now." },
  scheduled: { icon: CalendarCheck, text: "No upcoming interviews." },
  report: { icon: CircleCheck, text: "All results reported." },
  history: { icon: History, text: "Nothing here yet." },
};
type Resp = { items: Interview[]; counts: { pending: number; open: number; upcoming: number; reportDue: number } };

export default function Page() {
  return (
    <Suspense>
      <CallerRequests />
    </Suspense>
  );
}

function CallerRequests() {
  useTick();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>("mine");
  const [me, setMe] = useState("");
  const data = useAsync(() => api<Resp>("/api/interviews"), []);
  const [view, setView] = useState<Interview | null>(null);
  const [schedule, setSchedule] = useState<{ i: Interview; mode: "accept" | "reschedule" } | null>(null);
  const [transfer, setTransfer] = useState<Interview | null>(null);
  const [report, setReport] = useState<Interview | null>(null);
  const [feedback, setFeedback] = useState<Interview | null>(null);
  const toast = useToast();

  useEffect(() => {
    api<{ user: { id: string } }>("/api/me").then((r) => setMe(r.user.id)).catch(() => {});
  }, []);

  // Refresh every minute so shared requests taken by someone else disappear.
  useEffect(() => {
    const t = setInterval(() => data.reload(), 60_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link from emails: /caller/requests?id=...
  useEffect(() => {
    const id = sp.get("id");
    const found = id && data.data?.items.find((x) => x._id === id);
    if (found) {
      setView(found);
      setTab(found.status === "open" ? "open" : reportDue(found) ? "report" : found.status === "scheduled" ? "scheduled" : found.status === "pending" ? "mine" : "history");
    }
  }, [sp, data.data]);

  const items = data.data?.items ?? [];
  const mineId = (i: Interview) => i.caller?._id === me;
  const lists: Record<Tab, Interview[]> = {
    mine: items.filter((i) => i.status === "pending" && mineId(i)),
    open: items.filter((i) => i.status === "open"),
    scheduled: items
      .filter((i) => i.status === "scheduled" && mineId(i) && !reportDue(i))
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()),
    report: items.filter((i) => mineId(i) && reportDue(i)).sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()),
    history: items
      .filter((i) => i.status === "cancelled" || i.status === "completed" || (i.status === "scheduled" && !mineId(i)) || (i.status === "pending" && !mineId(i)))
      .sort((a, b) => +new Date(b.scheduledAt ?? b.createdAt) - +new Date(a.scheduledAt ?? a.createdAt)),
  };
  const TABS: [Tab, string, number | undefined][] = [
    ["mine", "Assigned to me", data.data?.counts.pending],
    ["open", "Shared requests", data.data?.counts.open],
    ["scheduled", "Scheduled", data.data?.counts.upcoming],
    ["report", "Report due", data.data?.counts.reportDue],
    ["history", "History", undefined],
  ];
  const done = (text: string) => {
    setSchedule(null);
    setTransfer(null);
    setReport(null);
    setView(null);
    toast.success(...noticeParts(text));
    data.reload();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Interview requests"
        subtitle="Schedule the interviews assigned to you. If you can't make it, transfer the request with a reason. Shared requests go to the first caller who accepts."
      />
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="segmented" role="group" aria-label="Requests">
          {TABS.map(([k, label, n]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
              {label}
              {!!n && (
                <span
                  className={`rounded px-1 text-xs font-medium tabular-nums ${k === "mine" ? "bg-amber-100 text-amber-700" : k === "report" ? "bg-orange-100 text-orange-700" : k === "open" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"}`}
                >
                  {n}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {data.loading && !data.data ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : data.error ? (
        <Alert>{data.error}</Alert>
      ) : !lists[tab].length ? (
        <div className="card p-0">
          <EmptyState icon={EMPTY[tab].icon} title={EMPTY[tab].text} />
        </div>
      ) : (
        <div className="space-y-3">
          {lists[tab].map((i) => {
            const dl = ["pending", "open"].includes(i.status) ? deadlineLabel(i.scheduleBy) : null;
            const lastTransfer = i.transfers[i.transfers.length - 1];
            return (
              <div key={i._id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold text-slate-900">{i.company}</h2>
                      {i.jobTitle && <span className="text-sm text-slate-500">· {i.jobTitle}</span>}
                      <InterviewStatus i={i} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
                      <StepBar step={i.step} />
                      {i.lockedCaller && <LockBadge />}
                      <span>
                        Profile <span className="font-medium text-slate-700">{i.profile?.label ?? i.profileLabel}</span> · requested by {i.requestedBy?.name}
                      </span>
                    </div>
                    <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
                      <dt className="flex items-center gap-1.5 text-slate-500">
                        <Clock className="size-3.5 text-slate-400" aria-hidden />
                        Requested:
                      </dt>
                      <dd className="tabular-nums">
                        <span className="font-medium text-slate-900">{fmtRequested(i)}</span>
                        <span className="text-slate-400"> · {i.durationMinutes} min</span>
                      </dd>
                      {(i.status === "scheduled" || i.status === "completed") && i.scheduledAt && (
                        <>
                          <dt className="flex items-center gap-1.5 text-slate-500">
                            <CalendarCheck className="size-3.5 text-slate-400" aria-hidden />
                            Scheduled:
                          </dt>
                          <dd className="tabular-nums">
                            <span className="font-semibold text-emerald-700">{fmtDayTime(i.scheduledAt)}</span>
                            {!mineId(i) && i.caller && <span className="text-slate-500"> with {i.caller.name}</span>}
                          </dd>
                        </>
                      )}
                    </dl>
                    {i.status === "open" && lastTransfer && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <CornerDownRight className="mt-px size-3.5 shrink-0 text-slate-400" aria-hidden />
                        <span>
                          Transferred by <strong className="font-medium text-slate-900">{lastTransfer.fromName}</strong>: {lastTransfer.reason}
                        </span>
                      </div>
                    )}
                    {i.notes && <div className="mt-3 border-l-2 border-slate-200 pl-3 text-sm whitespace-pre-wrap text-slate-600">“{i.notes}”</div>}
                    {dl && (
                      <div
                        className={`mt-3 inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${dl.late ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}`}
                      >
                        {dl.text}
                      </div>
                    )}
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                    <button className="btn btn-ghost btn-sm max-sm:h-9 max-sm:px-3 max-sm:text-sm" onClick={() => setView(i)}>
                      Details
                    </button>
                    {(tab === "mine" || tab === "open") && (
                      <button className="btn btn-primary btn-sm max-sm:h-9 max-sm:px-3 max-sm:text-sm" onClick={() => setSchedule({ i, mode: "accept" })}>
                        {tab === "open" ? "Accept" : "Accept & schedule"}
                      </button>
                    )}
                    {tab === "scheduled" && (
                      <button className="btn btn-secondary btn-sm max-sm:h-9 max-sm:px-3 max-sm:text-sm" onClick={() => setSchedule({ i, mode: "reschedule" })}>
                        Reschedule
                      </button>
                    )}
                    {tab === "report" && (
                      <button className="btn btn-primary btn-sm max-sm:h-9 max-sm:px-3 max-sm:text-sm" onClick={() => setReport(i)}>
                        Report result
                      </button>
                    )}
                    {(tab === "mine" || tab === "scheduled") && !i.lockedCaller && (
                      <button className="btn btn-ghost btn-sm max-sm:h-9 max-sm:px-3 max-sm:text-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setTransfer(i)}>
                        Can&apos;t do it
                      </button>
                    )}
                  </div>
                </div>
                {i.lockedCaller && tab === "mine" && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">You conducted the earlier interview for this role, so this follow-up is yours. It can&apos;t be transferred.</div>
                )}
                {tab !== "history" && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <Materials i={i} />
                  </div>
                )}
                {tab !== "history" && tab !== "report" && (
                  <div className="mt-3">
                    <Screens i={i} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view && (
        <Modal open wide onClose={() => setView(null)} title={`${view.company} · ${view.profile?.label ?? view.profileLabel}`}>
          <InterviewDetail i={view} />
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 [&>button]:flex-1 sm:[&>button]:flex-none">
            {(view.status === "open" || (view.status === "pending" && mineId(view))) && (
              <button className="btn btn-primary" onClick={() => setSchedule({ i: view, mode: "accept" })}>
                {view.status === "open" ? "Accept" : "Accept & schedule"}
              </button>
            )}
            {view.status === "completed" && mineId(view) && (
              <button className="btn btn-secondary" onClick={() => setFeedback(view)}>
                {view.report?.summary || view.report?.interviewerName ? "Edit feedback" : "Add feedback"}
              </button>
            )}
            {reportDue(view) && mineId(view) && (
              <button className="btn btn-primary" onClick={() => setReport(view)}>
                Report result
              </button>
            )}
            {view.status === "scheduled" && mineId(view) && (
              <button className="btn btn-secondary" onClick={() => setSchedule({ i: view, mode: "reschedule" })}>
                Reschedule
              </button>
            )}
            {["pending", "scheduled"].includes(view.status) && mineId(view) && !view.lockedCaller && (
              <button className="btn btn-ghost text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setTransfer(view)}>
                Can&apos;t do it
              </button>
            )}
          </div>
        </Modal>
      )}
      {schedule && (
        <ScheduleDialog
          i={schedule.i}
          mode={schedule.mode}
          onClose={() => setSchedule(null)}
          onDone={done}
        />
      )}
      {transfer && <TransferDialog i={transfer} onClose={() => setTransfer(null)} onDone={done} />}
      {report && <ReportDialog i={report} onClose={() => setReport(null)} onDone={done} />}
      {feedback && (
        <FeedbackDialog
          i={feedback}
          onClose={() => setFeedback(null)}
          onDone={(m) => {
            setFeedback(null);
            done(m);
          }}
        />
      )}
    </div>
  );
}
