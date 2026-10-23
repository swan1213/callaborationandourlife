"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleCheck, CircleX, Gauge, Lightbulb, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import type { ResumeContent } from "@/lib/generate";
import { matchLabel, scoreCoverLetter, scoreResume, type JobKeyword, type MatchResult } from "@/lib/matchScore";
import { ATS_CATEGORIES, reviewKey, type AtsReview } from "@/lib/atsReview";
import { EmptyState, fmtDateTime, Section, Segmented, Spinner } from "./ui";
import { useToast } from "./Alerts";

const tone = (score: number) => (score >= 80 ? "text-emerald-600" : score >= 65 ? "text-indigo-600" : score >= 45 ? "text-amber-600" : "text-rose-600");
const stroke = (score: number) => (score >= 80 ? "#059669" : score >= 65 ? "#5560c9" : score >= 45 ? "#d97706" : "#e11d48");

/** Circular score gauge (0–100). */
function Ring({ score }: { score: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 72 72" className="size-20 -rotate-90" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={stroke(score)} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <div className={`absolute inset-0 grid place-items-center text-xl font-semibold tabular-nums ${tone(score)}`}>{score}</div>
    </div>
  );
}

function Chips({ items, kind }: { items: JobKeyword[]; kind: "hit" | "miss" }) {
  if (!items.length) return <div className="text-xs text-slate-400">None</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((k) => (
        <span
          key={k.term}
          title={[k.required ? "Required in the posting" : "Mentioned in the posting", k.alts?.length ? `Either this or ${k.alts.join(" / ")}` : ""].filter(Boolean).join(" · ")}
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 ring-inset ${
            kind === "hit" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : k.required ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"
          }`}
        >
          {kind === "hit" && <Check className="size-3" />}
          {k.term}
          {kind === "miss" && k.required && <span className="font-semibold">*</span>}
        </span>
      ))}
    </div>
  );
}

function Result({ r, what }: { r: MatchResult; what: string }) {
  const required = r.missing.filter((k) => k.required).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Ring score={r.score} />
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${tone(r.score)}`}>{matchLabel(r.score)}</div>
          <div className="mt-0.5 text-[13px] text-slate-500">
            {r.matched.length} of {r.matched.length + r.missing.length} job keywords found in the {what}
            {required ? `; ${required} required ${required === 1 ? "is" : "are"} missing` : ""}.
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[13px] font-medium text-slate-700">Missing keywords</div>
        <Chips items={r.missing} kind="miss" />
        {r.softMissing.length > 0 && <div className="mt-1.5 text-xs text-slate-500">Also in the posting: {r.softMissing.join(", ")}</div>}
      </div>
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-slate-700">Matched keywords</div>
        <Chips items={r.matched} kind="hit" />
      </div>

      <ul className="space-y-1.5 border-t border-slate-200 pt-3">
        {r.checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-[13px]">
            {c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-slate-400" />}
            <span className={c.ok ? "text-slate-700" : "text-slate-500"}>{c.label}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400">* required in the posting. An estimate of keyword fit; each company's ATS scores differently.</p>
    </div>
  );
}

function TextChips({ items, kind }: { items: string[]; kind: "hit" | "required" | "preferred" }) {
  if (!items.length) return <div className="text-xs text-slate-400">None</div>;
  const cls = kind === "hit" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : kind === "required" ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20";
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 ring-inset ${cls}`}>
          {kind === "hit" && <Check className="size-3" />}
          {t}
        </span>
      ))}
    </div>
  );
}

/** The AI ATS review, or a button to run one. */
function AiReview({
  runReview,
  review,
  stale,
  onReviewed,
}: {
  runReview: () => Promise<AtsReview>;
  review: AtsReview | null;
  stale: boolean;
  onReviewed: (r: AtsReview) => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function run() {
    setBusy(true);
    try {
      onReviewed(await runReview());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The AI review failed");
    } finally {
      setBusy(false);
    }
  }

  if (!review)
    return (
      <EmptyState
        icon={Sparkles}
        title="AI ATS review"
        description="The AI scores the resume against the posting the way an ATS and a recruiter screen it: required skills, experience, title, results and readability. Uses the profile's OpenAI key."
        className="py-6"
        action={
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={run}>
            {busy ? <Spinner /> : <Sparkles />} {busy ? "Reviewing… (up to a minute)" : "Run AI review"}
          </button>
        }
      />
    );

  return (
    <div className="space-y-4">
      {stale && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/20">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          The resume or job description changed after this review. Run it again for an up-to-date score.
        </div>
      )}
      <div className="flex items-center gap-4">
        <Ring score={review.score} />
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${tone(review.score)}`}>{matchLabel(review.score)}</div>
          {review.verdict && <div className="mt-0.5 text-[13px] text-slate-500">{review.verdict}</div>}
        </div>
      </div>

      <ul className="space-y-2.5">
        {ATS_CATEGORIES.map((c) => {
          const r = review.categories.find((x) => x.key === c.key);
          const s = r?.score ?? 0;
          return (
            <li key={c.key} title={r?.note || undefined}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-slate-700">{c.label}</span>
                <span className={`font-medium tabular-nums ${tone(s)}`}>{s}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${s}%`, background: stroke(s) }} />
              </div>
              {r?.note && <div className="mt-1 text-xs text-slate-500">{r.note}</div>}
            </li>
          );
        })}
      </ul>

      <div>
        <div className="mb-1.5 text-[13px] font-medium text-slate-700">Missing requirements</div>
        <TextChips items={review.missingRequired} kind="required" />
      </div>
      {review.missingPreferred.length > 0 && (
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-slate-700">Missing nice-to-haves</div>
          <TextChips items={review.missingPreferred} kind="preferred" />
        </div>
      )}
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-slate-700">Matched</div>
        <TextChips items={review.matched} kind="hit" />
      </div>

      {review.suggestions.length > 0 && (
        <div className="border-t border-slate-200 pt-3">
          <div className="mb-1.5 text-[13px] font-medium text-slate-700">How to raise the score</div>
          <ul className="space-y-1.5">
            {review.suggestions.map((s) => (
              <li key={s} className="flex items-start gap-2 text-[13px] text-slate-600">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
        <p className="text-xs text-slate-400">
          <span className="font-mono">{review.model}</span> · {fmtDateTime(review.reviewedAt)}
        </p>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={run}>
          {busy ? <Spinner /> : <RefreshCw />} {busy ? "Reviewing…" : "Run again"}
        </button>
      </div>
      <p className="text-xs text-slate-400">An AI estimate of how an ATS and a recruiter would rank this resume; each company screens differently.</p>
    </div>
  );
}

/**
 * Keyword match of the resume and cover letter against the job description (updates live as the letter is edited).
 * With `runReview`, also an AI ATS review tab (`atsReview`: a review saved earlier).
 */
export default function MatchScore({
  resume,
  coverLetter,
  jobDescription,
  company,
  jobTitle,
  runReview,
  atsReview = null,
  className = "",
}: {
  resume: ResumeContent;
  coverLetter: string;
  jobDescription: string;
  company: string;
  jobTitle: string;
  runReview?: () => Promise<AtsReview>;
  atsReview?: AtsReview | null;
  className?: string;
}) {
  const [doc, setDoc] = useState<"resume" | "letter" | "ai">("resume");
  const [review, setReview] = useState(atsReview);
  useEffect(() => setReview(atsReview), [atsReview]);
  const stale = !!review && review.key !== reviewKey(resume, jobDescription);
  const resumeScore = useMemo(() => scoreResume(resume, jobDescription, jobTitle), [resume, jobDescription, jobTitle]);
  const letterScore = useMemo(() => scoreCoverLetter(coverLetter, jobDescription, company, jobTitle), [coverLetter, jobDescription, company, jobTitle]);
  const noKeywords = !resumeScore.matched.length && !resumeScore.missing.length;

  return (
    <Section
      title="Job match"
      description="How well the documents cover the job description"
      className={className}
    >
      <Segmented
        label="Document"
        value={doc}
        onChange={setDoc}
        className="mb-4 flex w-full [&>button]:flex-1 [&>button]:justify-center"
        options={[
          { value: "resume", label: "Resume", count: resumeScore.score },
          { value: "letter", label: "Cover letter", count: letterScore.score },
          ...(runReview ? [{ value: "ai" as const, label: "AI review", count: review?.score }] : []),
        ]}
      />
      {!jobDescription.trim() ? (
        <EmptyState icon={Gauge} title="No job description" description="Add the job description to see how well the documents match it." className="py-6" />
      ) : doc === "ai" && runReview ? (
        <AiReview runReview={runReview} review={review} stale={stale} onReviewed={setReview} />
      ) : noKeywords && doc === "resume" ? (
        <EmptyState icon={Gauge} title="No skills found in the posting" description="The job description doesn't name specific tools or skills, so there is nothing to match against." className="py-6" />
      ) : doc === "resume" ? (
        <Result r={resumeScore} what="resume" />
      ) : (
        <Result r={letterScore} what="cover letter" />
      )}
    </Section>
  );
}
