import { NextResponse } from "next/server";
import { canManageProfile, canRequestInterviews, handler, HttpError, requireUser } from "@/lib/auth";
import { chainInfo } from "@/lib/interviews";
import { oid } from "@/lib/query";

/**
 * GET ?profile=&company=&jobTitle= — is a new request the initial interview or a follow-up?
 * Returns the chain's earlier interviews, the next step and (for follow-ups) the caller who must conduct it.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  if (user.role === "bidder" && !canRequestInterviews(user)) throw new HttpError(403, "Interview requests are not enabled for your account");
  const sp = new URL(req.url).searchParams;
  const profile = oid(sp.get("profile"), "profile");
  const allowed =
    user.role === "admin" ||
    user.assignedProfiles.some((p) => String(p) === String(profile)) ||
    (user.role === "user" && canManageProfile(user, profile));
  if (!allowed) throw new HttpError(403, "This profile is not assigned to you");
  // exclude: the interview being edited (its own step doesn't count as taken).
  const exclude = sp.get("exclude");
  const chain = await chainInfo(profile, sp.get("company") ?? "", sp.get("jobTitle") ?? "", exclude ? oid(exclude, "interview") : undefined);
  return NextResponse.json({ ...chain, followUp: chain.previous.length > 0, locked: !!chain.lead?.active });
});
