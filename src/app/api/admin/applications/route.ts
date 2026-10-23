import { NextResponse } from "next/server";
import { handler, profileScope, requireStaff } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import "@/lib/models/Profile";
import { User } from "@/lib/models/User";
import { adminApplicationFilter } from "@/lib/adminFilter";
import { paging } from "@/lib/query";
import { withReadFlags } from "@/lib/postingReads";
import { unviewedCount, withViewFlags } from "@/lib/appViews";

/** Full application history: who generated what, with which profile, and when. */
export const GET = handler(async (req: Request) => {
  const staff = await requireStaff();
  const sp = new URL(req.url).searchParams;
  const filter = adminApplicationFilter(sp, profileScope(staff));
  const { page, limit, skip } = paging(sp, 50);

  const [items, total, [totals], allIds] = await Promise.all([
    Application.find(filter)
      .select("user profile profileLabel generationError company jobTitle jobUrl jobLocation status submittedAt screenshots createdAt fee paid paidAt usage deletedByUser")
      .populate("user", "name email")
      .populate("profile", "label fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Application.countDocuments(filter),
    Application.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
generated: { $sum: { $cond: [{ $eq: ["$status", "not_generated"] }, 0, 1] } },
          notGenerated: { $sum: { $cond: [{ $eq: ["$status", "not_generated"] }, 1, 0] } },
          submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
          fees: { $sum: "$fee" },
          paidFees: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "submitted"] }, { $eq: ["$paid", true] }] }, "$fee", 0] } },
          unpaidCount: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "submitted"] }, { $ne: ["$paid", true] }] }, 1, 0] } },
          promptTokens: { $sum: "$usage.promptTokens" },
          completionTokens: { $sum: "$usage.completionTokens" },
        },
      },
    ]),
    Application.find(filter).select("_id").limit(10000).lean(),
  ]);

  // "User" column: accounts with the user (profile-manager) role that manage each application's profile.
  const profileIdOf = (a: (typeof items)[number]) => String((a.profile as { _id?: unknown } | null)?._id ?? "");
  const profileIds = [...new Set(items.map(profileIdOf).filter(Boolean))];
  // Managers, read/view flags and the unread count are independent: fetch them in one parallel batch.
  const [managers, read, viewed, unread] = await Promise.all([
    profileIds.length ? User.find({ role: "user", managedProfiles: { $in: profileIds } }).select("name email managedProfiles").lean() : [],
    withReadFlags(staff._id, items),
    withViewFlags(staff._id, items),
    unviewedCount(staff._id, allIds.map((a) => a._id)),
  ]);
  const withManagers = items.map((a, i) => {
    const pid = profileIdOf(a);
    return {
      ...a,
      jobUrlRead: read[i].jobUrlRead,
      viewed: viewed[i].viewed,
      managers: managers
        .filter((m) => (m.managedProfiles ?? []).some((p) => String(p) === pid))
        .map((m) => ({ _id: String(m._id), name: m.name, email: m.email })),
    };
  });

  return NextResponse.json({
    items: withManagers,
    unread,
    total,
    page,
    limit,
    totals: totals ?? { generated: 0, submitted: 0, fees: 0, paidFees: 0, unpaidCount: 0, promptTokens: 0, completionTokens: 0, notGenerated: 0 },
  });
});
