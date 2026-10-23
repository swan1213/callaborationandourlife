import { handler, HttpError } from "@/lib/auth";
import { apiJson, interviewOut, requireAccessKey } from "@/lib/apiAccess";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import "@/lib/models/Profile";
import "@/lib/models/User";
import { oid } from "@/lib/query";
import { APP_TZ, dayRange } from "@/lib/tz";

const STATUSES = ["pending", "open", "scheduled", "completed", "cancelled"];

/** "YYYY-MM-DD" (a day in GMT-04:00) or an ISO date-time. */
function parseDate(v: string | null, end: boolean) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return end ? dayRange(v, APP_TZ).end : dayRange(v, APP_TZ).start;
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new HttpError(400, `Invalid date: ${v}`);
  return d;
}

/**
 * GET /api/v1/interviews — interviews on the calendar.
 * ?from=&to=       YYYY-MM-DD (GMT-04:00 days, "to" inclusive) or ISO date-times; filters by the scheduled time
 * ?status=         comma list (default scheduled,completed): pending, open, scheduled, completed, cancelled
 * ?profile= ?caller=  ids
 * ?limit= (1–500, default 100)  ?page= (1-based)
 */
export const GET = handler(async (req: Request) => {
  await requireAccessKey(req);
  const sp = new URL(req.url).searchParams;
  const status = (sp.get("status") ?? "scheduled,completed").split(",").map((s) => s.trim()).filter(Boolean);
  const bad = status.find((s) => !STATUSES.includes(s));
  if (bad) throw new HttpError(400, `Unknown status: ${bad}`);
  const filter: Record<string, unknown> = { deletedAt: null, status: { $in: status } };
  if (sp.get("profile")) filter.profile = oid(sp.get("profile"), "profile");
  if (sp.get("caller")) filter.caller = oid(sp.get("caller"), "caller");
  const from = parseDate(sp.get("from"), false);
  const to = parseDate(sp.get("to"), true);
  if (from || to) filter.$or = [{ scheduledAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) } }, { scheduledAt: null, windowStart: { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) } }];
  const limit = Math.min(500, Math.max(1, Math.round(Number(sp.get("limit")) || 100)));
  const page = Math.max(1, Math.round(Number(sp.get("page")) || 1));

  const [total, items] = await Promise.all([
    InterviewRequest.countDocuments(filter),
    InterviewRequest.find(filter)
      .populate("profile", "label fullName")
      .populate("caller", "name email")
      .populate("requestedBy", "name")
      .sort({ scheduledAt: 1, windowStart: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  return apiJson({ total, page, limit, items: items.map((i) => interviewOut(i as never)) });
});
