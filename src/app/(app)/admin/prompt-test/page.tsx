"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, FlaskConical, Info, Link2, RotateCcw, Save, Settings, Sparkles } from "lucide-react";
import { Alert, api, EmptyState, PageHeader, Section, Spinner, useAsync } from "@/components/ui";
import { SalaryBanner } from "@/components/SalaryBanner";
import SearchSelect from "@/components/SearchSelect";
import { useConfirm, useToast } from "@/components/Alerts";
import ResumePreview, { LetterPreview } from "@/components/ResumePreview";
import MatchScore from "@/components/MatchScore";
import type { GenerationResult } from "@/lib/generate";
import { reviewKey, type AtsReview } from "@/lib/atsReview";

type Designs = { resume: string; coverLetter: string };
type ProfileOpt = { _id: string; label: string; fullName: string; active: boolean };
type SettingsResp = { settings: { resumePromptTemplate: string; promptInstructions: string }; defaultResumePrompt: string };
type Meta = { model: string; promptTokens: number; completionTokens: number; costUsd: number; seconds: number; prompt: "default" | "custom" };

const TABS = ["Resume", "Cover letter", "Job description"] as const;
const TAG = "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset";
const CODE = "rounded border border-slate-200 bg-slate-50 px-1 py-px font-mono text-[11px] text-slate-700";

/**
 * Admin: try the resume prompt (or a draft of it) on a profile + job and see the resume and cover letter it produces.
 * Nothing is saved: no application, no fee, no quota. "Save prompt to Settings" makes the draft the live prompt.
 */
export default function PromptTestPage() {
  const profiles = useAsync(() => api<{ profiles: ProfileOpt[] }>("/api/admin/profiles").then((r) => r.profiles), []);
  const saved = useAsync(() => api<SettingsResp>("/api/admin/settings"), []);
  const savedPrompt = saved.data ? saved.data.settings.resumePromptTemplate || saved.data.defaultResumePrompt : "";
  const savedExtra = saved.data?.settings.promptInstructions ?? "";

  const [profileId, setProfileId] = useState("");
  const [source, setSource] = useState<"url" | "text">("url");
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [prompt, setPrompt] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();
  const [out, setOut] = useState<{ result: GenerationResult; designs?: Designs; meta: Meta } | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resume");

  // Start from the live prompt (what real generation uses today).
  useEffect(() => {
    if (saved.data) {
      setPrompt(savedPrompt);
      setExtra(savedExtra);
    }
  }, [saved.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(
    () => (profiles.data ?? []).filter((p) => p.active).map((p) => ({ value: p._id, label: p.label, hint: p.fullName !== p.label ? p.fullName : undefined })),
    [profiles.data],
  );
  useEffect(() => {
    if (!profileId && options.length) setProfileId(options[0].value);
  }, [options, profileId]);

  const edited = !!saved.data && (prompt.trim() !== savedPrompt.trim() || extra.trim() !== savedExtra.trim());
  const isDefault = !!saved.data && prompt.trim() === saved.data.defaultResumePrompt.trim();
  const jobReady = source === "url" ? /^https?:\/\/\S+$/i.test(jobUrl.trim()) : jobText.trim().length >= 100;

  async function run() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ result: GenerationResult; designs?: Designs; meta: Meta }>("/api/admin/prompt-test", {
        method: "POST",
        json: {
          profileId,
          ...(source === "url" ? { jobUrl: jobUrl.trim() } : { jobText }),
          promptTemplate: prompt,
          promptInstructions: extra,
        },
      });
      setOut(r);
      setTab("Resume");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveToSettings() {
    if (
      !(await confirm({
        title: "Make this the live prompt?",
        message: "Every resume generated from now on uses this prompt and these extra instructions.",
        confirmLabel: "Save to Settings",
      }))
    )
      return;
    setSaving(true);
    try {
      await api("/api/admin/settings", { method: "PATCH", json: { resumePromptTemplate: prompt, promptInstructions: extra } });
      saved.reload();
      toast.success("Prompt saved to Settings", "Every new resume now uses this prompt.");
    } catch (e) {
      toast.error("Couldn't save the prompt", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Test Generate Resume"
        subtitle="Try the resume prompt on a profile and a job before using it for real. Nothing is saved: no application, no fee and no quota."
        actions={
          <Link href="/admin/settings" className="btn btn-secondary">
            <Settings />
            Settings
          </Link>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        {/* Inputs */}
        <div className="space-y-4">
          <Section title="Profile and job" description="Who the resume is for and what it targets." bodyClassName="card-body space-y-4">
            <div>
              <label className="label" htmlFor="pt-profile">
                1. Profile
              </label>
              <SearchSelect
                id="pt-profile"
                value={profileId}
                options={options}
                onChange={setProfileId}
                placeholder={profiles.loading ? "Loading…" : "Choose a profile"}
                searchPlaceholder="Find a profile…"
              />
            </div>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="label mb-0">2. Job</span>
                <div className="segmented" role="tablist" aria-label="Job source">
                  {(["url", "text"] as const).map((s) => (
                    <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => setSource(s)}>
                      {s === "url" ? <Link2 /> : <FileText />}
                      {s === "url" ? "Job URL" : "Paste description"}
                    </button>
                  ))}
                </div>
              </div>
              {source === "url" ? (
                <input
                  id="pt-url"
                  className="input"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/…"
                  aria-label="Job URL"
                />
              ) : (
                <textarea
                  id="pt-text"
                  className="input min-h-40"
                  value={jobText}
                  onChange={(e) => setJobText(e.target.value)}
                  placeholder="Paste the full job description (at least 100 characters)"
                  aria-label="Job description"
                />
              )}
            </div>
          </Section>

          <section className="card p-0">
            <div className="card-header">
              <div className="min-w-0">
                <label className="card-title block" htmlFor="pt-prompt">
                  3. Prompt
                </label>
                <p className="card-description">Starts from the live prompt in Settings.</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {edited ? (
                  <span className={`${TAG} bg-amber-50 text-amber-700 ring-amber-600/20`}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
                    Edited · not saved
                  </span>
                ) : (
                  <span className={`${TAG} bg-emerald-50 text-emerald-700 ring-emerald-600/20`}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
                    Same as Settings
                  </span>
                )}
                {isDefault && <span className={`${TAG} bg-slate-100 text-slate-600 ring-slate-500/20`}>Default</span>}
              </div>
            </div>
            <div className="card-body space-y-4">
              <div>
                <textarea
                  id="pt-prompt"
                  className="input min-h-80 font-mono text-xs leading-relaxed"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  spellCheck={false}
                />
                <p className="hint leading-relaxed">
                  Placeholders: <code className={CODE}>{"{{CANDIDATE_PROFILE}}"}</code>, <code className={CODE}>{"{{CANDIDATE_EMAIL}}"}</code>,{" "}
                  <code className={CODE}>{"{{SIGN_OFF_NAME}}"}</code>, <code className={CODE}>{"{{JOB_DESCRIPTION_CONTENT}}"}</code>, <code className={CODE}>{"{{JOB_DESCRIPTION_LINK}}"}</code>,{" "}
                  <code className={CODE}>{"{{ADDITIONAL_VERIFIED_EXPERIENCE}}"}</code>. Without the job placeholders, the job link and description are sent separately.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="pt-extra">
                  Extra instructions
                </label>
                <textarea id="pt-extra" className="input min-h-20" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Optional extra guidance" />
              </div>
            </div>
            <div className="card-footer">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!edited}
                onClick={() => {
                  setPrompt(savedPrompt);
                  setExtra(savedExtra);
                }}
              >
                <RotateCcw />
                Reset to Settings
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!saved.data || isDefault}
                onClick={() => saved.data && setPrompt(saved.data.defaultResumePrompt)}
              >
                Use default prompt
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!edited || saving} onClick={saveToSettings}>
                {saving ? <Spinner /> : <Save />} Save prompt to Settings
              </button>
            </div>
          </section>

          <button className="btn btn-primary btn-lg w-full" disabled={busy || !profileId || !jobReady || !prompt.trim()} onClick={run}>
            {busy ? (
              <>
                <Spinner /> Generating… (up to a minute)
              </>
            ) : (
              <>
                <Sparkles /> Generate test resume
              </>
            )}
          </button>

          {out && (
            <MatchScore
              // A new test result starts without an AI review.
              key={reviewKey(out.result.resume, out.result.jobDescription)}
              resume={out.result.resume}
              coverLetter={out.result.coverLetter}
              jobDescription={out.result.jobDescription}
              company={out.result.company}
              jobTitle={out.result.jobTitle}
              runReview={() =>
                api<{ review: AtsReview }>("/api/admin/prompt-test/ats", {
                  method: "POST",
                  json: { profileId, resume: out.result.resume, jobDescription: out.result.jobDescription, jobTitle: out.result.jobTitle, company: out.result.company },
                }).then((r) => r.review)
              }
            />
          )}
        </div>

        {/* Result */}
        <div className="min-w-0">
          {!out ? (
            <div className="card flex min-h-96 items-center justify-center p-0">
              {busy ? (
                <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                  <Spinner className="h-5 w-5 text-indigo-600" />
                  <span className="text-sm text-slate-500">Generating with this prompt…</span>
                </div>
              ) : (
                <EmptyState icon={FlaskConical} title="No test result yet" description="Choose a profile and a job, then click Generate test resume. The result appears here." />
              )}
            </div>
          ) : (
            <section className="card p-0">
              <div className="card-header items-start">
                <div className="min-w-0">
                  <h2 className="card-title">
                    {out.result.company || "Company not found"} · {out.result.jobTitle || "Role not found"}
                  </h2>
                  <p className="card-description text-xs tabular-nums">
                    {out.meta.prompt === "default" ? "Default prompt" : "Custom prompt"} · <span className="font-mono">{out.meta.model}</span> ·{" "}
                    {out.meta.promptTokens.toLocaleString()} + {out.meta.completionTokens.toLocaleString()} tokens · ${out.meta.costUsd.toFixed(4)} · {out.meta.seconds}s
                    {out.result.ats && (
                      <> · ATS {out.result.ats.revised ? `${out.result.ats.before} → ${out.result.ats.after}` : String(out.result.ats.after)}</>
                    )}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700">
                  <Info className="size-3" />
                  Test only · not saved
                </span>
              </div>
              <div className="tabs px-4 sm:px-5" role="tablist" aria-label="Result">
                {TABS.map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="min-w-0 overflow-x-auto p-3 sm:p-5">
              {tab === "Resume" && <ResumePreview r={out.result.resume} design={out.designs?.resume} />}
              {tab === "Cover letter" && (
                <LetterPreview
                  r={out.result.resume}
                  design={out.designs?.coverLetter}
                  text={out.result.coverLetter}
                  company={out.result.company}
                  jobTitle={out.result.jobTitle}
                  jobLocation={out.result.jobLocation}
                />
              )}
              {tab === "Job description" && (
                <>
                  <SalaryBanner jobDescription={out.result.jobDescription} className="mb-3" />
                  <div className="max-h-[40rem] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{out.result.jobDescription}</div>
                </>
              )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
