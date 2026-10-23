import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { handler, HttpError } from "@/lib/auth";
import { sendDailyReports } from "@/lib/notifications";
import { runInterviewSweep } from "@/lib/interviews";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Invoked by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export const GET = handler(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
  await connectDB();
  const report = await sendDailyReports();
  // Fallback for deployments without a frequent interview cron.
  const interviews = await runInterviewSweep().catch((e) => ({ error: String(e) }));
  return NextResponse.json({ ...report, interviews });
});
