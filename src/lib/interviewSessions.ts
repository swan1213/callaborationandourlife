// Interview History: interviews recorded by the Interview Assistant (see models/InterviewSession.ts).
import { HttpError, requireUser } from "./auth";
import type { UserDoc } from "./models/User";
import { InterviewSession } from "./models/InterviewSession";
import { Profile } from "./models/Profile";
import { recordKeyResult, resolveOpenAI } from "./openaiKeys";
import { oid } from "./query";

export const STAGE_NAMES: Record<string, string> = {
  recruiter: "Recruiter call",
  hr: "HR / behavioral",
  technical: "Technical call",
  takehome: "Take-home review",
  final: "Final / hiring manager",
  onboarding: "Onboarding call",
};

/** Who may open Interview History: admins (everyone's), users and callers (their own). Bidders may not. */
export const canSeeHistory = (role: string) => role === "admin" || role === "user" || role === "caller";

/** Mongo filter of the recordings a user may see; throws 403 for roles without Interview History. */
export function historyScope(user: UserDoc): Record<string, unknown> {
  if (!canSeeHistory(user.role)) throw new HttpError(403, "Interview History is not available for your account");
  return user.role === "admin" ? {} : { user: user._id };
}

/** A recording the signed-in user may open; 404 otherwise. */
export async function loadSession(id: string) {
  const user = await requireUser();
  const s = await InterviewSession.findOne({ $and: [{ _id: oid(id, "interview") }, historyScope(user)] });
  if (!s) throw new HttpError(404, "Interview not found");
  return s;
}

type Caption = { t: number; text: string; translation?: string | null };
type Answer = { t: number; question: string; source: string; answer: string; keyPoints: string; meaning: string; mood: string };
export type Report = {
  summary: string;
  wentWell: string[];
  toImprove: { question: string; tip: string }[];
  thankYouEmail: string;
  nextStagePrep: string[];
  generatedAt?: number;
};
export type SessionDoc = {
  company: string;
  role: string;
  stage: string;
  startedAt: Date;
  endedAt?: Date | null;
  captions: Caption[];
  answers: Answer[];
  report?: Report | null;
  profile?: unknown;
};

/** "12:05" from the start of the interview. */
export function clock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The whole recording as a Markdown file. */
export function toMarkdown(s: SessionDoc) {
  const start = new Date(s.startedAt).getTime();
  const minutes = s.endedAt ? `${Math.max(1, Math.round((new Date(s.endedAt).getTime() - start) / 60000))} min` : "";
  const lines = [
    `# ${s.company || "Interview"}${s.role ? ` · ${s.role}` : ""}`,
    [STAGE_NAMES[s.stage] || s.stage, new Date(s.startedAt).toUTCString(), minutes, `${s.answers.length} question${s.answers.length === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
    "",
  ];
  const r = s.report;
  if (r) {
    lines.push("## Summary", r.summary, "");
    if (r.wentWell.length) lines.push("## What went well", ...r.wentWell.map((x) => `- ${x}`), "");
    if (r.toImprove.length) lines.push("## To improve", ...r.toImprove.map((x) => `- **${x.question}**: ${x.tip}`), "");
    if (r.nextStagePrep.length) lines.push("## Prepare next", ...r.nextStagePrep.map((x) => `- ${x}`), "");
    lines.push("## Thank-you email", r.thankYouEmail, "");
  }
  if (s.answers.length) {
    lines.push("## Questions and suggested answers", "");
    for (const a of s.answers) {
      lines.push(`### [${clock(a.t - start)}] ${a.question}${a.source === "prepared" ? " (prepared)" : ""}`, "");
      if (a.meaning) lines.push(`*What they meant:* ${a.meaning}`, "");
      if (a.mood) lines.push(`*Interviewer mood:* ${a.mood}`, "");
      if (a.answer) lines.push(a.answer, "");
      if (a.keyPoints) lines.push("**Key points**", "", a.keyPoints, "");
    }
  }
  lines.push("## Transcript", "");
  for (const c of s.captions) {
    lines.push(`[${clock(c.t - start)}] ${c.text}  `);
    if (c.translation) lines.push(`> ${c.translation}`);
  }
  return lines.join("\n") + "\n";
}

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "wentWell", "toImprove", "thankYouEmail", "nextStagePrep"],
  properties: {
    summary: { type: "string", description: "2-4 sentences: what the interview covered and how it went." },
    wentWell: { type: "array", items: { type: "string" }, description: "Up to 4 things the candidate did well." },
    toImprove: {
      type: "array",
      description: "Up to 4 questions that were hard or answered weakly, with a short tip for next time.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "tip"],
        properties: { question: { type: "string" }, tip: { type: "string" } },
      },
    },
    thankYouEmail: { type: "string", description: "A short, warm thank-you email, ready to send. Subject line first." },
    nextStagePrep: { type: "array", items: { type: "string" }, description: "Up to 5 concrete things to prepare next." },
  },
};

/** Writes the AI review with the OpenAI key of the interview's profile (or the default key). */
export async function generateReport(s: SessionDoc): Promise<Report> {
  const profile = s.profile ? await Profile.findById(s.profile).select("apiKey openaiModel").lean() : null;
  const openai = await resolveOpenAI(profile ?? {});
  const transcript = s.captions.map((c) => c.text).join("\n");
  const qa = s.answers.map((a) => `Q: ${a.question}\nSuggested answer: ${a.answer}`).join("\n\n");
  try {
    const res = await openai.client.chat.completions.create({
      model: openai.model,
      response_format: { type: "json_schema", json_schema: { name: "interview_report", schema: REPORT_SCHEMA, strict: true } },
      messages: [
        {
          role: "system",
          content: `You review a job interview for a non-native English speaker and help them improve.
Write in simple, clear English. Be honest but encouraging. Base everything only on the transcript.
The transcript comes from automatic captions of the interviewer's side and may contain errors.`,
        },
        {
          role: "user",
          content: `Company: ${s.company || "unknown"}
Role: ${s.role || "unknown"}
Stage: ${STAGE_NAMES[s.stage] || s.stage || "unknown"}

INTERVIEWER TRANSCRIPT (captions):
${(transcript.length > 30000 ? "…" + transcript.slice(-30000) : transcript) || "(empty)"}

QUESTIONS AND THE ANSWERS THE ASSISTANT SUGGESTED:
${qa || "(none)"}`,
        },
      ],
    });
    const text = res.choices[0]?.message?.content;
    if (!text) throw new HttpError(502, "OpenAI did not return a review. Try again.");
    await recordKeyResult(openai.apiKeyId);
    return { ...(JSON.parse(text) as Report), generatedAt: Date.now() };
  } catch (e) {
    await recordKeyResult(openai.apiKeyId, e instanceof Error ? e.message : String(e));
    throw e instanceof HttpError ? e : new HttpError(502, `Could not write the review: ${e instanceof Error ? e.message : e}`);
  }
}
