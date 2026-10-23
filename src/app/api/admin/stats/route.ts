import { NextResponse } from "next/server";
import { handler, profileScope, requireStaff } from "@/lib/auth";
import { User } from "@/lib/models/User";
import { Profile } from "@/lib/models/Profile";
import { Application } from "@/lib/models/Application";
import { monthStart } from "@/lib/query";

export const GET = handler(async () => {
  const staff = await requireStaff();
  const scope = profileScope(staff);
  const scoped = scope ? { profile: { $in: scope } } : {};
  const since = monthStart();
  const days30 = new Date(Date.now() - 29 * 86400000);
  days30.setUTCHours(0, 0, 0, 0);

  const [pendingUsers, activeUsers, activeProfiles, [month], daily] = await Promise.all([
    scope ? 0 : User.countDocuments({ status: "pending" }),
    scope ? User.countDocuments({ status: "approved", role: "bidder", assignedProfiles: { $in: scope } }) : User.countDocuments({ status: "approved", role: "bidder" }),
    Profile.countDocuments({ active: true, ...(scope ? { _id: { $in: scope } } : {}) }),
    Application.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: "not_generated" }, ...scoped } },
      {
        $group: {
          _id: null,
          generated: { $sum: 1 },
          submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
          fees: { $sum: "$fee" },
          promptTokens: { $sum: "$usage.promptTokens" },
          completionTokens: { $sum: "$usage.completionTokens" },
        },
      },
    ]),
    Application.aggregate([
      { $match: { createdAt: { $gte: days30 }, status: { $ne: "not_generated" }, ...scoped } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          generated: { $sum: 1 },
          submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return NextResponse.json({
    pendingUsers,
    activeUsers,
    activeProfiles,
    month: month ?? { generated: 0, submitted: 0, fees: 0, promptTokens: 0, completionTokens: 0 },
    daily,
  });
});
