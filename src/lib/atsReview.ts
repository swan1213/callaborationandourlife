// AI ATS review of a tailored resume against its job description (api/applications/[id]/ats).
// Client-safe: the result type, the scoring rubric, the prompt and the parser. The OpenAI call is lib/atsReviewRun.ts.

import type { ResumeContent } from "./generate";

/** Rubric the model scores (0–100 each); the overall score is their weighted average, computed here, not by the model. */
export const ATS_CATEGORIES = [
  { key: "required", label: "Required skills & qualifications", weight: 35 },
  { key: "experience", label: "Relevant experience", weight: 25 },
  { key: "title", label: "Job title & seniority", weight: 15 },
  { key: "preferred", label: "Preferred skills", weight: 10 },
  { key: "impact", label: "Impact & results", weight: 10 },
  { key: "format", label: "ATS readability", weight: 5 },
] as const;
export type AtsCategoryKey = (typeof ATS_CATEGORIES)[number]["key"];

export type AtsReview = {
  score: number;
  verdict: string;
  categories: { key: AtsCategoryKey; score: number; note: string }[];
  matched: string[];
  missingRequired: string[];
  missingPreferred: string[];
  suggestions: string[];
  model: string;
  reviewedAt: string;
  /** reviewKey() of the resume and job description reviewed: a different key means the review is out of date. */
  key: string;
};

/** Short fingerprint (FNV-1a) of what was reviewed, so the page can tell when the resume or posting changed since. */
export function reviewKey(resume: ResumeContent | null | undefined, jobDescription: string) {
  const s = JSON.stringify([resume ?? null, jobDescription ?? ""]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const text = (v: unknown, max = 400) => (typeof v === "string" ? v.replace(/\*\*/g, "").trim().slice(0, max) : "");
const list = (v: unknown, n: number, max = 120) =>
  [...new Set((Array.isArray(v) ? v : []).map((x) => text(x, max)).filter(Boolean))].slice(0, n);

/** The model's JSON → a clean AtsReview (missing or odd fields become empty, scores are clamped). */
export function parseAtsReview(raw: unknown, meta: { model: string; key: string }): AtsReview {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cats = (o.categories && typeof o.categories === "object" ? o.categories : {}) as Record<string, { score?: unknown; note?: unknown } | undefined>;
  const categories = ATS_CATEGORIES.map((c) => ({ key: c.key, score: clamp(cats[c.key]?.score), note: text(cats[c.key]?.note, 300) }));
  const total = ATS_CATEGORIES.reduce((a, c) => a + c.weight, 0);
  const score = Math.round(categories.reduce((a, c, i) => a + c.score * ATS_CATEGORIES[i].weight, 0) / total);
  // Each item in one list only: required wins over preferred, and anything missing isn't also "matched".
  const missingRequired = list(o.missingRequired, 20);
  const seen = new Set(missingRequired.map((t) => t.toLowerCase()));
  const missingPreferred = list(o.missingPreferred, 20).filter((t) => !seen.has(t.toLowerCase()));
  for (const t of missingPreferred) seen.add(t.toLowerCase());
  return {
    score,
    verdict: text(o.verdict, 300),
    categories,
    matched: list(o.matched, 30).filter((t) => !seen.has(t.toLowerCase())),
    missingRequired,
    missingPreferred,
    suggestions: list(o.suggestions, 6, 300),
    model: meta.model,
    reviewedAt: new Date().toISOString(),
    key: meta.key,
  };
}

/** System prompt for the review; the reply is read by parseAtsReview(). */
export const ATS_SYSTEM_PROMPT = `You are an applicant tracking system (ATS) combined with an experienced technical recruiter doing the first
screen. Score how well the RESUME fits the JOB DESCRIPTION, the way a modern ATS (Workday, Greenhouse, Lever, iCIMS) ranks
candidates and a recruiter decides who moves on.

Score each category from 0 to 100:
${ATS_CATEGORIES.map((c) => `- ${c.key}: ${c.label}`).join("\n")}

How to judge:
- required: the must-have skills, tools, years of experience, degrees and domain knowledge the posting asks for. A skill
  counts when the resume clearly shows it, by name or an exact equivalent (PostgreSQL shows SQL, EKS shows Kubernetes).
  "X or Y" in the posting is met by either one.
- experience: how closely the roles, responsibilities, scale and industry match the job's day-to-day work, and whether
  the years of experience meet the posting.
- title: whether the resume's titles and seniority match the role (a Senior posting wants senior-level scope).
- preferred: the nice-to-have skills.
- impact: bullets that show concrete outcomes (numbers, scale, results) relevant to this job, not just duties.
- format: clear sections, standard headings, dates on every role, plain text an ATS can parse, no keyword stuffing.
Be strict and realistic: 90+ only when every requirement is clearly met with strong evidence; 70-89 a solid fit worth
interviewing; 50-69 partial fit with real gaps; below 50 a poor fit. Listing a keyword without any supporting
experience counts for little.

Reply with JSON only:
{
  "categories": { ${ATS_CATEGORIES.map((c) => `"${c.key}": { "score": number, "note": string }`).join(", ")} },
  "verdict": string,
  "matched": string[],
  "missingRequired": string[],
  "missingPreferred": string[],
  "suggestions": string[]
}
- note: one short sentence explaining that category's score.
- verdict: one sentence a recruiter would write about this candidate for this job.
- matched: the posting's key skills and requirements the resume shows (short names, most important first, up to 15).
- missingRequired / missingPreferred: requirements from the posting the resume does not show (short names), the
  must-haves in missingRequired and the nice-to-haves in missingPreferred. Put each item in exactly one of matched,
  missingRequired and missingPreferred.
- suggestions: up to 5 specific, honest edits that would raise the score, e.g. which existing bullet to reword to name a
  skill the candidate already shows. Never suggest claiming experience the resume gives no evidence of; call such
  items gaps instead.`;
