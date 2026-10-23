"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CancelDialog,
  DeleteDialog,
  InterviewDetail,
  InterviewStatus,
  LockBadge,
  noticeParts,
  OUTCOME_LABEL,
  ScreenshotDrop,
  StepBar,
  deadlineLabel,
  fmtDayTime,
  fmtRequested,
  reportDue,
  useTick,
  type Interview,
  type Outcome,
} from "@/components/interviews";
import { CircleX, ExternalLink, Eye, Inbox, Plus, Search, Send, Trash, Video } from "lucide-react";
import { Alert, api, EmptyState, fmtDate, Modal, PageHeader, Segmented, Spinner, CardSkeleton, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";
import { useRole } from "@/components/AppShell";
import { ActionMenu, type ActionItem } from "@/components/ActionMenu";
import { useToast } from "@/components/Alerts";
import SearchSelect from "@/components/SearchSelect";
import { fromTzInput, getViewerTz, zoneName } from "@/lib/viewerTz";

type Options = { profiles: { id: string; label: string; fullName: string; callers: { id: string; name: string }[] }[] };
type AppOpt = {
  _id: string;
  company: string;
  jobTitle: string;
  jobUrl?: string;
  status: string;
  submittedAt?: string;
  createdAt: string;
  user?: { name: string } | null;
};
type Chain = {
  previous: { id: string; step: number; status: string; caller: string | null; scheduledAt: string | null; outcome: Outcome | null }[];
  nextStep: number;
  lead: { id: string; name: string; active: boolean } | null;
  followUp: boolean;
  locked: boolean;
};
type Tab = "active" | "previous" | "all";

export default function Page() {
  return (
    <Suspense>
      <InterviewRequests />
    </Suspense>
  );
}

/** Still in progress: waiting for a caller, or scheduled and not yet reported. */
const isActive = (i: Interview) => i.status === "pending" || i.status === "open" || i.status === "scheduled";

function InterviewRequests() {
  useTick();
  const sp = useSearchParams();
  const options = useAsync(() => api<Options>("/api/interviews/options"), []);
  const list = useAsync(() => api<{ items: Interview[] }>("/api/interviews?view=mine"), []);
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const [view, setView] = useState<Interview | null>(null);
  const [cancel, setCancel] = useState<Interview | null>(null);
  const [remove, setRemove] = useState<Interview | null>(null);
  const isAdmin = useRole() === "admin";
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (sp.get("new") === "1") setCreating(true);
  }, [sp]);

  const all = list.data?.items ?? [];
  const tabs: Record<Tab, Interview[]> = {
    active: all.filter(isActive).sort((a, b) => +new Date(a.scheduledAt ?? a.windowStart) - +new Date(b.scheduledAt ?? b.windowStart)),
    previous: all.filter((i) => !isActive(i)).sort((a, b) => +new Date(b.scheduledAt ?? b.windowStart) - +new Date(a.scheduledAt ?? a.windowStart)),
    all,
  };
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tabs[tab].filter((i) => !needle || [i.company, i.jobTitle, i.profile?.label, i.caller?.name].some((s) => (s ?? "").toLowerCase().includes(needle)));
  }, [tab, q, list.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const { pageRows, pager } = useClientPaging(rows, `my-interviews-${tab}`);
  const canCancel = (i: Interview) => isActive(i) && !reportDue(i);
  const menuItems = (i: Interview): ActionItem[] => [
    { label: "View details", icon: Eye, onSelect: () => setView(i) },
    "divider",
    ...(canCancel(i) ? [{ label: "Cancel request", icon: CircleX, danger: true, onSelect: () => setCancel(i) }] : []),
    ...(isAdmin ? [{ label: "Delete", icon: Trash, danger: true, onSelect: () => setRemove(i) }] : []),
  ];

  // Deep link from emails: /interviews?id=...
  useEffect(() => {
    const id = sp.get("id");
    const found = id && list.data?.items.find((x) => x._id === id);
    if (found) {
      setView(found);
      setTab(isActive(found) ? "active" : "previous");
    }
  }, [sp, list.data]);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Interview requests"
        subtitle="Your interview requests and their status. Follow-up steps for the same company and role automatically go to the caller who did the earlier interview."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus />
            New interview request
          </button>
        }
      />
      {creating && (
        <Modal open wide onClose={() => setCreating(false)} title="New interview request">
          <RequestForm
            options={options.data ?? undefined}
            loading={options.loading}
            onCancel={() => setCreating(false)}
            onCreated={(msg) => {
              setCreating(false);
              toast.success(...noticeParts(msg));
              setTab("active");
              list.reload();
            }}
          />
        </Modal>
      )}
      <div>
        <div className="card overflow-hidden p-0">
          <div className="card-header">
            <Segmented<Tab>
              label="Requests"
              value={tab}
              onChange={setTab}
              options={[
                { value: "active", label: "Active", count: tabs.active.length },
                { value: "previous", label: "Previous", count: tabs.previous.length },
                { value: "all", label: "All", count: tabs.all.length },
              ]}
            />
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" aria-label="Search" placeholder="Search company, role, caller" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {list.loading && !list.data ? (
            <TableSkeleton rows={6} cols={6} />
          ) : !rows.length ? (
            <EmptyState
              icon={Inbox}
              title={tab === "active" ? "No active interview requests." : tab === "previous" ? "No previous interviews yet." : "No interview requests yet."}
              action={
                tab !== "previous" && (
                  <button className="btn btn-secondary" onClick={() => setCreating(true)}>
                    <Plus />
                    Request an interview
                  </button>
                )
              }
            />
          ) : (
            <>
            {/* Phones: the same rows as stacked cards. */}
            <ul className="divide-y divide-slate-200 md:hidden">
              {pageRows.map((i) => {
                const dl = ["pending", "open"].includes(i.status) ? deadlineLabel(i.scheduleBy) : null;
                return (
                  <li key={i._id} className="space-y-2 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{i.company}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{[i.jobTitle, i.profile?.label ?? i.profileLabel].filter(Boolean).join(" · ")}</div>
                      </div>
                      <InterviewStatus i={i} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                      <StepBar step={i.step} />
                      {i.lockedCaller && <LockBadge />}
                      <span className="tabular-nums">
                        {i.scheduledAt && (i.status === "scheduled" || i.status === "completed") ? (
                          <span className="font-medium text-emerald-700">{fmtDayTime(i.scheduledAt)}</span>
                        ) : (
                          <span className="text-slate-700">
                            {fmtRequested(i)} <span className="text-xs text-slate-400">requested</span>
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-[13px] text-slate-600">
                      <span className="text-slate-500">Caller:</span>{" "}
                      {i.caller?.name ?? (i.status === "open" ? <span className="text-indigo-700">Finding a caller…</span> : <span className="text-slate-400">—</span>)}
                    </div>
                    {dl && <div className={`text-xs tabular-nums ${dl.late ? "text-rose-600" : "text-slate-500"}`}>{dl.text}</div>}
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {i.status === "completed" && i.report?.recordingUrl && (
                        <a href={i.report.recordingUrl} target="_blank" rel="noreferrer" className="link mr-auto inline-flex items-center gap-1 text-xs">
                          <Video className="size-3.5" />
                          Recording
                        </a>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => setView(i)}>
                        View
                      </button>
                      {canCancel(i) && (
                        <button className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setCancel(i)}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>When</th>
                  <th>Company</th>
                  <th>Caller</th>
                  <th>Status</th>
                  <th className="actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((i) => {
                  const dl = ["pending", "open"].includes(i.status) ? deadlineLabel(i.scheduleBy) : null;
                  return (
                    <tr key={i._id} className="cursor-pointer" onClick={() => setView(i)}>
                      <td className="whitespace-nowrap">
                        <StepBar step={i.step} />
                        {i.lockedCaller && (
                          <div className="mt-1.5">
                            <LockBadge />
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        {i.scheduledAt && (i.status === "scheduled" || i.status === "completed") ? (
                          <span className="font-medium text-emerald-700">{fmtDayTime(i.scheduledAt)}</span>
                        ) : (
                          <>
                            <span className="text-slate-700">{fmtRequested(i)}</span>
                            <div className="mt-0.5 text-xs text-slate-400">requested</div>
                          </>
                        )}
                      </td>
                      <td className="min-w-[12rem]">
                        <div className="font-medium text-slate-900">{i.company}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{[i.jobTitle, i.profile?.label ?? i.profileLabel].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="whitespace-nowrap">
                        {i.caller?.name ?? (i.status === "open" ? <span className="text-indigo-700">Finding a caller…</span> : <span className="text-slate-400">—</span>)}
                      </td>
                      <td>
                        <InterviewStatus i={i} />
                        {dl && <div className={`mt-1 text-xs tabular-nums ${dl.late ? "text-rose-600" : "text-slate-500"}`}>{dl.text}</div>}
                        {i.status === "completed" && i.report?.recordingUrl && (
                          <a href={i.report.recordingUrl} target="_blank" rel="noreferrer" className="link mt-1.5 inline-flex items-center gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
                            <Video className="size-3.5" />
                            Recording
                          </a>
                        )}
                      </td>
                      <td className="actions">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setView(i)} aria-label={`View ${i.company}`} title="View">
                            <Eye />
                          </button>
                          {(canCancel(i) || isAdmin) && <ActionMenu items={menuItems(i)} label={`More actions for ${i.company}`} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </>
          )}
          {!!rows.length && <div className="border-t border-slate-200 px-4 pb-3">{pager}</div>}
        </div>
      </div>

      {view && (
        <Modal open wide onClose={() => setView(null)} title={`Step ${view.step} · ${view.company} · ${view.profile?.label ?? view.profileLabel}`}>
          <InterviewDetail i={view} />
          {isAdmin && (
            <div className="card-footer -mx-5 -mb-5 mt-5">
              <button className="btn btn-danger" onClick={() => setRemove(view)}>
                Delete
              </button>
            </div>
          )}
        </Modal>
      )}
      {remove && (
        <DeleteDialog
          i={remove}
          onClose={() => setRemove(null)}
          onDone={(m) => {
            setRemove(null);
            setView(null);
            toast.success(...noticeParts(m));
            list.reload();
          }}
        />
      )}
      {cancel && (
        <CancelDialog
          i={cancel}
          onClose={() => setCancel(null)}
          onDone={(m) => {
            setCancel(null);
            toast.success(...noticeParts(m));
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function RequestForm({
  options,
  loading,
  onCreated,
  onCancel,
}: {
  options?: Options;
  loading: boolean;
  onCreated: (msg: string) => void;
  onCancel: () => void;
}) {
  const empty = {
    profileId: "",
    callerId: "",
    applicationId: "",
    company: "",
    jobTitle: "",
    step: "1",
    mode: "exact" as "exact" | "range",
    start: "",
    end: "",
    duration: "60",
    notes: "",
  };
  const [f, setF] = useState(empty);
  const [shots, setShots] = useState<{ url: string; publicId: string }[]>([]);
  const [chain, setChain] = useState<Chain | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const profiles = options?.profiles ?? [];
  const profile = profiles.find((p) => p.id === f.profileId);
  useEffect(() => {
    if (!f.profileId && profiles.length) setF((x) => ({ ...x, profileId: profiles[0].id }));
  }, [profiles, f.profileId]);
  useEffect(() => {
    setF((x) => ({
      ...x,
      callerId: profile?.callers.length === 1 ? profile.callers[0].id : profile?.callers.some((c) => c.id === x.callerId) ? x.callerId : "",
      applicationId: "",
    }));
  }, [f.profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial or follow-up? Look up earlier interviews for this profile + company + role.
  useEffect(() => {
    if (!f.profileId || !f.company.trim() || !f.jobTitle.trim()) return setChain(null);
    setChecking(true);
    const t = setTimeout(() => {
      api<Chain>(`/api/interviews/chain?${new URLSearchParams({ profile: f.profileId, company: f.company, jobTitle: f.jobTitle })}`)
        .then((c) => {
          setChain(c);
          setF((x) => ({ ...x, step: String(c.nextStep), ...(c.locked && c.lead ? { callerId: c.lead.id } : {}) }));
        })
        .catch(() => setChain(null))
        .finally(() => setChecking(false));
    }, 400);
    return () => clearTimeout(t);
  }, [f.profileId, f.company, f.jobTitle]);

  // Only submitted applications: the interview is for a resume that was actually sent.
  const staff = useRole() !== "bidder";
  const apps = useAsync(
    () =>
      f.profileId
        ? api<{ items: AppOpt[] }>(`${staff ? "/api/admin/applications" : "/api/applications"}?profile=${f.profileId}&status=submitted&limit=all`).then(
            (r) => r.items,
          )
        : Promise.resolve([]),
    [f.profileId, staff],
  );
  const selectedApp = apps.data?.find((a) => a._id === f.applicationId);
  const locked = !!chain?.locked && !!chain.lead;
  const callers = locked && chain?.lead ? [{ id: chain.lead.id, name: chain.lead.name }] : (profile?.callers ?? []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/interviews", {
        method: "POST",
        json: {
          profileId: f.profileId,
          callerId: f.callerId,
          applicationId: f.applicationId || undefined,
          company: f.company,
          jobTitle: f.jobTitle,
          step: Number(f.step),
          mode: f.mode,
          windowStart: f.start ? fromTzInput(f.start).toISOString() : "",
          windowEnd: f.mode === "range" && f.end ? fromTzInput(f.end).toISOString() : undefined,
          timezone: getViewerTz(),
          durationMinutes: Number(f.duration),
          notes: f.notes,
          screenshots: shots,
        },
      });
      const who = callers.find((c) => c.id === f.callerId)?.name ?? "The caller";
      setF({ ...empty, profileId: f.profileId, callerId: profile?.callers.length === 1 ? f.callerId : "" });
      setShots([]);
      setChain(null);
      onCreated(`Step ${f.step} interview request sent. ${who} has been emailed.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !options) return <CardSkeleton lines={5} />;
  if (!profiles.length)
    return (
      <div className="space-y-4">
        <Alert kind="info">No profiles are assigned to you yet. Ask an administrator to assign one before requesting an interview.</Alert>
        <div className="flex justify-end">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    );

  return (
    <form className="space-y-5" onSubmit={submit}>
      {error && <Alert>{error}</Alert>}
      <div>
        <label className="label">Profile *</label>
        <select className="input" value={f.profileId} onChange={(e) => setF({ ...f, profileId: e.target.value })}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="iv-app">
          Submitted application *
        </label>
        <SearchSelect
          id="iv-app"
          required
          value={f.applicationId}
          disabled={apps.loading || !apps.data?.length}
          placeholder={apps.loading ? "Loading…" : apps.data?.length ? "Choose the application this interview is for" : "No submitted applications for this profile"}
          searchPlaceholder="Find by company, role or date…"
          emptyText="No submitted application matches"
          options={(apps.data ?? []).map((a) => ({
            value: a._id,
            label: `${a.company} · ${a.jobTitle}`,
            hint: [staff && a.user?.name, a.submittedAt && `submitted ${fmtDate(a.submittedAt)}`].filter(Boolean).join(" · ") || undefined,
          }))}
          onChange={(v) => {
            const a = apps.data?.find((x) => x._id === v);
            setF({ ...f, applicationId: v, company: a?.company ?? "", jobTitle: a?.jobTitle ?? "" });
          }}
        />
        <div className="hint">The caller gets this application&apos;s resume and job description to prepare for the interview.</div>
      </div>
      {selectedApp && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">Company</div>
            <div className="truncate font-medium">{selectedApp.company}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-500">Role</div>
            <div className="truncate font-medium">{selectedApp.jobTitle}</div>
          </div>
          {selectedApp.jobUrl && (
            <a href={selectedApp.jobUrl} target="_blank" rel="noreferrer" className="link inline-flex sm:col-span-2 items-center gap-1 justify-self-start text-xs">
              Job posting <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {/* Initial or follow-up */}
      <div className={`rounded-lg border px-3.5 py-3 ${chain?.followUp ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex items-center justify-between gap-2">
          <label className="label mb-0" htmlFor="iv-step">
            Interview step *
          </label>
          {checking ? <Spinner className="h-3.5 w-3.5 text-slate-400" /> : <StepBar step={Number(f.step)} label={false} />}
        </div>
        <select id="iv-step" className="input mt-2" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value })}>
          {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
            <option key={n} value={n} disabled={!!chain?.previous.some((p) => p.step === n)}>
              Step {n}
              {n === 1 ? " · initial interview" : " · follow-up"}
              {chain?.previous.some((p) => p.step === n) ? " (already requested)" : ""}
            </option>
          ))}
        </select>
        {!chain ? (
          <div className="hint">Choose the application to check for earlier interviews.</div>
        ) : !chain.followUp ? (
          <div className="hint">No earlier interviews for this role: this is the initial interview.</div>
        ) : (
          <div className="mt-3 space-y-1.5 border-t border-indigo-200 pt-2.5">
            <div className="text-xs font-medium text-indigo-700">Follow-up: earlier interviews for this role</div>
            {chain.previous.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs">
                <StepBar step={p.step} size="xs" />
                <span className="min-w-0 truncate text-slate-600 tabular-nums">
                  {p.caller ?? "no caller yet"}
                  {p.scheduledAt ? ` · ${fmtDayTime(p.scheduledAt)}` : ""}
                </span>
                <span className="shrink-0 text-slate-500">{p.outcome ? OUTCOME_LABEL[p.outcome] : p.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="label">Caller *</label>
        {locked ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-medium">
              <LockBadge /> {chain!.lead!.name}
            </div>
            <div className="mt-1 text-xs">
              {chain!.lead!.name} conducted the earlier interview for this role, so they must conduct this one too. It can&apos;t be sent to another caller.
            </div>
          </div>
        ) : profile && !profile.callers.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            No caller is assigned to this profile yet. Ask an admin to assign one on the Assignments page.
          </div>
        ) : (
          <>
            <select className="input" required value={f.callerId} onChange={(e) => setF({ ...f, callerId: e.target.value })}>
              <option value="">Choose a caller</option>
              {callers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {chain?.lead && !chain.lead.active && (
              <div className="hint text-amber-700">
                {chain.lead.name} conducted the earlier interview but is no longer an active caller. Choose another caller.
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <label className="label">When *</label>
        <div className="segmented mb-2 flex w-full" role="group" aria-label="Time mode">
          {(["exact", "range"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={f.mode === m} onClick={() => setF({ ...f, mode: m })} className="flex-1 justify-center">
              {m === "exact" ? "Specific time" : "Date / time range"}
            </button>
          ))}
        </div>
        <div className={`grid gap-2 ${f.mode === "range" ? "grid-cols-1 sm:grid-cols-2" : ""}`}>
          <input
            className="input"
            type="datetime-local"
            required
            aria-label={f.mode === "range" ? "From" : "Interview time"}
            value={f.start}
            onChange={(e) => setF({ ...f, start: e.target.value })}
          />
          {f.mode === "range" && (
            <input
              className="input"
              type="datetime-local"
              required
              aria-label="To"
              min={f.start}
              value={f.end}
              onChange={(e) => setF({ ...f, end: e.target.value })}
            />
          )}
        </div>
        <div className="hint">
          Times in {zoneName(getViewerTz())}.
        </div>
      </div>
      <div className="sm:max-w-xs">
        <label className="label">Interview length</label>
        <select className="input" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })}>
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Interview email screenshot *</label>
        <ScreenshotDrop value={shots} onChange={setShots} />
      </div>
      <div>
        <label className="label">Notes for the caller</label>
        <textarea
          className="input min-h-20"
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
          placeholder="Interviewer name, format, anything the caller should know"
        />
      </div>
      <div className="card-footer -mx-5 -mb-5 mt-6">
        {(!shots.length || !f.applicationId) && (
          <div className="mr-auto basis-full text-xs text-slate-500 sm:basis-auto">
            {!f.applicationId ? "Choose the submitted application" : "Attach the interview email screenshot"} to send.
          </div>
        )}
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || checking || !shots.length || !f.callerId || !f.applicationId}>
          {busy ? <Spinner /> : <Send />} Send step {f.step} interview request
        </button>
      </div>
    </form>
  );
}
