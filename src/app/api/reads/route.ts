import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { markPostingRead } from "@/lib/postingReads";

/** POST { url } — marks a job posting as read for the current user (sent when the link is opened). */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));
  const url = String(body.url || "").trim();
  if (!/^https?:\/\//i.test(url) || url.length > 2000) throw new HttpError(400, "Invalid URL");
  await markPostingRead(user._id, url);
  return NextResponse.json({ ok: true });
});
