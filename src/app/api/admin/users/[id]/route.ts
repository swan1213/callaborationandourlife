import { after, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { handler, HttpError, profileScope, requireStaff, requireUser } from "@/lib/auth";
import { User } from "@/lib/models/User";
import { Profile } from "@/lib/models/Profile";
import { monthStart, oid } from "@/lib/query";
import { Application } from "@/lib/models/Application";
import { notifyUserStatus } from "@/lib/email";
import { notifyAssignmentChanges, snapshotAccounts } from "@/lib/assignmentNotify";
import { isValidTimeZone } from "@/lib/tz";
import { manualQueue } from "@/lib/manualQueue";

type Ctx = { params: Promise<{ id: string }> };

async function parseProfileIds(raw: unknown) {
  const ids = ((raw as string[]) ?? []).map((id) => oid(id, "profile"));
  const found = await Profile.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) throw new HttpError(400, "One or more profiles do not exist");
  return ids;
}

/** Read one account: details, usage and recent applications (scoped to managed profiles for users). */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const scope = profileScope(staff);
  const target = await User.findById(oid((await params).id))
    .select("-passwordHash")
    .populate("assignedProfiles", "label fullName active")
    .populate("managedProfiles", "label fullName active")
    .lean();
  if (!target || (scope && (target.role !== "bidder" || target.status !== "approved"))) throw new HttpError(404, "Account not found");

  const inScope = (id: unknown) => !scope || scope.some((p) => String(p) === String(id));
  const match: Record<string, unknown> = { user: target._id, status: { $ne: "not_generated" }, ...(scope ? { profile: { $in: scope } } : {}) };
  const [[totals], byProfile, recent] = await Promise.all([
    Application.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          generated: { $sum: 1 },
          submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
          fees: { $sum: "$fee" },
          monthGenerated: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart()] }, 1, 0] } },
          monthFees: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart()] }, "$fee", 0] } },
          lastGeneratedAt: { $max: "$createdAt" },
        },
      },
    ]),
    Application.aggregate([
      { $match: match },
      { $group: { _id: "$profile", label: { $last: "$profileLabel" }, generated: { $sum: 1 }, submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } } } },
      { $sort: { generated: -1 } },
    ]),
    Application.find(match)
      .select("company jobTitle status createdAt profile profileLabel screenshots")
      .populate("profile", "label")
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean(),
  ]);
  const assigned = (target.assignedProfiles as unknown as { _id: unknown }[]).filter((p) => inScope(p._id));
  return NextResponse.json({
    user: { ...target, assignedProfiles: assigned, ...(scope ? { feePerApplication: undefined, managedProfiles: undefined, trusted: undefined } : {}) },
    manualQueue: target.role === "bidder" ? await manualQueue(target) : null,
    usage: totals ?? { generated: 0, submitted: 0, fees: 0, monthGenerated: 0, monthFees: 0, lastGeneratedAt: null },
    byProfile,
    recent,
  });
});


function parseManualLimit(v: unknown) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, "The manual job description limit must be 0 (no limit) or more");
  return n;
}

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const admin = await requireStaff();
  const user = await User.findById(oid((await params).id));
  if (!user) throw new HttpError(404, "User not found");
  const body = await req.json();
  const [before] = await snapshotAccounts([user._id]);
  const actor = { id: String(admin._id), name: admin.name };

  // Users (managers) may only (un)assign the profiles they manage and show / hide Interview Requests, and only for bidders.
  const scope = profileScope(admin);
  if (scope) {
    if (user.role !== "bidder" || user.status !== "approved") throw new HttpError(403, "You can only change approved bidders");
    const access = typeof body.interviewAccess === "boolean";
    const limit = body.manualLimit !== undefined && body.manualLimit !== "";
    if (body.assignedProfiles === undefined && !access && !limit)
      throw new HttpError(403, "Users can only change bidders' profile assignments, Interview Requests access and manual job description limit");
    if (body.assignedProfiles !== undefined) {
      const requested = await parseProfileIds(body.assignedProfiles);
      const inScope = (id: unknown) => scope.some((p) => String(p) === String(id));
      if (requested.some((id) => !inScope(id))) throw new HttpError(403, "You can only assign profiles you manage");
      const keep = user.assignedProfiles.filter((id) => !inScope(id));
      user.set("assignedProfiles", [...keep, ...requested]);
    }
    if (access) user.interviewAccess = body.interviewAccess;
    if (limit) user.manualLimit = parseManualLimit(body.manualLimit);
    await user.save();
    const afterState = await snapshotAccounts([user._id]);
    after(() => notifyAssignmentChanges([before], afterState, actor));
    return NextResponse.json({ ok: true });
  }
  const isSelf = String(user._id) === String(admin._id);

  if (body.status !== undefined) {
    if (!["pending", "approved", "rejected", "suspended"].includes(body.status)) throw new HttpError(400, "Invalid status");
    if (isSelf && body.status !== "approved") throw new HttpError(400, "You cannot change your own status");
    user.status = body.status;
  }
  if (body.role !== undefined) {
    if (!["admin", "user", "bidder", "caller"].includes(body.role)) throw new HttpError(400, "Invalid role");
    if (isSelf && body.role !== "admin") throw new HttpError(400, "You cannot remove your own admin role");
    user.role = body.role;
  }
  if (body.feePerApplication !== undefined && (body.role ?? user.role) === "bidder") {
    const fee = Number(body.feePerApplication);
    if (!Number.isFinite(fee) || fee < 0) throw new HttpError(400, "Fee must be a non-negative number");
    user.feePerApplication = fee;
  }
  if (typeof body.trusted === "boolean") user.trusted = body.trusted;
  if (typeof body.interviewAccess === "boolean") user.interviewAccess = body.interviewAccess;
  if (body.manualLimit !== undefined && body.manualLimit !== "") user.manualLimit = parseManualLimit(body.manualLimit);
  if (typeof body.timezone === "string") {
    if (body.timezone && !isValidTimeZone(body.timezone)) throw new HttpError(400, "Unknown time zone");
    user.timezone = body.timezone;
  }
  if (user.role !== "bidder") {
    user.feePerApplication = 0;
    user.trusted = false;
  }
  // Bidders always use the default zone.
  if (user.role === "bidder") user.timezone = "";
  if (body.assignedProfiles !== undefined) user.set("assignedProfiles", await parseProfileIds(body.assignedProfiles));
  if (body.managedProfiles !== undefined) user.set("managedProfiles", await parseProfileIds(body.managedProfiles));
  if (body.name !== undefined && String(body.name).trim()) user.name = String(body.name).trim();
  if (body.email !== undefined) {
    const email = String(body.email).toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Invalid email");
    if (email !== user.email && (await User.exists({ email }))) throw new HttpError(409, "An account with this email already exists");
    user.email = email;
  }
  if (body.newPassword) {
    if (String(body.newPassword).length < 8) throw new HttpError(400, "Password must be at least 8 characters");
    user.passwordHash = await bcrypt.hash(String(body.newPassword), 10);
    if (!isSelf) user.mustChangePassword = true;
  }
  const statusChanged = user.isModified("status");
  await user.save();
  if (statusChanged) await notifyUserStatus(user.name, user.email, user.status, user._id);
  const afterState = await snapshotAccounts([user._id]);
  after(() => notifyAssignmentChanges([before], afterState, actor));
  return NextResponse.json({ ok: true });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const admin = await requireUser("admin");
  const id = oid((await params).id);
  if (String(id) === String(admin._id)) throw new HttpError(400, "You cannot delete your own account");
  await User.deleteOne({ _id: id });
  return NextResponse.json({ ok: true });
});
