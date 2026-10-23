"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Check, FileSpreadsheet, Inbox, Link2, Sparkles } from "lucide-react";
import { Alert, api, ApiError, Badge, EmptyState, fmtDateTime, PageHeader, Spinner, CardSkeleton, useAsync } from "@/components/ui";

type ProfileOpt = {
  id: string;
  label: string;
  fullName: string;
  location: string;
  title: string;
  monthlyQuota: number;
  usedThisMonth: number;
};

type Recent = { _id: string; company: string; jobTitle: string; status: string; createdAt: string; profile?: { label: string } };

/** Numbered step heading. */
function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-5 shrink-0 place-items-center rounded-full border border-slate-300 bg-slate-50 text-[11px] font-semibold text-slate-700 tabular-nums">{n}</span>
      <h2 className="card-title">{title}</h2>
    </div>
  );
}

export default function GeneratePage() {
  const router = useRouter();
  const profiles = useAsync(() => api<{ profiles: ProfileOpt[] }>("/api/profiles").then((r) => r.profiles), []);
  const recent = useAsync(() => api<{ items: Recent[] }>("/api/applications?limit=5").then((r) => r.items), []);

  const [profileId, setProfileId] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [manual, setManual] = useState(false);
  const [jobText, setJobText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicateId, setDuplicateId] = useState("");

  useEffect(() => {
    if (!profileId && profiles.data?.length) setProfileId(profiles.data[0].id);
  }, [profiles.data, profileId]);

  async function generate(force = false) {
    setBusy(true);
    setError("");
    setDuplicateId("");
    try {
      const r = await api<{ id: string; status: string; company: string; jobTitle: string }>("/api/applications/generate", {
        method: "POST",
        json: { profileId, jobUrl, jobText: manual ? jobText : "", force, keepOnScrapeFail: !manual },
      });
      // Generated → download/submit page. Not generated (page unreadable / AI failed) → saved; its page asks for the description.
      router.push(r.status === "not_generated" ? `/applications/${r.id}` : `/applications/${r.id}?new=1`);
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.status === 409 && err.data.duplicateId) setDuplicateId(String(err.data.duplicateId));
      if (err.status === 422) setManual(true);
    } finally {
      setBusy(false);
    }
  }

  const selected = profiles.data?.find((p) => p.id === profileId);
  const quotaFull = !!selected && selected.monthlyQuota > 0 && selected.usedThisMonth >= selected.monthlyQuota;
  const canSubmit = !!profileId && !busy && !quotaFull && (manual ? jobText.trim().length >= 100 : /^https?:\/\/\S+/.test(jobUrl.trim()));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Generate application"
        subtitle="Paste a full-time job URL. We scrape the posting and create a tailored resume, cover letter and job description."
        actions={
          <Link href="/dashboard/import" className="btn btn-secondary">
            <FileSpreadsheet />
            Import CSV
          </Link>
        }
      />

      {profiles.loading ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-1">
            {Array.from({ length: 3 }, (_, i) => (
              <CardSkeleton key={i} lines={2} />
            ))}
          </div>
          <CardSkeleton lines={6} className="lg:col-span-2" />
        </div>
      ) : profiles.error ? (
        <Alert>{profiles.error}</Alert>
      ) : !profiles.data?.length ? (
        <Alert kind="info">No profiles are assigned to you yet. Ask an administrator to assign one.</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-3 lg:col-span-1">
            <StepTitle n={1} title="Choose a profile" />
            <div className="space-y-2">
              {profiles.data.map((p) => {
                const full = p.monthlyQuota > 0 && p.usedThisMonth >= p.monthlyQuota;
                const active = p.id === profileId;
                const ratio = p.monthlyQuota > 0 ? Math.min(1, p.usedThisMonth / p.monthlyQuota) : 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setProfileId(p.id)}
                    className={`card w-full cursor-pointer p-4 text-left transition-[border-color,box-shadow] ${
                      active ? "border-indigo-500 ring-[3px] ring-indigo-500/15" : "hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{p.label}</div>
                        <div className="truncate text-[13px] text-slate-500">
                          {p.fullName}
                          {p.title && ` · ${p.title}`}
                        </div>
                      </div>
                      <span
                        aria-hidden
                        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"}`}
                      >
                        {active && <Check className="size-3" strokeWidth={3} />}
                      </span>
                    </div>
                    {p.monthlyQuota > 0 && (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${ratio >= 1 ? "bg-rose-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-indigo-600"}`}
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    )}
                    <div className={`mt-2 text-xs tabular-nums ${full ? "text-rose-600" : "text-slate-500"}`}>
                      {p.monthlyQuota > 0 ? `${p.usedThisMonth} / ${p.monthlyQuota} used this month` : `${p.usedThisMonth} generated this month`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 space-y-6 lg:col-span-2">
            <form
              className="card p-0"
              onSubmit={(e) => {
                e.preventDefault();
                generate();
              }}
            >
              <div className="card-header">
                <StepTitle n={2} title="Job posting" />
              </div>
              <div className="card-body space-y-4">
                <div>
                  <label className="label">Job URL</label>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      className="input pl-9"
                      type="url"
                      placeholder="https://boards.greenhouse.io/company/jobs/123456"
                      value={jobUrl}
                      onChange={(e) => setJobUrl(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" className="size-4 rounded" checked={manual} onChange={(e) => setManual(e.target.checked)} />
                  Paste the job description manually (for pages that block scraping)
                </label>
                {manual && (
                  <div>
                    <label className="label">Job description</label>
                    <textarea
                      className="input min-h-48"
                      placeholder="Paste the full job description here…"
                      value={jobText}
                      onChange={(e) => setJobText(e.target.value)}
                      disabled={busy}
                    />
                    <div className={`hint tabular-nums ${jobText.trim().length >= 100 ? "text-emerald-600" : ""}`}>{jobText.trim().length} characters (min 100)</div>
                  </div>
                )}
                {quotaFull && <Alert>This profile has reached its monthly quota.</Alert>}
                {error && (
                  <Alert>
                    {error}
                    {duplicateId && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link href={`/applications/${duplicateId}`} className="btn btn-secondary btn-sm">
                          View existing
                        </Link>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => generate(true)}>
                          Generate anyway
                        </button>
                      </div>
                    )}
                  </Alert>
                )}
              </div>
              <div className="card-footer">
                <button className="btn btn-primary btn-lg h-auto min-h-10 w-full py-2 text-center whitespace-normal sm:w-auto" disabled={!canSubmit}>
                  {busy ? (
                    <>
                      <Spinner /> Scraping & tailoring… this can take up to a minute
                    </>
                  ) : (
                    <>
                      <Sparkles />
                      Generate resume, cover letter & JD
                    </>
                  )}
                </button>
              </div>
            </form>

            <section className="card p-0">
              <div className="card-header">
                <h2 className="card-title">Recent</h2>
                <Link href="/applications" className="link inline-flex items-center gap-1 text-[13px]">
                  View all
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
              {recent.data?.length ? (
                <ul className="divide-y divide-slate-200">
                  {recent.data.map((a) => (
                    <li key={a._id}>
                      <Link href={`/applications/${a._id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {a.jobTitle || "Untitled"} · {a.company}
                          </div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {fmtDateTime(a.createdAt)} · {a.profile?.label}
                          </div>
                        </div>
                        <Badge value={a.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Inbox} title="Nothing generated yet." className="py-10" />
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
