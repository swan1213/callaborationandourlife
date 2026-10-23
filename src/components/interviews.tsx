"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileArchive, FileText, ImagePlus, Lock, MessageSquare, Plus, Video, X } from "lucide-react";
import Lightbox, { type Slide } from "./Lightbox";
import { Alert, api, Badge, downloadFile, Modal, Spinner, useAsync } from "./ui";
import { useToast } from "./Alerts";
import { fromTzInput, fromWallTime, toTzInput, tzAbbr, tzDayKey, tzParts } from "@/lib/viewerTz";

/* ------------------------------------------------------------------ types */

type Ref = { _id: string; name: string; email?: string } | null;
export type Interview = {
  _id: string;
  profile: { _id: string; label: string; fullName?: string } | null;
  profileLabel: string;
  requestedBy: Ref;
  caller: Ref;
  requestedCaller?: Ref;
  company: string;
  jobTitle: string;
  step: number;
  lockedCaller?: boolean;
  application?: { _id: string; company: string; jobTitle: string; jobUrl?: string; status?: string } | null;
  report?: {
    outcome?: Outcome;
    recordingUrl?: string;
    summary?: string;
    interviewerName?: string;
    interviewerCallerId?: string;
    feedbackUpdatedAt?: string;
    reportedAt?: string;
    reportedByName?: string;
  } | null;
  mode: "exact" | "range";
  windowStart: string;
  windowEnd?: string | null;
  timezone: string;
  durationMinutes: number;
  notes: string;
  screenshots: { url: string; publicId: string }[];
  status: "pending" | "open" | "scheduled" | "completed" | "cancelled";
  scheduledAt?: string | null;
  callerNote: string;
  cancelReason?: string;
  scheduleBy: string;
  overdueNotifiedAt?: string | null;
  transfers: { from: string; fromName: string; reason: string; at: string }[];
  events: { at: string; byName: string; action: string; note?: string }[];
  comments?: { _id?: string; at: string; byName: string; role: string; text: string }[];
  deletedAt?: string | null;
  deletedByName?: string;
  deleteReason?: string;
  statusBeforeDelete?: string;
  createdAt: string;
};

export type Outcome = "passed" | "failed" | "waiting" | "no_show";
export const OUTCOME_LABEL: Record<Outcome, string> = {
  passed: "Passed",
  failed: "Not moving forward",
  waiting: "Waiting for decision",
  no_show: "No-show",
};
const OUTCOME_BADGE: Record<Outcome, string> = { passed: "approved", failed: "rejected", waiting: "pending", no_show: "suspended" };

export const STATUS_LABEL: Record<Interview["status"], string> = {
  pending: "Waiting for caller",
  open: "Open to all callers",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Scheduled interview whose time has come and whose result isn't reported yet. */
export const reportDue = (i: Interview) => i.status === "scheduled" && !!i.scheduledAt && new Date(i.scheduledAt).getTime() <= Date.now();

export function InterviewStatus({ i }: { i: Interview }) {
  if (i.deletedAt) return <Badge value="rejected" label="Deleted" />;
  if (reportDue(i)) return <Badge value="pending" label="Report due" />;
  if (i.status === "completed" && i.report?.outcome) return <Badge value={OUTCOME_BADGE[i.report.outcome]} label={`Completed · ${OUTCOME_LABEL[i.report.outcome]}`} />;
  return <Badge value={i.status} label={STATUS_LABEL[i.status]} />;
}

/* ------------------------------------------------------------ steps */

export const STEP_COLORS = ["bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-fuchsia-500", "bg-pink-500", "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

/** Step number with one coloured segment per step (step 3 → three segments). */
export function StepBar({ step, size = "md", label = true }: { step: number; size?: "xs" | "md"; label?: boolean }) {
  const n = Math.max(1, Math.min(10, step || 1));
  const seg = size === "xs" ? "h-1 w-1.5" : "h-1.5 w-3";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Step ${n} of the interview process${n === 1 ? " (initial)" : " (follow-up)"}`}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {STEP_COLORS.slice(0, n).map((c, k) => (
          <span key={k} className={`${seg} rounded-full ${c}`} />
        ))}
      </span>
      {label && <span className={`font-medium tabular-nums ${size === "xs" ? "text-[10px]" : "text-xs"} text-slate-700`}>Step {n}</span>}
    </span>
  );
}

export function LockBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-700 ring-1 ring-amber-600/20 ring-inset"
      title="Follow-up interview: must be conducted by the caller of the earlier interview; can't be transferred"
    >
      <Lock className="size-3" aria-hidden />
      Follow-up
    </span>
  );
}

/* ----------------------------------------------------------- formatting */

const pad2 = (n: number) => String(n).padStart(2, "0");
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "2025-12-31 (Wed)" in the viewer's time zone. */
export const fmtDay = (d: string | Date) => {
  const x = tzParts(d);
  return `${x.y}-${pad2(x.m)}-${pad2(x.d)} (${WEEKDAY_SHORT[x.wd]})`;
};
/** "14:05" in the viewer's time zone. */
export const fmtTime = (d: string | Date) => {
  const x = tzParts(d);
  return `${pad2(x.h)}:${pad2(x.min)}`;
};
export const fmtDayTime = (d: string | Date) => `${fmtDay(d)} ${fmtTime(d)}`;
const sameDay = (a: Date, b: Date) => tzDayKey(a) === tzDayKey(b);

/** Requested time in the viewer's time zone: "2026-10-02 (Fri) 15:00" or a range. */
export function fmtRequested(i: Pick<Interview, "mode" | "windowStart" | "windowEnd">) {
  if (i.mode !== "range" || !i.windowEnd) return fmtDayTime(i.windowStart);
  const [s, e] = [new Date(i.windowStart), new Date(i.windowEnd)];
  return sameDay(s, e) ? `${fmtDayTime(s)} – ${fmtTime(e)}` : `${fmtDayTime(s)} – ${fmtDayTime(e)}`;
}

/** "2h 15m left" / "overdue by 40m" until the scheduling deadline. */
export function deadlineLabel(scheduleBy: string) {
  const ms = new Date(scheduleBy).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600_000);
  const m = Math.floor((abs % 3600_000) / 60_000);
  const t = h ? `${h}h ${m}m` : `${m}m`;
  return ms >= 0 ? { text: `${t} left to schedule`, late: false } : { text: `Overdue by ${t}`, late: true };
}

/** Re-render every `ms` (for countdowns). */
export function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/* -------------------------------------------------- screenshot uploader */

type Shot = { url: string; publicId: string };
type Sign = { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string };

/** Drag & drop / paste (Ctrl+V anywhere) / browse image uploader straight to Cloudinary. */
export function ScreenshotDrop({ value, onChange, max = 5 }: { value: Shot[]; onChange: (v: Shot[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valueRef = useRef(value);
  valueRef.current = value;

  async function upload(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, max - valueRef.current.length));
    if (!images.length) return;
    setBusy(true);
    setError("");
    try {
      const added: Shot[] = [];
      for (const file of images) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB`);
        const sign = await api<Sign>("/api/cloudinary/sign", { method: "POST" });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("api_key", sign.apiKey);
        fd.append("timestamp", String(sign.timestamp));
        fd.append("folder", sign.folder);
        fd.append("signature", sign.signature);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Upload failed");
        added.push({ url: data.secure_url, publicId: data.public_id });
      }
      onChange([...valueRef.current, ...added]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  const uploadRef = useRef(upload);
  uploadRef.current = upload;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        uploadRef.current(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div>
      <div
        className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition-colors hover:border-slate-400"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(Array.from(e.dataTransfer.files));
        }}
      >
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(Array.from(e.target.files ?? []))} />
        {busy ? (
          <div className="flex items-center justify-center gap-2 py-1.5 text-sm text-slate-500">
            <Spinner className="h-4 w-4" /> Uploading…
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="mb-2 grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500">
              <ImagePlus className="size-4" />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={value.length >= max}>
              Choose image
            </button>
            <div className="mt-1.5 text-xs text-slate-500">
              or drag it here, or press <span className="kbd">Ctrl</span>+<span className="kbd">V</span> to paste a screenshot · up to {max}
            </div>
          </div>
        )}
      </div>
      {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
      {!!value.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {value.map((s) => (
            <div key={s.publicId} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url.replace("/upload/", "/upload/c_fill,w_160,h_110/")} alt="Interview email screenshot" className="h-20 w-28 rounded-md border border-slate-200 object-cover" />
              <button
                type="button"
                className="absolute -top-2 -right-2 grid size-5 cursor-pointer place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-xs transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove screenshot"
                onClick={() => onChange(value.filter((x) => x.publicId !== s.publicId))}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ detail */

export function Screens({ i }: { i: Interview }) {
  const [start, setStart] = useState<number | null>(null);
  if (!i.screenshots.length) return null;
  const slides: Slide[] = i.screenshots.map((s) => ({ url: s.url, caption: `${i.company} · ${i.profile?.label ?? i.profileLabel}` }));
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {i.screenshots.map((s, idx) => (
          <button key={s.publicId} type="button" className="cursor-zoom-in" onClick={() => setStart(idx)} title="View screenshot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url.replace("/upload/", "/upload/c_fill,w_200,h_130/")} alt="Interview email screenshot" className="h-24 w-36 rounded-md border border-slate-200 object-cover transition hover:border-slate-300 hover:ring-2 hover:ring-indigo-500/30" />
          </button>
        ))}
      </div>
      {start !== null && <Lightbox slides={slides} start={start} onClose={() => setStart(null)} />}
    </>
  );
}

const ACTION_LABEL: Record<string, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  edited: "Edited",
  feedback: "Feedback updated",
  deleted: "Deleted",
  restored: "Restored",
  accepted: "Accepted & scheduled",
  rescheduled: "Rescheduled",
  transferred: "Transferred",
  assigned: "Assigned",
  cancelled: "Cancelled",
  reported: "Reported result",
};

/** Resume + job description of the application the interview is for (downloadable by the caller). */
export function Materials({ i }: { i: Interview }) {
  const [busy, setBusy] = useState("");
  const toast = useToast();
  if (!i.application) return null;
  const get = async (type: string, fallback: string) => {
    setBusy(type);
    try {
      await downloadFile(`/api/interviews/${i._id}/documents?type=${type}`, fallback);
    } catch (e) {
      toast.error("Download failed", (e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const icons: Record<string, React.ReactNode> = { "resume-pdf": <Download />, "resume-docx": <FileText />, jd: <FileText />, zip: <FileArchive /> };
  const btn = (type: string, label: string, fallback: string, primary = false) => (
    <button type="button" className={`btn btn-sm ${primary ? "btn-primary" : "btn-secondary"}`} disabled={!!busy} onClick={() => get(type, fallback)}>
      {busy === type ? <Spinner className="h-3 w-3" /> : icons[type]} {label}
    </button>
  );
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3.5 py-2.5">
        <div className="text-[13px] font-medium text-slate-900">Interview materials</div>
        {i.application.jobUrl && (
          <a href={i.application.jobUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-xs">
            Job posting <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="p-3.5">
        <div className="mb-3 text-sm text-slate-600">
          Submitted application: <span className="font-medium text-slate-900">{i.application.company}</span> · {i.application.jobTitle}
        </div>
        <div className="flex flex-wrap gap-2">
          {btn("resume-pdf", "Resume PDF", "resume.pdf", true)}
          {btn("resume-docx", "Resume DOCX", "resume.docx")}
          {btn("jd", "Job description", "job-description.docx")}
          {btn("zip", "All documents (ZIP)", "application.zip")}
        </div>
      </div>
    </div>
  );
}

/** A dialog's "Done. Who was emailed." message as a toast title and description. */
export function noticeParts(msg: string): [string, string?] {
  const k = msg.indexOf(". ");
  if (k < 0) return [msg.replace(/\.$/, "")];
  return [msg.slice(0, k), msg.slice(k + 2)];
}

export function InterviewDetail({ i }: { i: Interview }) {
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-1 gap-0.5 py-2.5 text-sm sm:grid-cols-[9rem_1fr] sm:items-baseline sm:gap-3">
      <dt className="text-[13px] text-slate-500">{k}</dt>
      <dd className="min-w-0 break-words text-slate-900">{v}</dd>
    </div>
  );
  return (
    <div className="space-y-5">
      <dl className="-mt-2 divide-y divide-slate-200">
        {row("Status", <InterviewStatus i={i} />)}
        {row(
          "Step",
          <span className="flex flex-wrap items-center gap-2">
            <StepBar step={i.step} />
            <span className="text-xs text-slate-500">{i.step === 1 ? "Initial interview" : "Follow-up interview"}</span>
            {i.lockedCaller && <LockBadge />}
          </span>
        )}
        {row("Profile", <span className="font-medium">{i.profile?.label ?? i.profileLabel}</span>)}
        {row("Company", i.company || "—")}
        {row("Role", i.jobTitle || "—")}
        {/* Booked straight onto the calendar: no bidder request, so show who scheduled it and skip "Requested". */}
        {row(i.events[0]?.action === "scheduled" ? "Scheduled by" : "Bidder", i.requestedBy?.name ?? "—")}
        {i.events[0]?.action !== "scheduled" &&
          row(
            "Requested",
            <>
              {fmtRequested(i)}
              <span className="text-xs text-slate-400"> · {i.durationMinutes} min</span>
            </>
          )}
        {(i.status === "scheduled" || i.status === "completed") && i.scheduledAt && row(
            "Scheduled",
            <>
              <span className="font-medium text-emerald-700 tabular-nums">{fmtDayTime(i.scheduledAt)}</span>
              <span className="text-xs text-slate-400"> · {i.durationMinutes} min</span>
            </>
          )}
        {row("Caller", i.caller?.name ?? (i.status === "open" ? <span className="text-indigo-700">Open: first caller to accept gets it</span> : "—"))}
        {i.callerNote && row("Caller note", <span className="whitespace-pre-wrap">{i.callerNote}</span>)}
        {i.notes && row("Bidder notes", <span className="whitespace-pre-wrap">{i.notes}</span>)}
        {i.status === "cancelled" && i.cancelReason && row("Cancel reason", i.cancelReason)}
      </dl>
      {i.lockedCaller && i.status !== "completed" && i.status !== "cancelled" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            Step {i.step} follow-up: {i.caller?.name ?? "the caller"} conducted the earlier interview for this role, so they must conduct this one. It can&apos;t be transferred.
          </span>
        </div>
      )}
      {i.status === "completed" && i.report?.outcome && (
        <div className="rounded-lg border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-slate-900">Result</span>
              <InterviewStatus i={i} />
            </div>
            {i.report.recordingUrl && (
              <a href={i.report.recordingUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5 text-[13px]">
                <Video className="size-3.5" /> Recorded video
              </a>
            )}
          </div>
          <div className="space-y-3 p-3.5 text-sm">
            {(i.report.interviewerName || i.report.interviewerCallerId) && (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <div>
                  <span className="text-slate-500">Interviewer:</span> <span className="font-medium">{i.report.interviewerName || "—"}</span>
                </div>
                {i.report.interviewerCallerId && (
                  <div>
                    <span className="text-slate-500">Caller ID:</span> <span className="font-medium tabular-nums">{i.report.interviewerCallerId}</span>
                  </div>
                )}
              </div>
            )}
            {i.report.summary && (
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">Feedback</div>
                <p className="whitespace-pre-wrap text-slate-700">{i.report.summary}</p>
              </div>
            )}
            {i.report.reportedAt && (
              <div className="text-xs text-slate-400">
                Reported by {i.report.reportedByName} · {fmtDayTime(i.report.reportedAt)}
              </div>
            )}
          </div>
        </div>
      )}
      <InterviewHistory i={i} />
      <Materials i={i} />
      <div>
        <div className="mb-2 text-[13px] font-medium text-slate-900">Interview email</div>
        <Screens i={i} />
      </div>
      {!!i.events.length && (
        <div>
          <div className="mb-3 text-[13px] font-medium text-slate-900">Timeline</div>
          <ol className="ml-1 space-y-3 border-l border-slate-200 pl-4">
            {i.events.map((e, idx) => (
              <li key={idx} className="relative text-sm">
                <span className="absolute top-1.5 -left-[21px] size-2 rounded-full border-2 border-surface bg-slate-400 ring-1 ring-slate-300" />
                <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span> <span className="text-slate-600">by {e.byName}</span>
                <span className="text-xs text-slate-400 tabular-nums"> · {fmtDayTime(e.at)}</span>
                {e.note && <div className="mt-0.5 text-xs text-slate-500">{e.note}</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ actions */

async function act(id: string, json: Record<string, unknown>) {
  await api(`/api/interviews/${id}`, { method: "PATCH", json });
}

/** Caller: accept (schedule) a pending/open request, or reschedule a scheduled one. */
export function ScheduleDialog({
  i,
  mode,
  day,
  onClose,
  onDone,
}: {
  i: Interview;
  mode: "accept" | "reschedule";
  /** Dropped on this day ("YYYY-MM-DD", board): keep the time of day, move the date. */
  day?: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [when, setWhen] = useState(() => {
    const base = toTzInput((mode === "reschedule" ? i.scheduledAt : null) ?? i.windowStart);
    return day ? `${day}T${base.slice(11)}` : base;
  });
  const [duration, setDuration] = useState(String(i.durationMinutes));
  const [note, setNote] = useState(i.callerNote ?? "");
  const [step, setStep] = useState(String(i.step ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = when ? fromTzInput(when) : null;
  const outside =
    chosen &&
    (i.mode === "range" && i.windowEnd
      ? chosen < new Date(i.windowStart) || chosen > new Date(i.windowEnd)
      : Math.abs(chosen.getTime() - new Date(i.windowStart).getTime()) > 60_000);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await act(i._id, { action: mode, scheduledAt: fromTzInput(when).toISOString(), durationMinutes: Number(duration), callerNote: note, step: Number(step) });
      onDone(mode === "accept" ? "Interview accepted and added to My Schedule. The bidder, the profile's users and admins were notified." : "Interview rescheduled. Everyone was notified.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={mode === "accept" ? "Accept & schedule interview" : "Reschedule interview"}>
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm">
          <div className="font-medium">
            {i.company} · {i.profile?.label ?? i.profileLabel}
          </div>
          <div className="text-slate-600">Requested: {fmtRequested(i)}</div>
          {i.lockedCaller && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
              <Lock className="size-3 shrink-0" aria-hidden />
              Follow-up of your earlier interview for this role: you must conduct it.
            </div>
          )}
        </div>
        <div>
          <label className="label">Interview step *</label>
          <div className="flex items-center gap-3">
            <select className="input max-w-44" value={step} onChange={(e) => setStep(e.target.value)}>
              {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                <option key={n} value={n}>
                  Step {n}
                  {n === 1 ? " (initial)" : ""}
                </option>
              ))}
            </select>
            <StepBar step={Number(step)} label={false} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
          <div>
            <label className="label">Interview time ({tzAbbr()})</label>
            <input className="input" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div>
            <label className="label">Length</label>
            <select className="input" value={duration} onChange={(e) => setDuration(e.target.value)}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
        </div>
        {outside && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">This is outside the requested {i.mode === "range" ? "window" : "time"}. The bidder will be notified of the new time.</div>}
        <div>
          <label className="label">Note for the bidder (optional)</label>
          <textarea className="input min-h-20" placeholder="Meeting link, phone number, anything they should know" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="card-footer -mx-5 -mb-5 mt-5">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !when}>
            {busy && <Spinner />} {mode === "accept" ? "Accept & schedule" : "Save new time"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Caller: after the interview, report the result and the recorded video. */
export function ReportDialog({ i, onClose, onDone }: { i: Interview; onClose: () => void; onDone: (msg: string) => void }) {
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewerCallerId, setInterviewerCallerId] = useState("");
  const [step, setStep] = useState(String(i.step ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsUrl = outcome !== "no_show";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await act(i._id, { action: "report", outcome, recordingUrl: url, summary, interviewerName, interviewerCallerId, step: Number(step) });
      onDone("Result reported. The bidder, the profile's users and admins were notified.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Report interview result">
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 font-medium">
              {i.company} · {i.profile?.label ?? i.profileLabel}
            </span>
            <StepBar step={Number(step)} />
          </div>
          {i.scheduledAt && <div className="text-slate-600">Held: {fmtDayTime(i.scheduledAt)}</div>}
        </div>
        <div>
          <label className="label">Result *</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
              <label
                key={o}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${outcome === o ? "border-indigo-500 bg-indigo-50 font-medium text-slate-900 ring-1 ring-indigo-500/20" : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                <input type="radio" name="outcome" className="size-4" checked={outcome === o} onChange={() => setOutcome(o)} />
                {OUTCOME_LABEL[o]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Recorded video URL {needsUrl ? "*" : "(optional)"}</label>
          <input className="input" type="url" required={needsUrl} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <InterviewerFields
          name={interviewerName}
          callerId={interviewerCallerId}
          feedback={summary}
          required={needsUrl}
          onName={setInterviewerName}
          onCallerId={setInterviewerCallerId}
          onFeedback={setSummary}
        />
        <div>
          <label className="label">Interview step</label>
          <select className="input max-w-44" value={step} onChange={(e) => setStep(e.target.value)}>
            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
              <option key={n} value={n}>
                Step {n}
                {n === 1 ? " (initial)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="card-footer -mx-5 -mb-5 mt-5">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !outcome || (needsUrl && (!url.trim() || !interviewerName.trim() || !summary.trim()))}>
            {busy && <Spinner />} Submit result
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Interviewer name, caller ID and feedback (report form and the feedback form). */
function InterviewerFields(p: {
  name: string;
  callerId: string;
  feedback: string;
  required: boolean;
  onName: (v: string) => void;
  onCallerId: (v: string) => void;
  onFeedback: (v: string) => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fb-name">
            Interviewer name {p.required ? "*" : ""}
          </label>
          <input id="fb-name" className="input" required={p.required} value={p.name} onChange={(e) => p.onName(e.target.value)} placeholder="Who interviewed at the company" />
        </div>
        <div>
          <label className="label" htmlFor="fb-callerid">
            Caller ID
          </label>
          <input id="fb-callerid" className="input" type="tel" value={p.callerId} onChange={(e) => p.onCallerId(e.target.value)} placeholder="Phone number they called from" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="fb-text">
          Feedback {p.required ? "*" : ""}
        </label>
        <textarea
          id="fb-text"
          className="input min-h-28"
          required={p.required}
          value={p.feedback}
          onChange={(e) => p.onFeedback(e.target.value)}
          placeholder="How it went, questions asked, next steps the company mentioned"
        />
      </div>
    </>
  );
}

/** After the interview: add or update feedback and the interviewer's name / caller ID (its caller or an admin). */
export function FeedbackDialog({ i, onClose, onDone }: { i: Interview; onClose: () => void; onDone: (msg: string) => void }) {
  const [name, setName] = useState(i.report?.interviewerName ?? "");
  const [callerId, setCallerId] = useState(i.report?.interviewerCallerId ?? "");
  const [feedback, setFeedback] = useState(i.report?.summary ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const held = i.report?.outcome !== "no_show";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await act(i._id, { action: "feedback", interviewerName: name, interviewerCallerId: callerId, summary: feedback });
      onDone("Feedback saved.");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Interview feedback">
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm">
          <div className="font-medium">
            Step {i.step ?? 1} · {i.company} · {i.profile?.label ?? i.profileLabel}
          </div>
          {i.scheduledAt && <div className="text-slate-600">Held: {fmtDayTime(i.scheduledAt)}</div>}
        </div>
        <InterviewerFields name={name} callerId={callerId} feedback={feedback} required={held} onName={setName} onCallerId={setCallerId} onFeedback={setFeedback} />
        <div className="card-footer -mx-5 -mb-5 mt-5">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || (held && (!name.trim() || !feedback.trim()))}>
            {busy && <Spinner />} Save feedback
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Earlier and later interviews for the same profile + company + role, with their results and feedback. */
function InterviewHistory({ i }: { i: Interview }) {
  const h = useAsync(() => api<{ history: Interview[] }>(`/api/interviews/${i._id}`).then((r) => r.history ?? []), [i._id]);
  if (!h.data?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
        <span className="text-[13px] font-medium text-slate-900">Other interviews for this role</span>
        <span className="chip tabular-nums">{h.data.length}</span>
      </div>
      <ol className="divide-y divide-slate-200">
        {h.data.map((x) => (
          <li key={x._id} className={`px-3.5 py-2.5 text-sm ${x.step < i.step ? "bg-slate-50" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <StepBar step={x.step} size="xs" />
              <span className="text-xs text-slate-500 tabular-nums">{x.scheduledAt ? fmtDayTime(x.scheduledAt) : `requested ${fmtDayTime(x.windowStart)}`}</span>
              <InterviewStatus i={x} />
              <span className="text-xs text-slate-500">· {x.caller?.name ?? "no caller yet"}</span>
            </div>
            {(x.report?.interviewerName || x.report?.interviewerCallerId) && (
              <div className="mt-1.5 text-xs text-slate-600">
                Interviewer: <span className="font-medium">{x.report?.interviewerName || "—"}</span>
                {x.report?.interviewerCallerId ? ` · Caller ID ${x.report.interviewerCallerId}` : ""}
              </div>
            )}
            {x.report?.summary && <div className="mt-1 text-xs whitespace-pre-wrap text-slate-700">{x.report.summary}</div>}
            {x.report?.recordingUrl && (
              <a href={x.report.recordingUrl} target="_blank" rel="noreferrer" className="link mt-1.5 inline-flex items-center gap-1 text-xs">
                <Video className="size-3.5" /> Recorded video
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Caller: can't conduct it → reason → open to all other callers. */
export function TransferDialog({ i, onClose, onDone }: { i: Interview; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await act(i._id, { action: "transfer", reason });
      onDone("Request transferred. All other callers were emailed; the first to accept gets it.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Transfer to another caller">
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-slate-600">
          The request is removed from your list and emailed to <strong>all other callers</strong>. The first one to accept it takes it over.
        </p>
        <div>
          <label className="label">Why can&apos;t you conduct this interview? *</label>
          <textarea className="input min-h-24" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I already have an interview at that time" />
        </div>
        <div className="card-footer -mx-5 -mb-5 mt-5">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-danger" disabled={busy || reason.trim().length < 3}>
            {busy && <Spinner />} Transfer request
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Requester / staff: cancel the request. */
export function CancelDialog({ i, onClose, onDone }: { i: Interview; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await act(i._id, { action: "cancel", reason });
      onDone("Interview request cancelled.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Cancel interview request">
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label">Reason (optional, shared with the caller)</label>
          <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="card-footer -mx-5 -mb-5 mt-5">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Keep it
          </button>
          <button className="btn btn-danger" disabled={busy}>
            {busy && <Spinner />} Cancel request
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Notes on an interview: admins and the interview's caller can add them (shown in the calendar tooltip too). */
export function InterviewNotes({ i, canAdd, onAdded }: { i: Interview; canAdd: boolean; onAdded?: (comments: NonNullable<Interview["comments"]>) => void }) {
  const [list, setList] = useState(i.comments ?? []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setList(i.comments ?? []), [i]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { comments: next } = await api<{ comments: NonNullable<Interview["comments"]> }>(`/api/interviews/${i._id}`, { method: "PATCH", json: { action: "note", text } });
      setList(next);
      setText("");
      onAdded?.(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!canAdd && !list.length) return null;
  return (
    <div className="mt-5 rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
        <MessageSquare className="size-3.5 text-slate-400" aria-hidden />
        <span className="text-[13px] font-medium text-slate-900">Notes</span>
        <span className="chip tabular-nums">{list.length}</span>
      </div>
      {!!list.length && (
        <ul className="divide-y divide-slate-200">
          {list.map((c, k) => (
            <li key={c._id ?? k} className="px-3.5 py-2.5 text-sm">
              <div className="mb-0.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{c.byName}</span> · {c.role === "caller" ? "Caller" : c.role === "admin" ? "Admin" : c.role} · <span className="tabular-nums">{fmtDayTime(c.at)}</span>
              </div>
              <div className="break-words whitespace-pre-wrap text-slate-800">{c.text}</div>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <form onSubmit={add} className={`space-y-2 p-3.5 ${list.length ? "border-t border-slate-200" : ""}`}>
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <textarea
            aria-label="Add a note"
            className="input min-h-16"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a note: how it went, follow-ups, anything to remember"
          />
          <div className="flex justify-end">
            <button className="btn btn-secondary btn-sm" disabled={busy || !text.trim()}>
              {busy && <Spinner />} Add note
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Admin: delete an interview (scheduled or a request) permanently. */
export function DeleteDialog({ i, onClose, onDone }: { i: Interview; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tellsCaller = !!i.caller && (i.status === "pending" || i.status === "scheduled");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/interviews/${i._id}`, { method: "DELETE", json: { reason } });
      onDone(`Interview deleted: ${i.company} · ${i.profile?.label ?? i.profileLabel}.${tellsCaller ? ` ${i.caller?.name} was emailed.` : ""}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Delete interview">
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm">
          <div className="font-medium">
            Step {i.step ?? 1} · {i.company} · {i.profile?.label ?? i.profileLabel}
          </div>
          <div className="text-slate-600">
            {STATUS_LABEL[i.status]}
            {i.scheduledAt ? ` · ${fmtDayTime(i.scheduledAt)}` : ` · requested ${fmtRequested(i)}`}
            {i.caller ? ` · ${i.caller.name}` : ""}
          </div>
        </div>
        <Alert kind="info">It disappears from every page. Admins can still find it with the Deleted filter and restore it.</Alert>
        {tellsCaller && (
          <div>
            <label className="label" htmlFor="del-reason">
              Reason (optional, emailed to {i.caller?.name})
            </label>
            <textarea id="del-reason" className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="card-footer -mx-5 -mb-5 mt-5">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Keep it
          </button>
          <button className="btn btn-danger" disabled={busy}>
            {busy && <Spinner />} Delete interview
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Staff: hand the request to a specific caller. */
export function AssignDialog({ i, callers, onClose, onDone }: { i: Interview; callers: { id: string; name: string }[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [callerId, setCallerId] = useState(i.caller?._id ?? callers[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await act(i._id, { action: "assign", callerId });
      onDone(`Assigned to ${callers.find((c) => c.id === callerId)?.name}. They were emailed.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Assign to a caller">
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <select className="input" value={callerId} onChange={(e) => setCallerId(e.target.value)}>
          {callers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">The caller gets the request by email and must schedule it within the scheduling deadline.</p>
        <div className="card-footer -mx-5 -mb-5 mt-5">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !callerId}>
            {busy && <Spinner />} Assign
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------ calendar */

const WEEKDAYS = WEEKDAY_SHORT;
/** Year / month (1–12) of the month shown, in the viewer's time zone. */
const monthOf = (month: Date) => {
  const p = tzParts(month);
  return { y: p.y, m: p.m };
};
/** The 42 days ("YYYY-MM-DD") of the 6-week grid for a month, starting on Sunday. */
function gridDays(y: number, m: number) {
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return Array.from({ length: 42 }, (_, k) => new Date(Date.UTC(y, m - 1, 1 - lead + k)).toISOString().slice(0, 10));
}
export const monthTitle = (month: Date) => {
  const { y, m } = monthOf(month);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

/** When an interview sits on the calendar: its scheduled time, or (not yet scheduled) its requested start. */
export const calendarTime = (i: Interview) => new Date(i.scheduledAt ?? i.windowStart);

const PALETTE = ["bg-indigo-500", "bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-teal-500", "bg-fuchsia-500"];
/** Stable colour per caller so "who is conducting" is visible at a glance. */
export function callerColor(id?: string | null) {
  if (!id) return "bg-slate-400";
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Colour per profile (static class names so Tailwind keeps them). Colours are handed out in order, so the
// profiles on screen get different colours (pages register their profiles, sorted by name, with registerProfiles).
const PROFILE_COLORS = [
  { dot: "bg-blue-500", chip: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300", border: "border-l-blue-500", tint: "bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20" },
  { dot: "bg-orange-500", chip: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300", border: "border-l-orange-500", tint: "bg-orange-50 hover:bg-orange-100 dark:bg-orange-500/10 dark:hover:bg-orange-500/20" },
  { dot: "bg-green-600", chip: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300", border: "border-l-green-600", tint: "bg-green-50 hover:bg-green-100 dark:bg-green-500/10 dark:hover:bg-green-500/20" },
  { dot: "bg-pink-500", chip: "bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300", border: "border-l-pink-500", tint: "bg-pink-50 hover:bg-pink-100 dark:bg-pink-500/10 dark:hover:bg-pink-500/20" },
  { dot: "bg-cyan-500", chip: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300", border: "border-l-cyan-500", tint: "bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20" },
  { dot: "bg-purple-500", chip: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300", border: "border-l-purple-500", tint: "bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/10 dark:hover:bg-purple-500/20" },
  { dot: "bg-yellow-500", chip: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300", border: "border-l-yellow-500", tint: "bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20" },
  { dot: "bg-red-500", chip: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300", border: "border-l-red-500", tint: "bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20" },
  { dot: "bg-lime-500", chip: "bg-lime-100 text-lime-800 dark:bg-lime-500/15 dark:text-lime-300", border: "border-l-lime-500", tint: "bg-lime-50 hover:bg-lime-100 dark:bg-lime-500/10 dark:hover:bg-lime-500/20" },
  { dot: "bg-teal-600", chip: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300", border: "border-l-teal-600", tint: "bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/10 dark:hover:bg-teal-500/20" },
  { dot: "bg-indigo-500", chip: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300", border: "border-l-indigo-500", tint: "bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20" },
  { dot: "bg-amber-700", chip: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300", border: "border-l-amber-700", tint: "bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20" },
  { dot: "bg-fuchsia-500", chip: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300", border: "border-l-fuchsia-500", tint: "bg-fuchsia-50 hover:bg-fuchsia-100 dark:bg-fuchsia-500/10 dark:hover:bg-fuchsia-500/20" },
  { dot: "bg-sky-700", chip: "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300", border: "border-l-sky-700", tint: "bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/10 dark:hover:bg-sky-500/20" },
  { dot: "bg-emerald-800", chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300", border: "border-l-emerald-800", tint: "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20" },
  { dot: "bg-rose-800", chip: "bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300", border: "border-l-rose-800", tint: "bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20" },
];
const NO_PROFILE = { dot: "bg-slate-500", chip: "bg-slate-200 text-slate-800", border: "border-l-slate-500", tint: "bg-slate-100 hover:bg-slate-200" };
const profileSlots = new Map<string, number>();
/** Give these profiles (sorted by name) their colours first, so the same list gets the same colours. */
export function registerProfiles(ids: string[]) {
  for (const id of ids) if (!profileSlots.has(id)) profileSlots.set(id, profileSlots.size);
}
/** Colour classes for a profile (same profile → same colour everywhere on the page). */
export function profileColor(id?: string | null) {
  if (!id) return NO_PROFILE;
  if (!profileSlots.has(id)) profileSlots.set(id, profileSlots.size);
  return PROFILE_COLORS[profileSlots.get(id)! % PROFILE_COLORS.length];
}
/** The interview's profile as a coloured tag. */
export function ProfileTag({ i, className = "" }: { i: Pick<Interview, "profile" | "profileLabel">; className?: string }) {
  const c = profileColor(i.profile?._id);
  return (
    <span className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${c.chip} ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
      <span className="truncate">{i.profile?.label ?? i.profileLabel}</span>
    </span>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Caller as a small round avatar (initials on their calendar colour). */
export function CallerAvatar({ caller, size = 24 }: { caller: Ref; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (!caller)
    return <span aria-hidden style={style} className="inline-block shrink-0 rounded-full border border-dashed border-slate-400" />;
  return (
    <span aria-hidden style={style} className={`inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ${callerColor(caller._id)}`}>
      {initials(caller.name)}
    </span>
  );
}

/** The 7 days ("YYYY-MM-DD", Sunday first) of the week containing `date`, in the viewer's zone. */
function weekDays(date: Date) {
  const p = tzParts(date);
  return Array.from({ length: 7 }, (_, k) => new Date(Date.UTC(p.y, p.m - 1, p.d - p.wd + k)).toISOString().slice(0, 10));
}
const shortDay = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Month grid or week columns; the visible date is controlled so the page can fetch that range.
 * Interviews the viewer may move (`canMove`) can be dragged onto another day (`onMove`).
 */
export function InterviewCalendar({
  month,
  onMonth,
  items,
  onOpen,
  onAddDay,
  span = "month",
  canMove,
  onMove,
  canEditTime,
  onEditTime,
}: {
  month: Date; // any date in the month (or week) shown
  onMonth: (d: Date) => void;
  items: Interview[];
  onOpen: (i: Interview) => void;
  /** When set, today and later days get a "+" to schedule an interview on that day (YYYY-MM-DD). */
  onAddDay?: (day: string) => void;
  span?: "month" | "week";
  canMove?: (i: Interview, day: string) => boolean;
  onMove?: (i: Interview, day: string) => void;
  /** When set, clicking an entry's time opens a small editor to change it in place (`onEditTime` saves it). */
  canEditTime?: (i: Interview) => boolean;
  onEditTime?: (i: Interview, at: Date) => Promise<void>;
}) {
  const { y, m } = monthOf(month);
  const week = span === "week";
  const days = week ? weekDays(month) : gridDays(y, m);
  const [dragging, setDragging] = useState<Interview | null>(null);
  const [over, setOver] = useState("");
  const [editing, setEditing] = useState("");
  const byDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const i of [...items].sort((a, b) => calendarTime(a).getTime() - calendarTime(b).getTime())) {
      const k = tzDayKey(calendarTime(i));
      map.set(k, [...(map.get(k) ?? []), i]);
    }
    return map;
  }, [items]);
  const today = tzDayKey(new Date());
  const shift = (n: number) => {
    if (!week) return onMonth(fromWallTime(y, m + n, 1, 12));
    const p = tzParts(month);
    onMonth(fromWallTime(p.y, p.m, p.d + 7 * n, 12));
  };
  const droppable = (k: string) => !!dragging && !!canMove?.(dragging, k) && tzDayKey(calendarTime(dragging)) !== k;
  const title = week ? `${shortDay(days[0])} – ${shortDay(days[6])}, ${days[6].slice(0, 4)}` : monthTitle(month);

  return (
    <div className="card overflow-hidden p-0">
      <div className="card-header">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
          {/* The server does not know the viewer's zone; the browser value replaces it on hydration. */}
          <span className="chip font-mono text-[11px]" suppressHydrationWarning>
            {tzAbbr()}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="btn btn-secondary" onClick={() => onMonth(new Date())}>
            Today
          </button>
          <div className="inline-flex items-center gap-0.5">
            <button className="btn btn-ghost btn-icon" onClick={() => shift(-1)} aria-label={week ? "Previous week" : "Previous month"}>
              <Chevron dir="left" />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => shift(1)} aria-label={week ? "Next week" : "Next month"}>
              <Chevron dir="right" />
            </button>
          </div>
        </div>
      </div>
      {/* Narrow screens: the grid keeps a readable width and scrolls sideways inside the card. */}
      <div className={week ? "overflow-x-auto lg:overflow-visible" : "overflow-x-auto md:overflow-visible"}>
      <div className={week ? "min-w-[49rem] lg:min-w-0" : "min-w-[40rem] md:min-w-0"}>
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[11px] font-medium text-slate-500 sm:text-xs">
        {WEEKDAYS.map((d, k) => (
          <div key={d} className="py-2">
            {d}
            {week && <span className={`ml-1.5 tabular-nums ${days[k] === today ? "font-semibold text-indigo-600" : "text-slate-400"}`}>{shortDay(days[k])}</span>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((k, idx) => {
          const list = byDay.get(k) ?? [];
          const inMonth = week || Number(k.slice(5, 7)) === m;
          const shown = week ? list : list.slice(0, 3);
          const dayNum = Number(k.slice(8));
          const weekend = idx % 7 === 0 || idx % 7 === 6;
          const isToday = k === today;
          return (
            <div
              key={idx}
              className={`group relative min-w-0 ${week ? "min-h-72 sm:min-h-96" : "min-h-24 sm:min-h-32"} border-slate-200 p-1.5 transition-colors sm:p-2 ${idx % 7 ? "border-l" : ""} ${idx >= 7 ? "border-t" : ""} ${
                !inMonth ? "bg-slate-50" : weekend ? "bg-slate-50/50" : ""
              } ${over === k ? "bg-indigo-50 ring-2 ring-indigo-500/40 ring-inset" : ""}`}
              onDragOver={(e) => {
                if (!droppable(k)) return;
                e.preventDefault();
                if (over !== k) setOver(k);
              }}
              onDragLeave={() => over === k && setOver("")}
              onDrop={(e) => {
                e.preventDefault();
                setOver("");
                if (dragging && droppable(k)) onMove?.(dragging, k);
                setDragging(null);
              }}
            >
              <div className="mb-1.5 flex items-center justify-between">
                {isToday ? (
                  <span className="grid h-6 min-w-6 place-items-center rounded-md bg-indigo-600 px-1 text-xs font-semibold text-white tabular-nums">{dayNum}</span>
                ) : (
                  <span className={`grid h-6 min-w-6 place-items-center px-1 text-xs font-medium tabular-nums ${inMonth ? "text-slate-700" : "text-slate-400"}`}>{dayNum}</span>
                )}
                {onAddDay && k >= today && (
                  <button
                    type="button"
                    onClick={() => onAddDay(k)}
                    aria-label={`Schedule an interview on ${k}`}
                    title={`Schedule an interview on ${k}`}
                    className="grid size-6 cursor-pointer place-items-center rounded-md text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-900 focus:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <div className={week ? "space-y-1.5" : "space-y-1"}>
                {shown.map((i) => {
                  const editable = !!onEditTime && !!canEditTime?.(i);
                  const time = editable ? (
                    <button
                      type="button"
                      title="Change the time"
                      aria-label={`Change the time of ${i.company}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(editing === i._id ? "" : i._id);
                      }}
                      className="shrink-0 cursor-pointer rounded px-0.5 font-semibold whitespace-nowrap tabular-nums underline decoration-dotted underline-offset-2 hover:bg-white/70 hover:text-indigo-700"
                    >
                      {fmtTime(calendarTime(i))}
                    </button>
                  ) : (
                    <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">{fmtTime(calendarTime(i))}</span>
                  );
                  const done = i.status === "completed";
                  const booked = i.status === "scheduled" || done;
                  const notes = i.comments ?? [];
                  const c = profileColor(i.profile?._id);
                  return (
                    <div key={i._id} className="group/entry relative">
                      <div
                        role="button"
                        data-entry={i._id}
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onOpen(i))}
                        draggable={!!canMove && days.some((d) => d !== k && canMove(i, d))}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", i._id);
                          setDragging(i);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver("");
                        }}
                        onClick={() => onOpen(i)}
                        aria-label={`Step ${i.step ?? 1} · ${fmtTime(calendarTime(i))} · ${i.company} · ${i.profile?.label ?? i.profileLabel} · ${i.caller?.name ?? "unassigned"}${done ? " · done" : ""}`}
                        className={`w-full cursor-pointer rounded-md border-l-[3px] ${c.border} text-left text-[11px] leading-tight text-slate-800 transition-colors ${
                          booked ? c.tint : "border-y border-r border-dashed border-y-slate-300 border-r-slate-300 bg-transparent text-slate-500 italic hover:bg-slate-50"
                        } ${week ? "block px-2 py-1.5" : "flex items-center gap-1.5 px-1.5 py-1"} ${i.status === "cancelled" ? "line-through opacity-60" : ""}`}
                      >
                        {week ? (
                          <>
                            <span className="flex items-center gap-1.5">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${booked ? callerColor(i.caller?._id) : "border border-slate-400"}`} />
                              {time}
                              <span className="text-[10px] font-semibold text-slate-500">S{i.step ?? 1}</span>
                              {done && <DoneMark className="ml-auto" />}
                              {!!notes.length && <NoteCount n={notes.length} className={done ? "" : "ml-auto"} />}
                            </span>
                            <span className="mt-1 block truncate font-semibold">{i.company}</span>
                            <span className="block truncate text-slate-500">{i.jobTitle}</span>
                            <ProfileTag i={i} className="mt-1" />
                            <span className="mt-1 flex items-center gap-1 truncate text-[10px] text-slate-500">
                              <CallerAvatar caller={i.caller} size={14} />
                              {i.caller?.name ?? "No caller yet"}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${booked ? callerColor(i.caller?._id) : "border border-slate-400"}`} />
                            {time}
                            {done && <DoneMark />}
                            <span className="truncate font-medium">{i.company}</span>
                            {(i.step ?? 1) > 1 && <span className="shrink-0 text-[10px] font-semibold text-slate-500">S{i.step}</span>}
                            {!!notes.length && <NoteCount n={notes.length} className="ml-auto" />}
                          </>
                        )}
                      </div>
                      {editing !== i._id && !dragging && <EntryTooltip i={i} alignRight={idx % 7 >= 5} />}
                      {editing === i._id && (
                        <TimeEditor
                          i={i}
                          alignRight={idx % 7 >= 4}
                          onClose={() => setEditing("")}
                          onSave={async (at) => {
                            await onEditTime!(i, at);
                            setEditing("");
                          }}
                        />
                      )}
                    </div>
                  );
                })}
                {list.length > shown.length && (
                  <div className="px-1.5 text-[11px] font-medium text-slate-500">+{list.length - shown.length} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return <Icon aria-hidden />;
}

function DoneMark({ className = "" }: { className?: string }) {
  return (
    <span className={`grid size-3.5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/30 ring-inset ${className}`} title="Done">
      <Check className="size-2.5" strokeWidth={3.5} aria-hidden />
    </span>
  );
}

function NoteCount({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-slate-500 tabular-nums ${className}`} title={`${n} note${n === 1 ? "" : "s"}`}>
      <MessageSquare className="size-3" aria-hidden />
      {n}
    </span>
  );
}

/** Hover card for a calendar entry: when, what, who, done status and the latest notes. */
function EntryTooltip({ i, alignRight }: { i: Interview; alignRight: boolean }) {
  const notes = i.comments ?? [];
  const done = i.status === "completed";
  return (
    <div
      role="tooltip"
      className={`popover pointer-events-none invisible absolute top-full z-40 mt-1.5 w-72 max-w-[calc(100vw-1rem)] translate-y-1 [@media(hover:none)]:hidden p-3 text-left text-xs opacity-0 transition delay-150 duration-150 group-hover/entry:visible group-hover/entry:translate-y-0 group-hover/entry:opacity-100 ${alignRight ? "right-0" : "left-0"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-500 tabular-nums">
          {fmtDay(calendarTime(i))} {fmtTime(calendarTime(i))}
        </span>
        {done ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
            <Check className="size-2.5" strokeWidth={3} aria-hidden /> Done
          </span>
        ) : (
          <span className="text-[10px] text-slate-500">{STATUS_LABEL[i.status]}</span>
        )}
      </div>
      <div className="mt-1.5 text-[13px] font-semibold text-slate-900">{i.company}</div>
      <div className="text-slate-500">
        Step {i.step ?? 1} · {i.jobTitle} · {i.durationMinutes} min
      </div>
      <div className="mt-1">
        <ProfileTag i={i} />
      </div>
      <div className="mt-1 text-slate-600">Caller: {i.caller?.name ?? "not assigned yet"}</div>
      {done && i.report?.outcome && <div className="mt-1 text-emerald-700">Result: {OUTCOME_LABEL[i.report.outcome]}</div>}
      {done && i.report?.interviewerName && (
        <div className="text-slate-600">
          Interviewer: {i.report.interviewerName}
          {i.report.interviewerCallerId ? ` · ${i.report.interviewerCallerId}` : ""}
        </div>
      )}
      {done && i.report?.summary && <div className="mt-1 line-clamp-3 text-slate-600">Feedback: {i.report.summary}</div>}
      {i.callerNote && <div className="mt-1 truncate text-slate-500">{i.callerNote}</div>}
      {!!notes.length && (
        <div className="mt-2.5 space-y-1 border-t border-slate-200 pt-2.5">
          {notes.slice(-3).map((c, k) => (
            <div key={c._id ?? k} className="rounded-md bg-slate-50 px-2 py-1 text-slate-700">
              <span className="font-medium">{c.byName}:</span> <span className="break-words">{c.text.length > 140 ? `${c.text.slice(0, 140)}…` : c.text}</span>
            </div>
          ))}
          {notes.length > 3 && <div className="text-[10px] text-slate-400">+{notes.length - 3} earlier note{notes.length - 3 === 1 ? "" : "s"}</div>}
        </div>
      )}
    </div>
  );
}

/** Small in-place editor for an interview's date and time (opened from its time on the calendar). */
function TimeEditor({ i, onSave, onClose, alignRight = false }: { i: Interview; onSave: (at: Date) => Promise<void>; onClose: () => void; alignRight?: boolean }) {
  const [value, setValue] = useState(() => toTzInput(calendarTime(i)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  const changed = value && value !== toTzInput(calendarTime(i));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return onClose();
    setBusy(true);
    setError("");
    try {
      await onSave(fromTzInput(value));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <form
      ref={box}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className={`popover z-30 space-y-2 p-3 text-xs max-sm:fixed max-sm:inset-x-2 max-sm:bottom-2 max-sm:z-50 sm:absolute sm:top-full sm:mt-1 sm:w-64 sm:p-2.5 ${alignRight ? "sm:right-0" : "sm:left-0"}`}
    >
      <div className="font-medium text-slate-900">
        Change time · {i.company}
      </div>
      <input autoFocus aria-label="New date and time" className="input sm:py-1 sm:text-xs" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="text-[11px] text-slate-500">
        {tzAbbr()} · the caller and everyone responsible are emailed.
      </div>
      {error && <div className="text-[11px] text-rose-600">{error}</div>}
      <div className="flex flex-wrap justify-end gap-1">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" disabled={busy || !changed}>
          {busy && <Spinner />} Save
        </button>
      </div>
    </form>
  );
}

/** First and last instant of the 6-week grid for `month` (for fetching). */
export function calendarRange(month: Date) {
  const { y, m } = monthOf(month);
  const days = gridDays(y, m);
  const [fy, fm, fd] = days[0].split("-").map(Number);
  const [ly, lm, ld] = days[41].split("-").map(Number);
  return { from: fromWallTime(fy, fm, fd).toISOString(), to: fromWallTime(ly, lm, ld + 1).toISOString() };
}
