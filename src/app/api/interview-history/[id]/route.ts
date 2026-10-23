import { NextResponse } from "next/server";
import { handler } from "@/lib/auth";
import { loadSession } from "@/lib/interviewSessions";

type Ctx = { params: Promise<{ id: string }> };

/** GET — one recording: transcript, suggested answers and AI review. */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const s = await loadSession((await params).id);
  return NextResponse.json({ session: s.toObject() });
});

/** DELETE — removes the recording (its owner or an admin). */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const s = await loadSession((await params).id);
  await s.deleteOne();
  return NextResponse.json({ ok: true });
});
