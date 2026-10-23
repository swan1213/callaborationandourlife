import { NextResponse } from "next/server";
import { quietHandler, requireUser } from "@/lib/auth";
import { InterviewRequest } from "@/lib/models/InterviewRequest";

/** How far ahead the app looks for interviews to announce. */
const AHEAD_MS = 3 * 60 * 60 * 1000;

/**
 * GET — the signed-in caller's interviews that start within 3 hours or are running now (components/UpcomingInterviews.tsx
 * shows the banner, toasts and desktop alerts). Polled every minute by every open tab: kept out of the activity log.
 */
export const GET = quietHandler(async () => {
  const user = await requireUser();
  if (user.role !== "caller") return NextResponse.json({ items: [] });
  const now = Date.now();
  const items = await InterviewRequest.find({
    caller: user._id,
    status: "scheduled",
    deletedAt: null,
    // Running interviews too: the longest is 8 hours.
    scheduledAt: { $gte: new Date(now - 8 * 60 * 60 * 1000), $lte: new Date(now + AHEAD_MS) },
  })
    .select("company jobTitle step profileLabel profile scheduledAt durationMinutes")
    .populate("profile", "label fullName")
    .sort({ scheduledAt: 1 })
    .lean();
  return NextResponse.json(
    {
      items: items
        .filter((i) => i.scheduledAt && i.scheduledAt.getTime() + (i.durationMinutes ?? 60) * 60_000 > now)
        .map((i) => ({ ...i, _id: String(i._id) })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
});
