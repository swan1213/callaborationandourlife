import { NextResponse } from "next/server";
import { handler, profileScope, requireStaff } from "@/lib/auth";
import { computeAnalytics } from "@/lib/analytics";

const DAY = 86_400_000;

/**
 * GET ?from=&to= (ISO; default the last 90 days) → the application → interview funnel, breakdowns by profile, bidder
 * and resume design, weekly trends and AI cost. Users (profile managers) see their own profiles only.
 */
export const GET = handler(async (req: Request) => {
  const staff = await requireStaff();
  const sp = new URL(req.url).searchParams;
  const to = sp.get("to") ? new Date(sp.get("to")!) : new Date();
  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(to.getTime() - 89 * DAY);
  if (Number.isNaN(+from) || Number.isNaN(+to)) return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  return NextResponse.json(await computeAnalytics(profileScope(staff), from, to));
});
