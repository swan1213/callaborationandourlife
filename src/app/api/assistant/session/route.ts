import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { requireAssistantRole, signAssistantToken, visibleInterview } from "@/lib/assistant";

/**
 * POST { interviewId? } — a token for the local Interview Assistant (see lib/assistant.ts; admins, users and callers only), for one interview
 * the user can see, or without an interview (no resume or job description is loaded then).
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  requireAssistantRole(user);
  const b = await req.json().catch(() => ({}));
  const interview = b?.interviewId ? await visibleInterview(user, String(b.interviewId)) : null;
  const { token, expiresAt } = await signAssistantToken(String(user._id), interview ? String(interview._id) : null);
  return NextResponse.json({ token, expiresAt }, { headers: { "Cache-Control": "no-store" } });
});
