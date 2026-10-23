import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { ActivityLog } from "@/lib/models/ActivityLog";
import { LOG_CATEGORIES } from "@/lib/activity";
import { logFilter } from "@/lib/logFilter";
import { paging } from "@/lib/query";

/** Activity log (admin): newest first, filterable, paged. Also returns per-category counts for the current filter. */
export const GET = handler(async (req: Request) => {
  await requireUser("admin");
  const sp = new URL(req.url).searchParams;
  const filter = logFilter(sp);
  const { page, limit, skip } = paging(sp, 50);
  const withoutCategory = { ...filter };
  delete withoutCategory.category;
  const [items, total, byCategory, errors24h] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
    ActivityLog.aggregate([{ $match: withoutCategory }, { $group: { _id: "$category", n: { $sum: 1 } } }]),
    ActivityLog.countDocuments({ level: "error", createdAt: { $gte: new Date(Date.now() - 86400_000) } }),
  ]);
  return NextResponse.json({
    items,
    total,
    page,
    limit,
    categories: LOG_CATEGORIES,
    byCategory: Object.fromEntries(byCategory.map((c) => [c._id, c.n])),
    errors24h,
  });
});
