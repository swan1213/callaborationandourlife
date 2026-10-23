import { after, NextResponse } from "next/server";
import { quietHandler, requireUser } from "@/lib/auth";
import { User } from "@/lib/models/User";
import { presenceStatus, readIdle, recordPresence } from "@/lib/presence";
import { maybeRunInterviewSweep } from "@/lib/interviews";

// Both repeat every minute from every open tab: quietHandler keeps them out of the activity log.

/** GET — online / away / offline for every approved account (shown to everyone signed in). */
export const GET = quietHandler(async () => {
  await requireUser();
  const users = await User.find({ status: "approved" }).select("name role avatar lastSeenAt lastActiveAt").sort({ name: 1 }).lean();
  const now = Date.now();
  return NextResponse.json(
    {
      users: users.map((u) => ({ _id: String(u._id), name: u.name, role: u.role, avatar: u.avatar ?? "", status: presenceStatus(u, now), lastSeenAt: u.lastSeenAt ?? null })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
});

/**
 * POST { idleMs } — heartbeat from an open TailorBid tab (see components/Presence.tsx). Also runs the interview
 * reminder sweep (at most once a minute overall), so reminders go out on time whenever anyone has TailorBid open.
 */
export const POST = quietHandler(async (req: Request) => {
  const user = await requireUser();
  after(maybeRunInterviewSweep);
  await recordPresence(user._id, await readIdle(req));
  return NextResponse.json({ ok: true });
});
