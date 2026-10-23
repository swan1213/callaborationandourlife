import { NextResponse } from "next/server";
import { handler, HttpError } from "@/lib/auth";
import { generateReport, loadSession, type SessionDoc } from "@/lib/interviewSessions";

export const maxDuration = 120;

/** POST — writes (or rewrites) the AI review of a recording. */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await loadSession((await params).id);
  if (!s.captions.length && !s.answers.length) throw new HttpError(400, "Nothing was recorded in this interview");
  s.report = await generateReport(s.toObject() as unknown as SessionDoc);
  await s.save();
  return NextResponse.json({ report: s.report });
});
