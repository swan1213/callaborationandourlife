import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { handler, HttpError } from "@/lib/auth";
import { runInterviewSweep } from "@/lib/interviews";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Interview overdue notices, pre-interview reminders and next-day schedules.
 * Call every 5 minutes with `Authorization: Bearer $CRON_SECRET` (Vercel Cron on Pro, or any external scheduler).
 * The app also runs this sweep opportunistically on page loads, at most once a minute.
 */
export const GET = handler(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  await connectDB();
  return NextResponse.json(await runInterviewSweep());
});
