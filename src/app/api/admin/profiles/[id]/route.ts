import { after, NextResponse } from "next/server";
import { canManageProfile, handler, HttpError, requireStaff, requireUser } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { profileUpdate, setProfileManager } from "@/lib/profileInput";
import { oid } from "@/lib/query";
import { recordProfileChange } from "@/lib/profileNotify";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = oid((await params).id);
  if (!canManageProfile(staff, id)) throw new HttpError(404, "Profile not found");
  const profile = await Profile.findById(id).select(staff.role === "admin" ? "" : "-apiKey -openaiModel").lean();
  if (!profile) throw new HttpError(404, "Profile not found");
  const managers = await User.find({ role: "user", managedProfiles: id }).select("_id").lean();
  return NextResponse.json({ profile: { ...profile, managers: managers.map((m) => String(m._id)) } });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = oid((await params).id);
  if (!canManageProfile(staff, id)) throw new HttpError(404, "Profile not found");
  const body = await req.json();
  const data = profileUpdate(body);
  if (staff.role !== "admin") {
    // Users (managers) edit profile content only; keys, model, quota and activation stay with admins.
    for (const k of ["apiKey", "openaiModel", "monthlyQuota", "active"]) delete data[k];
  }
  const before = await Profile.findById(id).lean<Record<string, unknown>>();
  const profile = await Profile.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!profile || !before) throw new HttpError(404, "Profile not found");
  // Tell the bidders, callers and users of this profile what changed (after the response).
  after(() => recordProfileChange(id, before, data, staff));
  if (staff.role === "admin" && "manager" in body) await setProfileManager(id, body.manager);
  return NextResponse.json({ ok: true });
});

/** DELETE ?force=1 also deletes a profile that has history (its applications are kept, labelled with the old name). */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  await requireUser("admin");
  const id = oid((await params).id);
  const profile = await Profile.findById(id).select("label");
  if (!profile) throw new HttpError(404, "Profile not found");
  const history = await Application.countDocuments({ profile: id });
  if (history && new URL(req.url).searchParams.get("force") !== "1")
    return NextResponse.json(
      { error: `This profile has ${history} application(s) in its history.`, history },
      { status: 409 }
    );
  if (history) await Application.updateMany({ profile: id }, { profileLabel: profile.label });
  await Profile.deleteOne({ _id: id });
  await User.updateMany(
    { $or: [{ assignedProfiles: id }, { managedProfiles: id }] },
    { $pull: { assignedProfiles: id, managedProfiles: id } }
  );
  return NextResponse.json({ ok: true, history });
});
