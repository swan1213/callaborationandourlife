import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { APP_TZ, dayKey, dayRange } from "@/lib/tz";

const WEEKS = 8;
const MONTHS = 6;

type Bucket = { key: string; label: string; created: number; submitted: number; interviews: number };

const pad = (n: number) => String(n).padStart(2, "0");
const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** Monday of the week containing the local day `k`. */
const weekOf = (k: string) => {
  const d = fromKey(k);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return toKey(d);
};
const monthOf = (k: string) => k.slice(0, 7);

/**
 * The signed-in user's own activity by week and month (site timezone):
 * resumes created, applications submitted, and initial interviews (step 1) scheduled.
 */
export const GET = handler(async () => {
  const user = await requireUser();
  // Weeks and months follow the default zone (GMT-04:00).
  const tz = APP_TZ;
  const today = dayKey(new Date(), tz);

  // Buckets, oldest first.
  const thisWeek = weekOf(today);
  const weeks: Bucket[] = Array.from({ length: WEEKS }, (_, i) => {
    const d = fromKey(thisWeek);
    d.setUTCDate(d.getUTCDate() - 7 * (WEEKS - 1 - i));
    const key = toKey(d);
    const end = new Date(d);
    end.setUTCDate(end.getUTCDate() + 6);
    return { key, label: `${key} – ${toKey(end)}`, created: 0, submitted: 0, interviews: 0 };
  });
  const [ty, tm] = today.split("-").map(Number);
  const months: Bucket[] = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(ty, tm - 1 - (MONTHS - 1 - i), 1));
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    return { key, label: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`, created: 0, submitted: 0, interviews: 0 };
  });
  const since = dayRange(`${months[0].key}-01`, tz).start;
  const weekSince = dayRange(weeks[0].key, tz).start;
  const from = since < weekSince ? since : weekSince;

  const [created, submitted, interviews, totals] = await Promise.all([
    Application.find({ user: user._id, status: { $ne: "not_generated" }, createdAt: { $gte: from } }).select("createdAt").lean(),
    Application.find({ user: user._id, status: "submitted", submittedAt: { $gte: from } }).select("submittedAt").lean(),
    InterviewRequest.find({ requestedBy: user._id, step: 1, status: { $in: ["scheduled", "completed"] }, scheduledAt: { $gte: from } }).select("scheduledAt").lean(),
    Promise.all([
      Application.countDocuments({ user: user._id, status: { $ne: "not_generated" } }),
      Application.countDocuments({ user: user._id, status: "submitted" }),
      InterviewRequest.countDocuments({ requestedBy: user._id, step: 1, status: { $in: ["scheduled", "completed"] } }),
    ]),
  ]);

  const add = (date: Date | null | undefined, field: "created" | "submitted" | "interviews") => {
    if (!date) return;
    const k = dayKey(new Date(date), tz);
    const w = weeks.find((x) => x.key === weekOf(k));
    if (w) w[field]++;
    const m = months.find((x) => x.key === monthOf(k));
    if (m) m[field]++;
  };
  created.forEach((a) => add(a.createdAt, "created"));
  submitted.forEach((a) => add(a.submittedAt, "submitted"));
  interviews.forEach((i) => add(i.scheduledAt, "interviews"));

  return NextResponse.json({
    timezone: tz,
    weeks,
    months,
    allTime: { created: totals[0], submitted: totals[1], interviews: totals[2] },
  });
});
