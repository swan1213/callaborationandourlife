import { NextResponse } from "next/server";
import { HttpError, quietHandler } from "@/lib/auth";
import { requireAssistant } from "@/lib/assistant";
import { InterviewSession } from "@/lib/models/InterviewSession";
import { STAGE_NAMES } from "@/lib/interviewSessions";

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const MAX_CAPTIONS = 5000;
const MAX_ANSWERS = 500;

/**
 * PUT — the Interview Assistant saves the interview it is recording (Bearer assistant token), again and again
 * while it runs: { id, company, role, stage, startedAt, endedAt, captions: [{ t, text, translation }],
 * answers: [{ t, question, source, answer, keyPoints, meaning, mood }] }. Linked to the token's interview.
 * Not in the activity log (quietHandler): it repeats every few seconds while recording.
 */
export const PUT = quietHandler(async (req: Request) => {
  const { user, interview } = await requireAssistant(req);
  const b = await req.json().catch(() => null);
  const clientId = str(b?.id, 100);
  if (!clientId || !Number(b?.startedAt)) throw new HttpError(400, "Missing interview id or start time");
  const captions = (Array.isArray(b.captions) ? b.captions : []).slice(-MAX_CAPTIONS).map((c: Record<string, unknown>) => ({
    t: num(c?.t),
    text: str(c?.text, 5000),
    translation: str(c?.translation, 5000),
  }));
  const answers = (Array.isArray(b.answers) ? b.answers : []).slice(-MAX_ANSWERS).map((a: Record<string, unknown>) => ({
    t: num(a?.t),
    question: str(a?.question, 2000),
    source: a?.source === "prepared" ? "prepared" : "live",
    answer: str(a?.answer, 20000),
    keyPoints: str(a?.keyPoints, 10000),
    meaning: str(a?.meaning, 5000),
    mood: str(a?.mood, 500),
  }));
  const s = await InterviewSession.findOneAndUpdate(
    { user: user._id, clientId },
    {
      $set: {
        company: str(b.company, 200) || interview?.company || "",
        role: str(b.role, 200) || interview?.jobTitle || "",
        stage: b.stage in STAGE_NAMES ? b.stage : "",
        endedAt: Number(b.endedAt) ? new Date(Number(b.endedAt)) : null,
        captions,
        answers,
      },
      $setOnInsert: {
        userName: user.name,
        startedAt: new Date(Number(b.startedAt)),
        interview: interview?._id ?? null,
        profile: interview?.profile ?? null,
        profileLabel: interview?.profileLabel ?? "",
      },
    },
    { upsert: true, new: true, projection: { _id: 1 } }
  );
  return NextResponse.json({ id: String(s!._id) });
});

/** DELETE ?id= — the assistant drops a recording it started but nothing was heard or answered. */
export const DELETE = quietHandler(async (req: Request) => {
  const { user } = await requireAssistant(req);
  const clientId = str(new URL(req.url).searchParams.get("id"), 100);
  await InterviewSession.deleteOne({ user: user._id, clientId, "captions.0": { $exists: false }, "answers.0": { $exists: false } });
  return NextResponse.json({ ok: true });
});
