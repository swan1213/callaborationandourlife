import { NextResponse } from "next/server";
import { canRequestInterviews, handler, HttpError, requireUser } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import { User } from "@/lib/models/User";

/**
 * Choices for the interview-request form: the requester's profiles, each with its assigned callers.
 * Staff also get the list of all active callers (for re-assigning requests).
 */
export const GET = handler(async () => {
  const user = await requireUser();
  if (user.role === "bidder" && !canRequestInterviews(user)) throw new HttpError(403, "Interview requests are not enabled for your account");
  const ids = user.role === "caller" ? [] : [...user.assignedProfiles, ...(user.role === "user" ? user.managedProfiles ?? [] : [])];
  const profiles = await Profile.find(user.role === "admin" ? { active: true } : { _id: { $in: ids }, active: true })
    .select("label fullName")
    .sort({ label: 1 })
    .lean();
  const callers = await User.find({ role: "caller", status: "approved" }).select("name email assignedProfiles").sort({ name: 1 }).lean();
  return NextResponse.json({
    profiles: profiles.map((p) => ({
      id: String(p._id),
      label: p.label,
      fullName: p.fullName,
      callers: callers
        .filter((c) => (c.assignedProfiles ?? []).some((x) => String(x) === String(p._id)))
        .map((c) => ({ id: String(c._id), name: c.name })),
    })),
    callers: user.role === "admin" || user.role === "user" ? callers.map((c) => ({ id: String(c._id), name: c.name, email: c.email })) : [],
  });
});
