"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, CalendarClock, Clock, FileText, Mail, TriangleAlert, User } from "lucide-react";
import { Alert, api, fmtDate, Spinner, SkeletonText, useAsync } from "./ui";
import { StepBar, type Interview } from "./interviews";
import SearchSelect from "./SearchSelect";
import { fromTzInput, getViewerTz, timeZoneChoices, toTzInput, tzParts, zoneName } from "@/lib/viewerTz";

type Options = {
  me: { id: string; role: string };
  profiles: { id: string; label: string; callers: { id: string; name: string; tz?: string }[] }[];
  /** Admins only: every active caller (others book the profile's assigned callers). */
  callers: { id: string; name: string; tz?: string }[];
};
type AppOpt = { _id: string; company: string; jobTitle: string; jobUrl?: string; submittedAt?: string; user?: { name: string } | null };
type Chain = {
  previous: { id: string; step: number; status: string; caller: string | null }[];
  nextStep: number;
  lead: { id: string; name: string; active: boolean } | null;
};

/**
 * Book an interview straight onto a caller's calendar: profile, role, time and caller. The caller is emailed on save.
 * Admins choose any caller; profile managers and callers choose among the profile's assigned callers.
 * `day` (YYYY-MM-DD) pre-fills the date when opened from a calendar day.
 * `interview` (admins): edit that interview instead of creating one.
 */
export default function ScheduleInterviewForm({
  day,
  interview,
  onCancel,
  onDone,
}: {
  day?: string;
  interview?: Interview;
  onCancel: () => void;
  onDone: (msg: string) => void;
}) {
  const options = useAsync(() => api<Options>("/api/interviews/schedule"), []);
  const editing = !!interview;
  const [f, setF] = useState(() =>
    interview
      ? {
          profileId: interview.profile?._id ?? "",
          applicationId: interview.application?._id ?? "",
          company: interview.company,
          jobTitle: interview.jobTitle,
          step: String(interview.step ?? 1),
          callerId: interview.caller?._id ?? "",
          start: toTzInput(interview.scheduledAt ?? interview.windowStart),
          tz: getViewerTz(),
          duration: String(interview.durationMinutes ?? 60),
          callerNote: interview.callerNote ?? "",
          notes: interview.notes ?? "",
        }
      : {
          profileId: "",
          applicationId: "",
          company: "",
          jobTitle: "",
          step: "1",
          callerId: "",
          start: day ? `${day}T09:00` : "",
          tz: getViewerTz(),
          duration: "60",
          callerNote: "",
          notes: "",
        },
  );
  // While editing, keep the saved step / caller until the company or role is changed.
  const initialRole = useRef(interview ? `${interview.company}|${interview.jobTitle}` : "");
  const [chain, setChain] = useState<Chain | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const profiles = options.data?.profiles ?? [];
  const profile = profiles.find((p) => p.id === f.profileId);
  useEffect(() => {
    if (!f.profileId && profiles.length) setF((x) => ({ ...x, profileId: profiles[0].id }));
  }, [profiles, f.profileId]);

  const apps = useAsync(
    () =>
      f.profileId
        ? api<{ items: AppOpt[] }>(`/api/interviews/schedule?profile=${f.profileId}`).then((r) => r.items)
        : Promise.resolve([] as AppOpt[]),
    [f.profileId],
  );

  // Next step for this profile + company + role, and the caller who did the earlier interviews.
  useEffect(() => {
    if (!f.profileId || !f.company.trim() || !f.jobTitle.trim()) return setChain(null);
    const t = setTimeout(() => {
      const q = new URLSearchParams({ profile: f.profileId, company: f.company, jobTitle: f.jobTitle, ...(interview ? { exclude: interview._id } : {}) });
      api<Chain>(`/api/interviews/chain?${q}`)
        .then((c) => {
          setChain(c);
          if (editing && `${f.company}|${f.jobTitle}` === initialRole.current) return;
          const canPick = isAdmin || !!profile?.callers.some((p) => p.id === c.lead?.id);
          setF((x) => ({ ...x, step: String(c.nextStep), callerId: c.lead?.active && canPick ? c.lead.id : x.callerId }));
        })
        .catch(() => setChain(null));
    }, 400);
    return () => clearTimeout(t);
  }, [f.profileId, f.company, f.jobTitle]);

  // Callers assigned to the profile first, then (admins only) everyone else.
  const me = options.data?.me;
  const isAdmin = me?.role === "admin";
  const assigned = new Set(profile?.callers.map((c) => c.id));
  const allCallers = isAdmin ? (options.data?.callers ?? []) : (profile?.callers ?? []);
  const onProfile = allCallers.filter((c) => assigned.has(c.id));
  const others = allCallers.filter((c) => !assigned.has(c.id));
  const callerName = allCallers.find((c) => c.id === f.callerId)?.name;

  // Time zone the date & time is entered in (starts with the zone the page shows: GMT-04:00 by default).
  const zones = useMemo(() => timeZoneChoices(), []);
  // The same moment in the zone the page shows, when a different zone is chosen.
  const inMyZone = useMemo(() => {
    if (!f.start || f.tz === getViewerTz()) return "";
    const p = tzParts(fromTzInput(f.start, f.tz));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.min)} (${zoneName(getViewerTz())})`;
  }, [f.start, f.tz]);

  // The chosen caller's own time zone: show the time as they will see it (when it differs).
  const callerTz = allCallers.find((c) => c.id === f.callerId)?.tz ?? profile?.callers.find((c) => c.id === f.callerId)?.tz;
  const callerLocal = useMemo(() => {
    if (!f.start || !callerTz || callerTz === f.tz) return "";
    const p = tzParts(fromTzInput(f.start, f.tz), callerTz);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.min)} ${zoneName(callerTz)}`;
  }, [f.start, f.tz, callerTz]);

  // A caller scheduling for one of their profiles starts with themselves selected.
  useEffect(() => {
    if (me?.role === "caller" && profile?.callers.some((c) => c.id === me.id)) setF((x) => (x.callerId ? x : { ...x, callerId: me.id }));
  }, [me, profile]);
  const self = !!me && f.callerId === me.id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
          profileId: f.profileId,
          applicationId: f.applicationId || undefined,
          company: f.company,
          jobTitle: f.jobTitle,
          step: Number(f.step),
          callerId: f.callerId,
          scheduledAt: f.start ? fromTzInput(f.start, f.tz).toISOString() : "",
          timezone: f.tz,
          durationMinutes: Number(f.duration),
          callerNote: f.callerNote,
          notes: f.notes,
      };
      if (interview) {
        const r = await api<{ caller: string }>(`/api/interviews/${interview._id}`, { method: "PATCH", json: { action: "edit", ...body } });
        onDone(`Schedule updated. ${r.caller} has been emailed.`);
        return;
      }
      const r = await api<{ caller: string; emailed: boolean }>("/api/interviews/schedule", { method: "POST", json: body });
      onDone(r.emailed ? `Step ${f.step} interview scheduled. ${r.caller} has been emailed.` : `Step ${f.step} interview added to your schedule.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (options.loading && !options.data) return <SkeletonText lines={5} />;

  return (
    <form className="space-y-5" onSubmit={submit}>
      {error && <Alert>{error}</Alert>}

      <fieldset className="space-y-4">
        <legend className="sr-only">Interview</legend>
        <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
          <Briefcase className="size-3.5 text-slate-400" aria-hidden />
          Interview
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="as-profile">
              Profile *
            </label>
            <select
              id="as-profile"
              className="input"
              disabled={editing}
              value={f.profileId}
              onChange={(e) => setF({ ...f, profileId: e.target.value, applicationId: "", company: "", jobTitle: "" })}
            >
              {editing && !profile && <option value={f.profileId}>{interview?.profile?.label ?? interview?.profileLabel}</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="label" htmlFor="as-step">
                Interview step *
              </label>
              <div className="mb-1.5">
                <StepBar step={Number(f.step)} label={false} />
              </div>
            </div>
            <select id="as-step" className="input" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value })}>
              {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                <option key={n} value={n} disabled={!!chain?.previous.some((p) => p.step === n)}>
                  Step {n}
                  {n === 1 ? " · initial interview" : " · follow-up"}
                  {chain?.previous.some((p) => p.step === n) ? " (already exists)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="as-app">
            Submitted application
          </label>
          <SearchSelect
            id="as-app"
            value={f.applicationId}
            disabled={apps.loading}
            placeholder={apps.loading ? "Loading…" : "None: enter the company and role below"}
            emptyOption="None: enter the company and role below"
            searchPlaceholder="Find by company, role, bidder or date…"
            emptyText="No submitted application matches"
            options={(apps.data ?? []).map((a) => ({
              value: a._id,
              label: `${a.company} · ${a.jobTitle}`,
              hint: [a.user?.name, a.submittedAt && `submitted ${fmtDate(a.submittedAt)}`].filter(Boolean).join(" · ") || undefined,
            }))}
            onChange={(v) => {
              const a = apps.data?.find((x) => x._id === v);
              setF({ ...f, applicationId: v, company: a?.company ?? "", jobTitle: a?.jobTitle ?? "" });
            }}
          />
          <p className="hint">Optional. With an application, the caller can download its resume and job description.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="as-company">
              Company *
            </label>
            <input
              id="as-company"
              className="input read-only:bg-slate-50"
              required
              readOnly={!!f.applicationId}
              value={f.company}
              onChange={(e) => setF({ ...f, company: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="as-role">
              Role *
            </label>
            <input
              id="as-role"
              className="input read-only:bg-slate-50"
              required
              readOnly={!!f.applicationId}
              value={f.jobTitle}
              onChange={(e) => setF({ ...f, jobTitle: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="divider space-y-4 pt-5">
        <legend className="sr-only">Caller and time</legend>
        <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
          <CalendarClock className="size-3.5 text-slate-400" aria-hidden />
          Caller &amp; time
        </div>
        <div>
          <label className="label" htmlFor="as-caller">
            Caller *
          </label>
          <select id="as-caller" className="input" required value={f.callerId} onChange={(e) => setF({ ...f, callerId: e.target.value })}>
            <option value="">Choose a caller</option>
            {!!onProfile.length && (
              <optgroup label="Assigned to this profile">
                {onProfile.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {!!others.length && (
              <optgroup label={onProfile.length ? "Other callers" : "Callers"}>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {chain?.lead?.active && (
            <p className={`hint ${f.callerId === chain.lead.id ? "" : "flex items-start gap-1.5 text-amber-700"}`}>
              {f.callerId !== chain.lead.id && <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
              {f.callerId === chain.lead.id
                ? `${chain.lead.name} conducted the earlier interview for this role.`
                : `${chain.lead.name} conducted the earlier interview for this role. Choosing someone else overrides the follow-up rule.`}
            </p>
          )}
          {!allCallers.length && (
            <p className="hint flex items-start gap-1.5 text-amber-700">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {isAdmin ? "There are no active callers yet. Add one on Users & Bidders." : "No caller is assigned to this profile yet. Ask an admin to assign one."}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr_0.8fr]">
          <div>
            <label className="label" htmlFor="as-when">
              Date &amp; time *
            </label>
            <input id="as-when" className="input tabular-nums" type="datetime-local" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="as-tz">
              Time zone *
            </label>
            <SearchSelect
              id="as-tz"
              required
              value={f.tz}
              options={zones}
              onChange={(tz) => setF({ ...f, tz })}
              searchPlaceholder="Find a time zone, e.g. GMT-05, Chicago, London…"
              emptyText="No time zone matches"
            />
          </div>
          <div>
            <label className="label" htmlFor="as-length">
              Interview length
            </label>
            <select id="as-length" className="input" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>
        </div>
        {(inMyZone || callerLocal) && (
          <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            {inMyZone && (
              <div className="flex items-start gap-1.5">
                <Clock className="mt-px size-3.5 shrink-0 text-slate-400" aria-hidden />
                <span>
                  That is <span className="font-medium text-slate-700 tabular-nums">{inMyZone}</span>.
                </span>
              </div>
            )}
            {callerLocal && (
              <div className="flex items-start gap-1.5">
                <User className="mt-px size-3.5 shrink-0 text-slate-400" aria-hidden />
                <span>
                  For {callerName}: <span className="font-medium text-slate-700 tabular-nums">{callerLocal}</span> (their time zone; the email shows this time).
                </span>
              </div>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="divider space-y-4 pt-5">
        <legend className="sr-only">Details for the caller</legend>
        <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
          <FileText className="size-3.5 text-slate-400" aria-hidden />
          Details for the caller
        </div>
        <div>
          <label className="label" htmlFor="as-link">
            Meeting link / call details
          </label>
          <input
            id="as-link"
            className="input"
            value={f.callerNote}
            onChange={(e) => setF({ ...f, callerNote: e.target.value })}
            placeholder="Zoom / Teams link, phone number…"
          />
        </div>
        <div>
          <label className="label" htmlFor="as-notes">
            Notes for the caller
          </label>
          <textarea
            id="as-notes"
            className="input min-h-20"
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            placeholder="Interviewer name, format, anything the caller should know"
          />
        </div>
      </fieldset>

      <div className="-mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3">
        <span className="flex w-full items-center gap-1.5 text-xs text-slate-500 sm:mr-auto sm:w-auto">
          <Mail className="size-3.5 text-slate-400" aria-hidden />
          {self ? "It goes straight onto your schedule." : callerName ? `${callerName} will be emailed.` : "The caller is emailed automatically."}
        </span>
        <button type="button" className="btn btn-secondary flex-1 sm:flex-none" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary flex-1 sm:flex-none" disabled={busy || !f.callerId || !f.start || !f.company.trim() || !f.jobTitle.trim()}>
          {busy && <Spinner />} {editing ? "Save changes" : self ? "Add to my schedule" : "Schedule & email caller"}
        </button>
      </div>
    </form>
  );
}
