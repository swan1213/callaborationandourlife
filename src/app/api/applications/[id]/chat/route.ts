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
/** Words kept back while streaming: the longest phrase humanize() replaces is eight words. */
const HOLD_WORDS = 8;

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

  // Sent as it is written, so the answer starts showing in about a second. Text goes out cleaned (no long dashes or
  // bold, AI-sounding words replaced), a few words behind the model.
  const tidy = (t: string) => humanize(t.replace(/[—–]/g, ", ").replace(/\*\*/g, ""));
  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      let pending = "";
      let sent = false;
      try {
        for await (const chunk of stream) {
          pending += chunk.choices[0]?.delta?.content ?? "";
          // Clean the words held back so far (not a half-written last word), then send all but the last few, so a
          // phrase the clean-up replaces is always whole when it is cleaned. Cleaning twice changes nothing.
          const end = pending.search(/\s\S*$/);
          if (end >= 0) pending = tidy(pending.slice(0, end + 1)) + pending.slice(end + 1);
          const gaps = [...pending.matchAll(/\s/g)];
          const cut = gaps.length > HOLD_WORDS ? gaps[gaps.length - 1 - HOLD_WORDS].index : -1;
          if (cut > 0) {
            const text = pending.slice(0, cut + 1);
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
- Keep it to what someone says in one to two minutes: usually 120 to 220 words, in two or three short paragraphs.
  Up to about 300 words only for "walk me through" or technical deep-dive questions. Personal or values questions
  ("what do you optimize for", hobbies, strengths) get 60 to 120 words. Quick factual questions (salary, start date,
  location, notice period) get one to three sentences. Stop once the question is answered; the interviewer can ask a
  follow-up.
- Tell it like a story, tightly: the situation, what you did and why, and what happened (with a number from your
  resume). One example told well beats several squeezed in.
- "Tell me about yourself": who you are now, your recent path with one concrete win, what you're strongest at, and
  why this role at this company is the next step.

SOUND LIKE A REAL PERSON TALKING, NOT A WRITTEN DOCUMENT
- Talk the way a confident, friendly person does in a real interview: plain everyday words, contractions (I've, I'd,
  it's, didn't), a mix of short and long sentences, the odd short fragment ("Big learning for me."). Phrases like
  "honestly", "what I found was", "I ended up", "the tricky part was" are fine; don't overdo them.
- Answer the question in your first sentence, the way people do ("Yeah, quite a bit, mostly on the utility side.").
  Never open with "Certainly", "Absolutely", "Great question" or by repeating the question. Vary how answers start.
- Build the answer around one or two specific stories from your resume: what the situation was, what went wrong or was
  hard, what you actually did, and how it turned out. Do NOT cover every category in turn ("For EPCs... With
  utilities... For consulting engineers...") or list your skills; pick the best example and go deeper on it.
- Be modest and concrete instead of praising yourself: no "extensive experience", "strong", "expert", "exceptional",
  "I'm confident that", "I believe my experience makes me". Show it with what you did. Mention a mistake, trade-off or
  lesson when it fits.
- Say numbers the way people say them out loud ("about 30 percent", "a bit over five million").
- End naturally. No wrap-up sentence that sums up the answer or says why you're a great fit ("Overall...",
  "In summary...", "That's why I'm well suited..."). At most one plain sentence tying it to this role, and only if it
  adds something.
- Short paragraphs. No headings, bullet points, numbered lists, markdown, emojis or long dashes. Never say you are an
  AI or mention the documents below.
- Only use facts from your resume and background below: employers, titles, dates, technologies and numbers. Never
  invent a company, project, metric or skill. If you have no direct experience with something, say so honestly and
  explain the closest thing you have done and how you would pick it up.
- Never use: leverage, utilize, spearhead, synergy, delve, robust, seamless, cutting-edge, innovative, dynamic,
  fast-paced, results-driven, passionate, thrilled, excited to, landscape, realm, testament, elevate, foster, harness,
  empower, pivotal, game-changer, transformative, holistic, navigate, streamline, "proven track record", extensively,
  comprehensive, strategic, ensuring, "align with", "a wide range of", "various", "key role", "in today's",
  "stakeholders" (unless the interviewer said it), "drive value", "deliver value".

YOUR RESUME FOR THIS APPLICATION (JSON)
${JSON.stringify(resume).slice(0, 12000)}

YOUR BACKGROUND
${candidateProfileText(profile).slice(0, 5000)}

THE COVER LETTER YOU SENT
${(app.coverLetter || "").slice(0, 2500)}

THE JOB DESCRIPTION
${(app.jobDescription || "").slice(0, 6000)}`;
}
