import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import "@/lib/models/Profile";
import { dateRange, oid, paging, textSearch } from "@/lib/query";
import { withReadFlags } from "@/lib/postingReads";
import { unviewedCount, withViewFlags } from "@/lib/appViews";

/** The current user's applications, filterable by date range, status, profile and text. */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const filter: Record<string, unknown> = {
    user: user._id,
    deletedByUser: false,
    ...dateRange(sp),
    ...textSearch(sp.get("q"), ["company", "jobTitle", "jobUrl"]),
  };
  if (sp.get("status")) filter.status = sp.get("status");
  if (sp.get("profile")) filter.profile = oid(sp.get("profile"), "profile");

  const { page, limit, skip } = paging(sp);
  const [items, total, byProfile, allIds] = await Promise.all([
    Application.find(filter)
      .select("company jobTitle jobUrl jobLocation status generationError submittedAt screenshots profile profileLabel createdAt fee paid paidAt")
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
          _id: "$profile",
generated: { $sum: { $cond: [{ $eq: ["$status", "not_generated"] }, 0, 1] } },
          notGenerated: { $sum: { $cond: [{ $eq: ["$status", "not_generated"] }, 1, 0] } },
          submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
          fees: { $sum: "$fee" },
        },
      },
      { $lookup: { from: "profiles", localField: "_id", foreignField: "_id", as: "p" } },
      { $project: { generated: 1, submitted: 1, fees: 1, notGenerated: 1, label: { $first: "$p.label" } } },
      { $sort: { generated: -1 } },
    ]),
    Application.find(filter).select("_id").limit(10000).lean(),
  ]);

  const totals = byProfile.reduce(
    (a, s) => ({ generated: a.generated + s.generated, submitted: a.submitted + s.submitted, fees: a.fees + s.fees, notGenerated: a.notGenerated + s.notGenerated }),
    { generated: 0, submitted: 0, fees: 0, notGenerated: 0 }
  );
  const [read, viewed, unread] = await Promise.all([
    withReadFlags(user._id, items),
    withViewFlags(user._id, items),
    unviewedCount(user._id, allIds.map((a) => a._id)),
  ]);
  return NextResponse.json({
    items: items.map((a, i) => ({ ...a, jobUrlRead: read[i].jobUrlRead, viewed: viewed[i].viewed })),
    unread,
    // Submit works without a screenshot for this account (admin "trusted" setting, deliberately not named here).
    quickSubmit: user.role === "bidder" && !!user.trusted,
    total,
    page,
    limit,
    totals,
    byProfile,
  });
});
