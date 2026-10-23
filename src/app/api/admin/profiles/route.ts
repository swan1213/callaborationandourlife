import { NextResponse } from "next/server";
import { handler, HttpError, profileScope, requireStaff, requireUser } from "@/lib/auth";
import "@/lib/models/ApiKey";
import { Profile } from "@/lib/models/Profile";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { profileUpdate, setProfileManager } from "@/lib/profileInput";
import { monthStart } from "@/lib/query";

export const GET = handler(async () => {
  const staff = await requireStaff();
  const scope = profileScope(staff);
  const profiles = await Profile.find(scope ? { _id: { $in: scope } } : {})
    // List pages never show these; the imported resume alone can be ~30 KB per profile.
    .select("-about -resumeReference -experience.description -summary -certifications")
    .populate("apiKey", "label keyMask model active")
    .sort({ active: -1, label: 1 })
    .lean();
  const ids = profiles.map((p) => p._id);
  const [usage, assignees, reps] = await Promise.all([
    Application.aggregate([
      { $match: { profile: { $in: ids }, status: { $ne: "not_generated" } } },
      {
        $group: {
          _id: "$profile",
          total: { $sum: 1 },
          month: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart()] }, 1, 0] } },
          monthPromptTokens: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart()] }, "$usage.promptTokens", 0] } },
          monthCompletionTokens: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart()] }, "$usage.completionTokens", 0] } },
        },
      },
    ]),
    User.find({ assignedProfiles: { $in: ids } }).select("name assignedProfiles").lean(),
    User.find({ role: { $in: ["user", "admin"] }, managedProfiles: { $in: ids } }).select("name managedProfiles").lean(),
  ]);
  const u = new Map(usage.map((x) => [String(x._id), x]));
  return NextResponse.json({
    profiles: profiles.map((p) => ({
      ...p,
      usage: u.get(String(p._id)) ?? { total: 0, month: 0, monthPromptTokens: 0, monthCompletionTokens: 0 },
      assignedTo: assignees
        .filter((a) => a.assignedProfiles.some((id) => String(id) === String(p._id)))
        .map((a) => ({ id: String(a._id), name: a.name })),
      managers: reps
        .filter((r) => r.managedProfiles.some((id) => String(id) === String(p._id)))
        .map((r) => ({ id: String(r._id), name: r.name })),
      // Key details are admin-only.
      ...(scope ? { apiKey: undefined, openaiModel: undefined, monthlyQuota: p.monthlyQuota } : {}),
    })),
  });
});

export const POST = handler(async (req: Request) => {
  await requireUser("admin");
  const body = await req.json();
  const data = profileUpdate(body);
  if (!data.label || !data.fullName) throw new HttpError(400, "Label and full name are required");
  const profile = await Profile.create(data);
  if (body.manager) await setProfileManager(profile._id, body.manager);
  return NextResponse.json({ id: String(profile._id) });
});
