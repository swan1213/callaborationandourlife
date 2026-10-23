import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import { Application } from "@/lib/models/Application";
import { monthStart } from "@/lib/query";

/** Profiles assigned to the current user (admins see all active profiles). */
export const GET = handler(async () => {
  const user = await requireUser();
  const ids = [...user.assignedProfiles, ...(user.role === "user" ? user.managedProfiles ?? [] : [])];
  const filter = user.role === "admin" ? { active: true } : { _id: { $in: ids }, active: true };
  const profiles = await Profile.find(filter).select("label fullName location monthlyQuota experience.title").lean();
  const used = await Application.aggregate([
    { $match: { profile: { $in: profiles.map((p) => p._id) }, createdAt: { $gte: monthStart() }, status: { $ne: "not_generated" } } },
    { $group: { _id: "$profile", n: { $sum: 1 } } },
  ]);
  const usedMap = new Map(used.map((u) => [String(u._id), u.n as number]));
  return NextResponse.json({
    profiles: profiles.map((p) => ({
      id: String(p._id),
      label: p.label,
      fullName: p.fullName,
      location: p.location,
      title: p.experience?.[0]?.title ?? "",
      monthlyQuota: p.monthlyQuota,
      usedThisMonth: usedMap.get(String(p._id)) ?? 0,
    })),
  });
});
