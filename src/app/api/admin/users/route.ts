import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { handler, HttpError, profileScope, requireStaff, requireUser } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import { getSettings } from "@/lib/models/Settings";
import { oid } from "@/lib/query";
import { emailEnabled } from "@/lib/email";
import { sendInvite } from "@/lib/invite";
import { User } from "@/lib/models/User";
import { Application } from "@/lib/models/Application";
import { monthStart, textSearch } from "@/lib/query";
import { isValidTimeZone } from "@/lib/tz";


function parseManualLimit(v: unknown) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, "The manual job description limit must be 0 (no limit) or more");
  return n;
}

export const GET = handler(async (req: Request) => {
  const staff = await requireStaff();
  const scope = profileScope(staff);
  const sp = new URL(req.url).searchParams;
  const filter: Record<string, unknown> = { ...textSearch(sp.get("q"), ["name", "email"]) };
  if (sp.get("status")) filter.status = sp.get("status");
  if (sp.get("role")) filter.role = sp.get("role");
  // Users (managers) see approved bidders only, for assigning their profiles.
  if (scope) Object.assign(filter, { role: "bidder", status: "approved" });

  const users = await User.find(filter)
    .select("-passwordHash")
    .populate("assignedProfiles", "label fullName")
    .populate("managedProfiles", "label fullName")
    .sort({ status: 1, createdAt: -1 })
    .lean();

  const usage = await Application.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) }, status: { $ne: "not_generated" }, ...(scope ? { profile: { $in: scope } } : {}) } },
    {
      $group: {
        _id: "$user",
        generated: { $sum: 1 },
        submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
        fees: { $sum: "$fee" },
        monthGenerated: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart()] }, 1, 0] } },
        monthFees: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart()] }, "$fee", 0] } },
        lastGeneratedAt: { $max: "$createdAt" },
      },
    },
  ]);
  const map = new Map(usage.map((u) => [String(u._id), u]));
  const empty = { generated: 0, submitted: 0, fees: 0, monthGenerated: 0, monthFees: 0, lastGeneratedAt: null };

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      usage: map.get(String(u._id)) ?? empty,
      ...(scope
        ? {
            feePerApplication: undefined,
            trusted: undefined,
            managedProfiles: undefined,
            assignedProfiles: (u.assignedProfiles as unknown as { _id: unknown }[]).filter((p) => scope.some((s) => String(s) === String(p._id))),
          }
        : {}),
    })),
  });
});

/** Admin creates an account directly (approved by default, no sign-up needed). */
export const POST = handler(async (req: Request) => {
  const admin = await requireUser("admin");
  const b = await req.json();
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").toLowerCase().trim();
  const password = String(b.password ?? "");
  if (!name || !email || !password) throw new HttpError(400, "Name, email and password are required");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Invalid email");
  if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  const role = b.role ?? "bidder";
  if (!["admin", "user", "bidder", "caller"].includes(role)) throw new HttpError(400, "Invalid role");
  const status = b.status ?? "approved";
  if (!["pending", "approved", "suspended", "rejected"].includes(status)) throw new HttpError(400, "Invalid status");
  if (await User.exists({ email })) throw new HttpError(409, "An account with this email already exists");

  const ids = async (raw: unknown) => {
    const list = ((raw as string[]) ?? []).map((id) => oid(id, "profile"));
    if ((await Profile.countDocuments({ _id: { $in: list } })) !== list.length) throw new HttpError(400, "One or more profiles do not exist");
    return list;
  };
  // Only bidders are charged, per submitted application.
  const fee =
    role !== "bidder" ? 0 : b.feePerApplication === undefined || b.feePerApplication === "" ? (await getSettings()).defaultFee : Number(b.feePerApplication);
  if (!Number.isFinite(fee) || fee < 0) throw new HttpError(400, "Fee must be a non-negative number");

  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    status,
    feePerApplication: fee,
    trusted: role === "bidder" && b.trusted === true,
    interviewAccess: b.interviewAccess !== false,
    manualLimit: role === "bidder" && b.manualLimit !== undefined && b.manualLimit !== "" ? parseManualLimit(b.manualLimit) : 100,
    // Callers have their own time zone (their emails and calendar use it).
    timezone: role === "caller" && typeof b.timezone === "string" && isValidTimeZone(b.timezone) ? b.timezone : "",
    assignedProfiles: await ids(b.assignedProfiles),
    managedProfiles: role === "user" || role === "admin" ? await ids(b.managedProfiles) : [],
    mustChangePassword: true,
  });

  // Invitation email with email, temporary password and role (on by default).
  const wantInvite = b.sendInvite !== false;
  const invited = wantInvite ? await sendInvite({ name, email, role, password, invitedBy: admin.name }) : false;
  return NextResponse.json({ id: String(user._id), invited, inviteRequested: wantInvite, emailConfigured: emailEnabled() });
});
