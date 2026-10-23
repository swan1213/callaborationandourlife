import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { Profile } from "@/lib/models/Profile";
import { candidateProfileText, humanize, type ResumeContent } from "@/lib/generate";
import { recordKeyResult, resolveOpenAI, samplingFor } from "@/lib/openaiKeys";
import { oid } from "@/lib/query";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
type Turn = { role: "user" | "assistant"; content: string };

/** The opening question the chat starts with. */
const FIRST_QUESTION = "Tell me about yourself.";
/** Recent turns sent back each time: enough context for follow-ups, small enough to start answering fast. */
const MAX_TURNS = 12;
const MAX_CHARS = 4000;

/**
 * POST { messages: [{ role: "user" | "assistant", content }] } → the answer as streamed plain text
 * Interview practice chat on an application (components/InterviewChat.tsx): the AI answers the interviewer's latest
 * question as the candidate, from this application's resume, job description and the profile. Nothing is stored;
 * the page sends the conversation so far. No messages = the opening question ("Tell me about yourself.").
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const app = await Application.findById(oid((await params).id)).lean();
  const isOwner = app && String(app.user) === String(user._id) && !app.deletedByUser;
  const isRep = app && user.role === "user" && canManageProfile(user, app.profile);
  if (!app || (!isOwner && !isRep && user.role !== "admin")) throw new HttpError(404, "Application not found");
  if (!app.resume) throw new HttpError(400, "Generate the application first: the chat answers from its resume and job description.");
  const profile = await Profile.findById(app.profile).lean();
  if (!profile) throw new HttpError(404, "This application's profile was deleted");

  const body = await req.json().catch(() => ({}));
  const raw: unknown[] = Array.isArray(body.messages) ? body.messages : [];
  const turns: Turn[] = raw
    .slice(-MAX_TURNS)
    .map((m) => m as Partial<Turn>)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role!, content: m.content!.trim().slice(0, MAX_CHARS) }));
  if (!turns.length) turns.push({ role: "user", content: FIRST_QUESTION });
  if (turns[turns.length - 1].role !== "user") throw new HttpError(400, "Ask a question first");

  const openai = await resolveOpenAI(profile);
  let stream;
  try {
    stream = await openai.client.chat.completions.create({
      model: openai.model,
      // Spoken answers need little reasoning.
      ...samplingFor(openai.model, 0.7),
      stream: true,
      messages: [{ role: "system", content: systemPrompt(app, profile) }, ...turns],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    await recordKeyResult(openai.apiKeyId, msg);
    throw new HttpError(502, `OpenAI error: ${msg}`);
  }

  // Sent as it is written, so the answer starts showing in about a second. Text goes out up to the last space, cleaned
  // (no long dashes or bold, AI-sounding words replaced) a few words at a time.
  const tidy = (t: string) => humanize(t.replace(/[—–]/g, ", ").replace(/\*\*/g, ""));
  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      let pending = "";
      let sent = false;
      try {
        for await (const chunk of stream) {
          pending += chunk.choices[0]?.delta?.content ?? "";
          const cut = pending.search(/\s\S*$/);
          if (cut > 0) {
            const text = tidy(pending.slice(0, cut + 1));
            pending = pending.slice(cut + 1);
            if (text) {
              controller.enqueue(encoder.encode(sent ? text : text.trimStart()));
              sent = true;
            }
          }
        }
        if (pending) controller.enqueue(encoder.encode(tidy(pending)));
        await recordKeyResult(openai.apiKeyId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "OpenAI request failed";
        await recordKeyResult(openai.apiKeyId, msg).catch(() => {});
        controller.enqueue(encoder.encode(`\n\n[The answer was cut off: ${msg}. Ask again.]`));
      }
      controller.close();
    },
  });
  return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
});

function systemPrompt(
  app: { company?: string | null; jobTitle?: string | null; jobDescription?: string | null; coverLetter?: string | null; resume?: unknown },
  profile: Parameters<typeof candidateProfileText>[0]
) {
  const resume = app.resume as ResumeContent;
  const role = [app.jobTitle || "this role", app.company ? `at ${app.company}` : ""].filter(Boolean).join(" ");
  return `You are ${profile.fullName}, a candidate in a job interview for ${role}. The user is the interviewer.
Answer each question out loud, as yourself, in the first person.

HOW TO ANSWER
- Give a full, thorough answer that explains everything the interviewer needs: usually 300 to 450 words, more for
  "walk me through" or technical deep-dive questions, less only for quick factual questions (salary, start date, location).
- Tell it like a story: the situation, what you did and why, the tools and decisions involved, what happened (with the
  numbers from your resume), and how it connects to this job's needs.
- "Tell me about yourself": who you are now, the path through your recent roles with one or two concrete wins each,
  what you are strongest at, and why this role at this company is the next step.
- Spoken style: plain words, contractions (I've, I'd), varied sentence length, natural transitions. Short paragraphs.
  No headings, bullet points, markdown, emojis or long dashes. Never say you are an AI or mention the documents below.
- Only use facts from your resume and background below: employers, titles, dates, technologies and numbers. Never
  invent a company, project, metric or skill. If you have no direct experience with something, say so honestly and
  explain the closest thing you have done and how you would pick it up.
- Never use: leverage, utilize, spearhead, synergy, delve, robust, seamless, cutting-edge, innovative, dynamic,
  fast-paced, results-driven, passionate, thrilled, excited to, landscape, realm, testament, elevate, foster, harness,
  empower, pivotal, game-changer, transformative, holistic, navigate, streamline, "proven track record".

YOUR RESUME FOR THIS APPLICATION (JSON)
${JSON.stringify(resume).slice(0, 12000)}

YOUR BACKGROUND
${candidateProfileText(profile).slice(0, 5000)}

THE COVER LETTER YOU SENT
${(app.coverLetter || "").slice(0, 2500)}

THE JOB DESCRIPTION
${(app.jobDescription || "").slice(0, 6000)}`;
}
