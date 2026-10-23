import { after, NextResponse } from "next/server";
import { handler, HttpError, profileScope, requireStaff } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import { User } from "@/lib/models/User";
import { oid } from "@/lib/query";
import { notifyAssignmentChanges, snapshotAccounts } from "@/lib/assignmentNotify";

/**
 * Profile ↔ account assignments.
 * - Users (the manager role) and admins are linked through `managedProfiles` (they manage the profile and get its notifications).
 * - Bidders are linked through `assignedProfiles` (they can generate with the profile).
 * - Callers are linked through `assignedProfiles` too (they receive the profile's interview requests).
 * Admins edit both; users edit bidder assignments for the profiles they manage.
 */
export const GET = handler(async () => {
  const staff = await requireStaff();
  const scope = profileScope(staff);
  const [profiles, accounts] = await Promise.all([
    Profile.find(scope ? { _id: { $in: scope } } : {})
      .select("label fullName active experience.title")
      .sort({ active: -1, label: 1 })
      .lean(),
    User.find(scope ? { role: { $in: ["bidder", "caller"] }, status: "approved" } : { role: { $in: ["admin", "user", "bidder", "caller"] }, status: { $ne: "rejected" } })
      .select("name email role status assignedProfiles managedProfiles")
      .sort({ name: 1 })
      .lean(),
  ]);
  return NextResponse.json({
    canManageUsers: !scope,
    profiles: profiles.map((p) => ({ id: String(p._id), label: p.label, fullName: p.fullName, active: p.active, title: p.experience?.[0]?.title ?? "" })),
    accounts: accounts.map((a) => ({
      id: String(a._id),
      name: a.name,
      email: a.email,
      role: a.role,
      status: a.status,
      assigned: (a.assignedProfiles ?? []).map(String),
      managed: (a.managedProfiles ?? []).map(String),
    })),
  });
});

/** PUT { profileId, bidders: string[], callers?: string[], users?: string[] } — sets exactly who is linked to one profile. */
export const PUT = handler(async (req: Request) => {
  const staff = await requireStaff();
  const scope = profileScope(staff);
  const body = await req.json();
  const profileId = oid(body.profileId, "profile");
  if (!(await Profile.exists({ _id: profileId }))) throw new HttpError(404, "Profile not found");
  if (scope && !scope.some((p) => String(p) === String(profileId))) throw new HttpError(403, "You do not manage this profile");

  const toIds = (v: unknown) => [...new Set(((v as string[]) ?? []).map((id) => String(oid(id, "account"))))];
  const bidders = toIds(body.bidders);
  const validBidders = await User.countDocuments({ _id: { $in: bidders }, role: "bidder" });
  if (validBidders !== bidders.length) throw new HttpError(400, "Only bidders can be assigned to generate with a profile");

  const callers = body.callers === undefined ? null : toIds(body.callers);
  if (callers && (await User.countDocuments({ _id: { $in: callers }, role: "caller" })) !== callers.length)
    throw new HttpError(400, "Only callers can be assigned to handle a profile's interviews");

  // Everyone currently or newly linked to this profile, captured before the change for notifications.
  const involved = (
    await User.find({ $or: [{ assignedProfiles: profileId }, { managedProfiles: profileId }, { _id: { $in: [...bidders, ...(callers ?? []), ...toIds(body.users ?? [])] } }] })
      .select("_id")
      .lean()
  ).map((u) => u._id);
  const before = await snapshotAccounts(involved);

  await User.updateMany({ role: "bidder", assignedProfiles: profileId, _id: { $nin: bidders } }, { $pull: { assignedProfiles: profileId } });
  await User.updateMany({ _id: { $in: bidders } }, { $addToSet: { assignedProfiles: profileId } });
  if (callers) {
    await User.updateMany({ role: "caller", assignedProfiles: profileId, _id: { $nin: callers } }, { $pull: { assignedProfiles: profileId } });
    await User.updateMany({ _id: { $in: callers } }, { $addToSet: { assignedProfiles: profileId } });
  }

  let usersCount: number | undefined;
  if (body.users !== undefined) {
    if (scope) throw new HttpError(403, "Only admins can change which users manage a profile");
    const users = toIds(body.users);
    if ((await User.countDocuments({ _id: { $in: users }, role: { $in: ["user", "admin"] } })) !== users.length)
      throw new HttpError(400, "Only users and admins can manage a profile");
    await User.updateMany(
      { role: { $in: ["user", "admin"] }, managedProfiles: profileId, _id: { $nin: users } },
      { $pull: { managedProfiles: profileId } }
    );
    await User.updateMany({ _id: { $in: users } }, { $addToSet: { managedProfiles: profileId } });
    usersCount = users.length;
  }
  const afterState = await snapshotAccounts(involved);
  after(() => notifyAssignmentChanges(before, afterState, { id: String(staff._id), name: staff.name }));
  return NextResponse.json({ ok: true, bidders: bidders.length, callers: callers?.length, users: usersCount });
});
