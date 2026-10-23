import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { historyScope } from "@/lib/interviewSessions";
import { InterviewSession } from "@/lib/models/InterviewSession";

/** GET — Interview History: every recording for admins, their own for users and callers (newest first). */
export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await InterviewSession.aggregate([
    { $match: historyScope(user) },
    { $sort: { startedAt: -1 } },
    { $limit: 2000 },
    {
      $project: {
        clientId: 1,
        user: 1,
        userName: 1,
        interview: 1,
        profileLabel: 1,
        company: 1,
        role: 1,
        stage: 1,
        startedAt: 1,
        endedAt: 1,
        questionCount: { $size: "$answers" },
        captionCount: { $size: "$captions" },
        summary: { $ifNull: ["$report.summary", ""] },
      },
    },
  ]);
  return NextResponse.json({ items: rows, canSeeAll: user.role === "admin" });
});
