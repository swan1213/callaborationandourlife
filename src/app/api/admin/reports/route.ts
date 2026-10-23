import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/models/Settings";
import { buildProfileReports, reportDayKey, sendDailyReports } from "@/lib/notifications";
import { dailyReportEmail } from "@/lib/emailTemplates";
import { appUrl, emailEnabled } from "@/lib/email";
import { dayKey, formatDayLong } from "@/lib/tz";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?day=YYYY-MM-DD → HTML preview of the admin report (defaults to today so far). */
export const GET = handler(async (req: Request) => {
  const admin = await requireUser("admin");
  const settings = await getSettings();
  const tz = settings.reportTimezone || "UTC";
  const day = new URL(req.url).searchParams.get("day") || dayKey(new Date(), tz);
  if (!DAY.test(day)) throw new HttpError(400, "day must be YYYY-MM-DD");
  const email = dailyReportEmail({
    recipientName: admin.name,
    scope: "all",
    dayLabel: formatDayLong(day),
    timezone: tz,
    profiles: await buildProfileReports(day, tz, null),
    url: appUrl(),
  });
  return new Response(email.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

/** POST { day?, onlyMe? } → send the report now (ignores the once-per-day lock). */
export const POST = handler(async (req: Request) => {
  const admin = await requireUser("admin");
  if (!emailEnabled()) throw new HttpError(400, "Email is not configured (RESEND_API_KEY / EMAIL_FROM / EMAIL_ENABLED)");
  const body = await req.json().catch(() => ({}));
  const settings = await getSettings();
  const day = body.day || reportDayKey(settings.reportTimezone || "UTC");
  if (!DAY.test(day)) throw new HttpError(400, "day must be YYYY-MM-DD");
  const result = await sendDailyReports({ key: day, force: true, onlyTo: body.onlyMe ? admin.email : undefined });
  return NextResponse.json(result);
});
