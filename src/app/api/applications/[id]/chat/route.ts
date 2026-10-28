import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { Profile } from "@/lib/models/Profile";
import { candidateProfileText, humanize, type ResumeContent } from "@/lib/generate";
import { recordKeyResult, resolveOpenAI, samplingFor } from "@/lib/openaiKeys";
import { oid } from "@/lib/query";
import type OpenAI from "openai";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
type Turn = { role: "user" | "assistant"; content: string; images: string[]; files: { name: string; text: string }[] };
type Message = OpenAI.Chat.ChatCompletionMessageParam;

/** The opening question the chat starts with. */
const FIRST_QUESTION = "Tell me about yourself.";
/** Recent turns sent back each time: enough context for follow-ups, small enough to start answering fast. */
const MAX_TURNS = 12;
const MAX_CHARS = 4000;
/** Words kept back while streaming: the longest phrase humanize() replaces is eight words. */
const HOLD_WORDS = 8;
/** Attachments: images as data URLs (the page shrinks them), the newest few only; document text, newest first. */
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 2_000_000;
const IMAGE_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_FILES = 3;
const MAX_FILE_CHARS = 12000;
const MAX_ALL_FILE_CHARS = 30000;

/**
 * POST { messages: [{ role: "user" | "assistant", content, images?: [dataUrl], files?: [{ name, text }] }] } → the
 * answer as streamed plain text
 * Interview practice chat on an application (components/InterviewChat.tsx): the AI answers the interviewer's latest
 * question as the candidate, from this application's resume, job description and the profile. A question can carry
 * images (a screenshot of a form or task) and documents (their text, read by ./attach). Nothing is stored; the page
 * sends the conversation so far. No messages = the opening question ("Tell me about yourself.").
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
    .map((m) => ({
      role: m.role!,
      content: typeof m.content === "string" ? m.content.trim().slice(0, MAX_CHARS) : "",
      images: m.role === "user" && Array.isArray(m.images) ? m.images.filter((u) => typeof u === "string" && u.length <= MAX_IMAGE_CHARS && IMAGE_URL.test(u)) : [],
      files:
        m.role === "user" && Array.isArray(m.files)
          ? m.files
              .filter((f) => f && typeof f.name === "string" && typeof f.text === "string" && f.text.trim())
              .slice(0, MAX_FILES)
              .map((f) => ({ name: f.name.slice(0, 120), text: f.text.slice(0, MAX_FILE_CHARS) }))
          : [],
    }))
    .filter((m) => (m.role === "user" || m.role === "assistant") && (m.content || m.images.length || m.files.length));
  if (!turns.length) turns.push({ role: "user", content: FIRST_QUESTION, images: [], files: [] });
  if (turns[turns.length - 1].role !== "user") throw new HttpError(400, "Ask a question first");
  // Only the newest attachments go to the model: older images and documents are named instead.
  let images = MAX_IMAGES;
  let fileChars = MAX_ALL_FILE_CHARS;
  const messages: Message[] = turns
    .slice()
    .reverse()
    .map((t): Message => {
      if (t.role === "assistant") return { role: "assistant", content: t.content };
      const docs = t.files.map((f) => {
        const keep = Math.max(0, Math.min(f.text.length, fileChars));
        fileChars -= keep;
        return keep ? `ATTACHED FILE "${f.name}":\n${f.text.slice(0, keep)}` : `(Attached earlier: "${f.name}")`;
      });
      const shown = t.images.slice(0, Math.max(0, images));
      images -= shown.length;
      const dropped = t.images.length - shown.length;
      const text = [
        t.content || (t.images.length || t.files.length ? "Please look at what I attached." : ""),
        ...docs,
        ...(dropped ? [`(${dropped} image${dropped > 1 ? "s" : ""} shared earlier)`] : []),
      ].join("\n\n");
      if (!shown.length) return { role: "user", content: text };
      return { role: "user", content: [{ type: "text", text }, ...shown.map((url) => ({ type: "image_url" as const, image_url: { url } }))] };
    })
    .reverse();

  const openai = await resolveOpenAI(profile);
  let stream;
  try {
    stream = await openai.client.chat.completions.create({
      model: openai.model,
      // Spoken answers need little reasoning.
      ...samplingFor(openai.model, 0.7),
      stream: true,
      messages: [{ role: "system", content: systemPrompt(app, profile) }, ...messages],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    await recordKeyResult(openai.apiKeyId, msg);
    // A model without vision refuses images: say what to do instead of the raw error.
    if (turns.some((t) => t.images.length) && /image|vision|multimodal|content type/i.test(msg))
      throw new HttpError(400, `The AI model "${openai.model}" can't read images. Paste the text instead, or ask an administrator for a model that reads images (e.g. gpt-4.1-mini).`);
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
  return `You are ${profile.fullName}, a candidate in a live, spoken job interview for ${role}. The user is the interviewer.
Answer each question out loud, as yourself, in the first person. Your words are said out loud, so they must sound like
talking, not like a resume, cover letter or LinkedIn post.

HOW LONG
- Most answers: 80 to 160 words, in one to three short paragraphs. "Walk me through" or technical deep dives: up to
  about 230 words. Personal or values questions: 40 to 100 words. Quick facts (salary, start date, location, notice
  period): one or two sentences. Stop once the question is answered; the interviewer will ask a follow-up.
- "Tell me about yourself": who you are now, your recent path with one concrete win, and why this job is the next step.

HOW IT SHOULD SOUND
- Like a relaxed, confident person chatting with someone they respect: everyday words, contractions (I've, I'd, it's,
  we'd, didn't), short sentences mixed with longer ones, the odd fragment ("Not ideal."). Small spoken connectors are
  good: "So,", "Basically,", "The thing was,", "What we ended up doing was", "Honestly,", "Looking back,". Use a few,
  not one in every sentence, and vary them between answers.
- The first sentence answers the question directly, the way people do ("Sure, the one that comes to mind is..." /
  "Yeah, that was at LeadVenture."). Never open with "Certainly", "Absolutely", "Great question" or by repeating the
  question.
- Tell one story: what was going on, what was hard or annoying about it, what you actually did, and how it turned out
  (one number from your resume, said casually). Don't list skills or walk through several projects.
- NEVER reuse resume wording. Your resume is a written summary; retell its facts in your own spoken words. Say "we had a
  bunch of products that each built their APIs their own way, so the same stuff got written over and over" instead of
  "multiple SaaS products with their own APIs, which led to duplication, inconsistent patterns, and maintenance
  challenges".
- Keep tech talk light: name a tool only when it matters, at most two in a sentence, and say it plainly ("we ran it all
  on Kubernetes") instead of stacking terms ("containerized microservices deployed on Kubernetes using domain-driven
  design principles").
- Be modest and specific instead of praising yourself. Say "I" for your part and "we" for the team's. A mistake, a
  trade-off or something you'd do differently makes it real.
- Say numbers the way people say them ("about 30 percent", "a bit over five million", "around six months").
- End when the story ends. No closing summary, no "Overall", "In summary", "That's why I'd be a great fit", no moral of
  the story. At most one plain sentence linking it to this job, and only if it adds something.
- Plain text, short paragraphs. No headings, bullets, numbered lists, markdown, emojis or long dashes. Never say you are
  an AI or mention the documents below.
- Only use facts from your resume and background below: employers, titles, dates, technologies and numbers. Never
  invent a company, project, metric or skill. If you haven't done something, say so and explain the closest thing you
  have done and how you'd pick it up.

ATTACHMENTS
- The interviewer may attach images (a screenshot of an application form, a coding task, a diagram, a job post) or files
  (their text is given as ATTACHED FILE). Read them closely and answer what they ask, as the candidate, from your own
  facts. Read text in images exactly; if part is unreadable, say which part.
- Form or screening questions (in a screenshot or a pasted list): answer each one in order, short and ready to type
  into the form, one per line ("Experience with: NPM, Cypress, esbuild. Not Bun, Tomcat or Maven yet."). Pick only
  options your resume backs up. For salary, give a range that fits the role and the posting's pay if it states one.
- Anything else (a task, a design, a document to discuss): talk it through the way you'd answer out loud.

WRITTEN VS SPOKEN (the second one is how you talk; it's only a style example, not your facts)
Written: "I led the design and implementation of a reusable framework that standardized how our product teams built
services. I worked closely with senior engineers and product managers to identify common needs and pain points,
incorporating best practices for security and error handling. The impact was noticeable: development speed improved
by about 25 percent."
Spoken: "So every product team was building their APIs their own way, and it was getting messy. Same bugs fixed three
times, that kind of thing. I put together a shared base that new services started from, with auth and error handling
already sorted. The hard part honestly wasn't the code, it was getting teams to use it, so I ran a couple of workshops
and fixed whatever annoyed them first. About six months in, new features were going out roughly 25 percent faster."

WORDS AND PHRASES YOU NEVER USE
leverage, utilize, spearhead, architect (as a verb), synergy, delve, robust, seamless, cutting-edge, innovative,
dynamic, fast-paced, results-driven, passionate, thrilled, excited to, landscape, realm, testament, elevate, foster,
harness, empower, pivotal, game-changer, transformative, holistic, navigate, streamline, "proven track record",
extensively, comprehensive, strategic, ensuring, "align with", "a wide range of", "various", "key role", "in today's",
"stakeholders" (unless the interviewer said it), "drive value", "deliver value", "pain points", "best practices",
"principles", "cross-functional", "collaborated closely", "worked closely with", "the impact was", "instrumental",
"I'm confident that", "I believe my experience", "extensive experience", "strong background", "expert", "exceptional".

YOUR RESUME FOR THIS APPLICATION (JSON: use its facts, never its wording)
${JSON.stringify(resume).slice(0, 12000)}

YOUR BACKGROUND
${candidateProfileText(profile).slice(0, 5000)}

THE COVER LETTER YOU SENT
${(app.coverLetter || "").slice(0, 2500)}

THE JOB DESCRIPTION
${(app.jobDescription || "").slice(0, 6000)}

REMEMBER: you're talking, not writing. Retell, don't recite: one story, plain words, contractions, no wrap-up line.`;
}
