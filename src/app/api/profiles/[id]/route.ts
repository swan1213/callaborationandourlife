import { NextResponse } from "next/server";
import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import { oid } from "@/lib/query";

/** Full read-only profile details for a user it is assigned to (admins can read any). */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = oid((await params).id);
  const assigned =
    user.assignedProfiles.some((p) => String(p) === String(id)) || (user.role !== "bidder" && canManageProfile(user, id));
  if (!assigned) throw new HttpError(404, "Profile not found");

  const profile = await Profile.findById(id)
    .select("-apiKey -openaiModel -monthlyQuota -__v")
    .lean();
  if (!profile || (!profile.active && user.role !== "admin")) throw new HttpError(404, "Profile not found");
  return NextResponse.json({ profile });
});
