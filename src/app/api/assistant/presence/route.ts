import { NextResponse } from "next/server";
import { quietHandler } from "@/lib/auth";
import { requireAssistant } from "@/lib/assistant";
import { readIdle, recordPresence } from "@/lib/presence";

/**
 * POST { idleMs } — heartbeat from the Interview Assistant (Bearer assistant token), every minute while it is open.
 * A running interview counts as active, so time spent in a call is work time.
 */
export const POST = quietHandler(async (req: Request) => {
  const { user } = await requireAssistant(req);
  await recordPresence(user._id, await readIdle(req));
  return NextResponse.json({ ok: true });
});
