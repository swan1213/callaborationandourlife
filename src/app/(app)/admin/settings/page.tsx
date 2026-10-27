"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, FlaskConical, Mail, RotateCcw, Save, Send } from "lucide-react";
import { Alert, api, PageHeader, Section, Spinner, PageSkeleton } from "@/components/ui";
import DateInput from "@/components/DateInput";
import SearchSelect from "@/components/SearchSelect";
import { useConfirm, useToast } from "@/components/Alerts";

const TAG = "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset";
const CODE = "rounded border border-slate-200 bg-slate-50 px-1 py-px font-mono text-[11px] text-slate-700";

type Settings = {
  siteName: string;
  defaultFee: number;
  allowRegistration: boolean;
  myPageNotice: string;
  promptInstructions: string;
  resumePromptTemplate: string;
  reportTimezone: string;
  dailyReportEnabled: boolean;
  memberReportsEnabled: boolean;
  notificationsEnabled: boolean;
  milestones: number[];
  milestonePeriod: "daily" | "lifetime";
  companyCooldownDays: number;
  interviewScheduleHours: number;
  atsTargetScore: number;
};

type FormState = Omit<Settings, "defaultFee" | "milestones" | "companyCooldownDays" | "interviewScheduleHours" | "atsTargetScore"> & {
  defaultFee: string;
  milestones: string;
  companyCooldownDays: string;
  interviewScheduleHours: string;
  atsTargetScore: string;
};

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Manila",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export default function SettingsPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [reportDay, setReportDay] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    api<{ settings: Settings; defaultResumePrompt: string }>("/api/admin/settings")
      .then(({ settings: s, defaultResumePrompt }) => {
        setDefaultPrompt(defaultResumePrompt);
        setForm({
          ...s,
          defaultFee: String(s.defaultFee),
          milestones: (s.milestones ?? []).join(", "),
          companyCooldownDays: String(s.companyCooldownDays ?? 30),
          interviewScheduleHours: String(s.interviewScheduleHours ?? 3),
          atsTargetScore: String(s.atsTargetScore ?? 85),
          memberReportsEnabled: s.memberReportsEnabled ?? true,
          resumePromptTemplate: s.resumePromptTemplate || defaultResumePrompt,
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/settings", { method: "PATCH", json: {
          ...form,
          defaultFee: Number(form.defaultFee),
          companyCooldownDays: Number(form.companyCooldownDays || 0),
          interviewScheduleHours: Number(form.interviewScheduleHours || 3),
          atsTargetScore: Number(form.atsTargetScore || 0),
        },
      });
      // milestones are sent as a comma-separated string and normalised server-side
      toast.success("Settings saved");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReport(onlyMe: boolean) {
    setSending(true);
    try {
      const r = await api<{ day: string; sent: { email: string; ok: boolean; bids: number }[] }>("/api/admin/reports", {
        method: "POST",
        json: { day: reportDay || undefined, onlyMe },
      });
      const failed = r.sent.filter((x) => !x.ok).length;
      toast({
        tone: failed ? (failed === r.sent.length ? "error" : "warning") : "success",
        title: `Report for ${r.day} sent to ${r.sent.length - failed} recipient(s)${failed ? `, ${failed} failed` : ""}`,
        description: r.sent.map((x) => x.email).join(", ") || "none",
      });
    } catch (err) {
      toast.error("Couldn't send the report", (err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (!form)
    return error ? (
      <div className="mx-auto max-w-3xl">
        <Alert>{error}</Alert>
      </div>
    ) : (
      <PageSkeleton variant="form" />
    );

  const isDefaultPrompt = form.resumePromptTemplate.trim() === defaultPrompt.trim();

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Global configuration, fees, and the My Page announcement." />
      {error && <Alert>{error}</Alert>}

      <Section title="General" description="Site identity, default fees and application rules.">
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
          <div>
            <label className="label">Site name</label>
            <input className="input" value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
          </div>
          <div>
            <label className="label">Default fee per submitted application for new bidders ($)</label>
            <input
              className="input tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={form.defaultFee}
              onChange={(e) => setForm({ ...form, defaultFee: e.target.value })}
            />
            <div className="hint">Individual user fees can be changed on the Users page.</div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Same-company cooldown (days)</label>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <input
                className="input max-w-32 tabular-nums"
                type="number"
                min={0}
                max={365}
                step={1}
                value={form.companyCooldownDays}
                onChange={(e) => setForm({ ...form, companyCooldownDays: e.target.value })}
              />
              <span className="text-xs text-slate-500">
                A profile cannot apply to the same company again within this many days (0 = off). Blocked attempts are refused on screen. Profiles can override this.
              </span>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Interview scheduling deadline (hours)</label>
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <input
                className="input max-w-32 tabular-nums"
                type="number"
                min={0.25}
                max={72}
                step={0.25}
                value={form.interviewScheduleHours}
                onChange={(e) => setForm({ ...form, interviewScheduleHours: e.target.value })}
              />
              <span className="text-xs text-slate-500">
                If a caller has not scheduled an interview request within this time, the bidder, the profile&apos;s users and admins are emailed.
              </span>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 md:col-span-2">
            <input type="checkbox" className="size-4 rounded" checked={form.allowRegistration} onChange={(e) => setForm({ ...form, allowRegistration: e.target.checked })} />
            Allow new sign-up requests
          </label>
        </div>
      </Section>

      <Section title="My Page announcement" description={<>Shown at the top of every user&apos;s My Page. Leave empty to hide.</>}>
        <textarea
          className="input min-h-32"
          value={form.myPageNotice}
          onChange={(e) => setForm({ ...form, myPageNotice: e.target.value })}
          placeholder="e.g. Invoices for September are due by Oct 5. Please upload submission screenshots within 24 hours."
        />
      </Section>

      <section className="card p-0">
        <div className="card-header items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="card-title">Resume & cover letter prompt</h2>
              {isDefaultPrompt ? (
                <span className={`${TAG} bg-emerald-50 text-emerald-700 ring-emerald-600/20`}>Default</span>
              ) : (
                <span className={`${TAG} bg-amber-50 text-amber-700 ring-amber-600/20`}>Customized</span>
              )}
            </div>
            <p className="card-description leading-relaxed">
              Sent to OpenAI for every application. Placeholders: <code className={CODE}>{"{{CANDIDATE_PROFILE}}"}</code>, <code className={CODE}>{"{{CANDIDATE_EMAIL}}"}</code>,{" "}
              <code className={CODE}>{"{{SIGN_OFF_NAME}}"}</code>, <code className={CODE}>{"{{JOB_DESCRIPTION_CONTENT}}"}</code>, <code className={CODE}>{"{{JOB_DESCRIPTION_LINK}}"}</code>,{" "}
              <code className={CODE}>{"{{ADDITIONAL_VERIFIED_EXPERIENCE}}"}</code> (the profile&apos;s About text). Without the job placeholders, the job link and description are sent separately. The prompt is followed as written; the app only adds the reply layout it reads, and writes the cover letter separately when the prompt has none. Keep the COMPANY/ROLE lines, the # section titles and the
              &quot;---&quot; + &quot;COVER LETTER&quot; separator so documents can be built.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isDefaultPrompt}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Reset the prompt?",
                    message: "Your edits are replaced with the default prompt (Premium one-page Senior Software Engineer resume). Nothing is saved until you click Save settings.",
                    confirmLabel: "Reset to default",
                    danger: true,
                  })
                )
                  setForm((f) => f && { ...f, resumePromptTemplate: defaultPrompt });
              }}
            >
              <RotateCcw />
              Reset to default
            </button>
            <Link href="/admin/prompt-test" className="btn btn-secondary btn-sm">
              <FlaskConical />
              Test prompt
              <ArrowRight />
            </Link>
          </div>
        </div>
        <div className="card-body">
          <textarea
            className="input min-h-[28rem] font-mono text-xs leading-relaxed"
            value={form.resumePromptTemplate}
            onChange={(e) => setForm({ ...form, resumePromptTemplate: e.target.value })}
            spellCheck={false}
          />
        </div>
      </section>

      <Section title="Extra generation instructions" description="Extra guidance appended to every AI prompt (tone, length, formatting rules, etc.).">
        <textarea
          className="input min-h-32"
          value={form.promptInstructions}
          onChange={(e) => setForm({ ...form, promptInstructions: e.target.value })}
          placeholder="e.g. Keep the resume to one page. Use US English. Do not mention salary expectations."
        />
      </Section>

      <Section title="ATS optimization" description="Raises the Job match score of every generated resume and cover letter.">
        <label className="label">ATS target score (0–100)</label>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <input
            className="input max-w-32 tabular-nums"
            type="number"
            min={0}
            max={100}
            step={1}
            value={form.atsTargetScore}
            onChange={(e) => setForm({ ...form, atsTargetScore: e.target.value })}
          />
          <span className="text-xs text-slate-500">
            When a new resume scores below this, misses a required skill, or has too few bullets with numbers, the AI revises it once to work in the
            posting&apos;s missing keywords (titles, companies and dates never change). Adds about 10–20 seconds and one extra AI request. 0 = off.
          </span>
        </div>
      </Section>

      <section className="card p-0">
        <div className="card-header">
          <div className="min-w-0">
            <h2 className="card-title">Notifications & daily report</h2>
            <p className="card-description">
              HTML emails via Resend. The daily report goes out at midnight to every admin (all profiles) and to each user (the profiles they manage).
            </p>
          </div>
        </div>
        <div className="card-body space-y-5">
          <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
            <div>
              <label className="label">Report timezone (defines “midnight” and “today”)</label>
              <input className="input font-mono text-[13px]" list="tz-list" value={form.reportTimezone} onChange={(e) => setForm({ ...form, reportTimezone: e.target.value })} />
              <datalist id="tz-list">
                {TIMEZONES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label">Milestones (submitted applications, comma separated)</label>
              <input className="input tabular-nums" value={form.milestones} onChange={(e) => setForm({ ...form, milestones: e.target.value })} placeholder="1, 50, 100" />
            </div>
            <div>
              <label className="label">Milestone counting</label>
              <SearchSelect
                aria-label="Milestone counting"
                value={form.milestonePeriod}
                onChange={(v) => setForm({ ...form, milestonePeriod: v as FormState["milestonePeriod"] })}
                options={[
                  { value: "daily", label: "Per day (resets at midnight)" },
                  { value: "lifetime", label: "All-time total" },
                ]}
              />
            </div>
          </div>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
            <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5 size-4 rounded" checked={form.dailyReportEnabled} onChange={(e) => setForm({ ...form, dailyReportEnabled: e.target.checked })} />
              Send the midnight daily report
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5 size-4 rounded" checked={form.memberReportsEnabled} onChange={(e) => setForm({ ...form, memberReportsEnabled: e.target.checked })} />
              Post each member&apos;s daily report (work time, applications, interviews) to Chat → Daily reports
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5 size-4 rounded" checked={form.notificationsEnabled} onChange={(e) => setForm({ ...form, notificationsEnabled: e.target.checked })} />
              Send milestone emails when submitted applications reach these counts (users + bidders)
            </label>
          </div>
        </div>
        <div className="card-footer items-end justify-start">
          <div className="w-full sm:w-auto">
            <label className="label">Report day (blank = yesterday)</label>
            <DateInput aria-label="Report day" className="w-full sm:w-40" value={reportDay} onChange={setReportDay} />
          </div>
          <div className="flex flex-wrap items-center gap-2 self-end">
            <a className="btn btn-secondary" href={`/api/admin/reports${reportDay ? `?day=${reportDay}` : ""}`} target="_blank" rel="noreferrer">
              <ExternalLink />
              Preview (today if blank)
            </a>
            <button type="button" className="btn btn-secondary" disabled={sending} onClick={() => sendReport(true)}>
              {sending ? <Spinner /> : <Mail />} Send to me
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={sending}
              onClick={async () => {
                if (await confirm({ title: "Send the report to everyone?", message: "The daily report is emailed now to all admins and users.", confirmLabel: "Send to all" })) sendReport(false);
              }}
            >
              <Send />
              Send to all now
            </button>
          </div>
        </div>
      </section>

      <div className="page-bar sticky bottom-3 z-10 flex flex-wrap justify-end gap-2 rounded-xl border border-slate-200 px-3 py-3 sm:px-4">
        <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>
          {busy ? <Spinner /> : <Save />} Save settings
        </button>
      </div>
    </form>
  );
}
