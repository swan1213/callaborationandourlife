// Daily member reports: every evening (the daily-report cron) each member's day is summed up from what they did in
// TailorBid and posted to the admins-only "Daily reports" chat as a message from that member. Each report covers the
// time since the previous one, so nothing falls between two reports however late the cron fires.
import { Types } from "mongoose";
import { Application } from "./models/Application";
import { ChatConversation, ChatMessage } from "./models/Chat";
import { InterviewRequest } from "./models/InterviewRequest";
import { JobLinkCopy } from "./models/JobLinkCopy";
import { claim, NotificationLog } from "./models/NotificationLog";
import { Profile } from "./models/Profile";
import { getSettings } from "./models/Settings";
import { User } from "./models/User";
import { WorkSession } from "./models/WorkSession";
import { reportsConversation } from "./chat";
import { reportDayKey } from "./notifications";
import { sendPush } from "./push";
import { isEmptyReport, reportText, type WorkReport } from "./workReport";

const HOUR = 3600_000;
/** A report never reaches further back than this (first run, or after the cron was off for a while). */
const MAX_SPAN = 48 * HOUR;
/** Members with no activity in the period still get a ("no activity") report if they worked this recently. */
const RECENT_MS = 14 * 24 * HOUR;

type Id = Types.ObjectId;
const inc = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

/** Builds the report of each account in `users` for [from, to). */
export async function buildWorkReports(users: { _id: Id; role: string }[], from: Date, to: Date, day: string) {
  const ids = users.map((u) => u._id);
  const span = { $gte: from, $lt: to };
  const [sessions, created, submitted, requested, held, reported, copied, chats] = await Promise.all([
    WorkSession.find({ user: { $in: ids }, end: { $gt: from }, start: { $lt: to } }).select("user start end").lean(),
    Application.aggregate<{ _id: { user: Id; profile: Id; failed: boolean }; n: number }>([
      { $match: { user: { $in: ids }, createdAt: span } },
      { $group: { _id: { user: "$user", profile: "$profile", failed: { $eq: ["$status", "not_generated"] } }, n: { $sum: 1 } } },
    ]),
    Application.aggregate<{ _id: { user: Id; profile: Id }; n: number }>([
      { $match: { user: { $in: ids }, status: "submitted", submittedAt: span } },
      { $group: { _id: { user: "$user", profile: "$profile" }, n: { $sum: 1 } } },
    ]),
    InterviewRequest.aggregate<{ _id: Id; n: number }>([
      { $match: { requestedBy: { $in: ids }, createdAt: span, deletedAt: null } },
      { $group: { _id: "$requestedBy", n: { $sum: 1 } } },
    ]),
    InterviewRequest.aggregate<{ _id: Id; n: number }>([
      { $match: { caller: { $in: ids }, scheduledAt: span, status: { $in: ["scheduled", "completed"] }, deletedAt: null } },
      { $group: { _id: "$caller", n: { $sum: 1 } } },
    ]),
    InterviewRequest.aggregate<{ _id: { user: Id; outcome: string | null }; n: number }>([
      { $match: { "report.reportedBy": { $in: ids }, "report.reportedAt": span, deletedAt: null } },
      { $group: { _id: { user: "$report.reportedBy", outcome: "$report.outcome" }, n: { $sum: 1 } } },
    ]),
    JobLinkCopy.aggregate<{ _id: Id; n: number }>([{ $match: { copiedBy: { $in: ids }, copiedAt: span } }, { $group: { _id: "$copiedBy", n: { $sum: 1 } } }]),
    ChatMessage.aggregate<{ _id: Id; n: number }>([
      { $match: { sender: { $in: ids }, createdAt: span, report: null } },
      { $group: { _id: "$sender", n: { $sum: 1 } } },
    ]),
  ]);

  const profileIds = [...new Set([...created, ...submitted].map((r) => String(r._id.profile)))];
  const labels = new Map(
    (await Profile.find({ _id: { $in: profileIds } }).select("label").lean()).map((p) => [String(p._id), p.label as string])
  );

  return new Map(
    users.map((u) => {
      const me = String(u._id);
      let minutes = 0;
      let first: Date | null = null;
      let last: Date | null = null;
      for (const s of sessions.filter((x) => String(x.user) === me)) {
        const a = new Date(Math.max(s.start.getTime(), from.getTime()));
        const b = new Date(Math.min(s.end.getTime(), to.getTime()));
        if (b <= a) continue;
        minutes += (b.getTime() - a.getTime()) / 60_000;
        if (!first || a < first) first = a;
        if (!last || b > last) last = b;
      }

      const gen = new Map<string, number>();
      const sub = new Map<string, number>();
      let failed = 0;
      for (const r of created.filter((x) => String(x._id.user) === me)) {
        if (r._id.failed) failed += r.n;
        else inc(gen, String(r._id.profile), r.n);
      }
      for (const r of submitted.filter((x) => String(x._id.user) === me)) inc(sub, String(r._id.profile), r.n);
      const byProfile = [...new Set([...gen.keys(), ...sub.keys()])]
        .map((p) => ({ label: labels.get(p) ?? "Deleted profile", generated: gen.get(p) ?? 0, submitted: sub.get(p) ?? 0 }))
        .sort((a, b) => b.generated + b.submitted - (a.generated + a.submitted) || a.label.localeCompare(b.label));

      const outcomes = { passed: 0, failed: 0, waiting: 0, no_show: 0 };
      let reportedN = 0;
      for (const r of reported.filter((x) => String(x._id.user) === me)) {
        reportedN += r.n;
        if (r._id.outcome && r._id.outcome in outcomes) outcomes[r._id.outcome as keyof typeof outcomes] += r.n;
      }
      const count = (rows: { _id: Id; n: number }[]) => rows.find((x) => String(x._id) === me)?.n ?? 0;

      const report: WorkReport = {
        day,
        from: from.toISOString(),
        to: to.toISOString(),
        role: u.role,
        work: { minutes: Math.round(minutes), first: first?.toISOString() ?? null, last: last?.toISOString() ?? null },
        apps: {
          generated: byProfile.reduce((t, p) => t + p.generated, 0),
          submitted: byProfile.reduce((t, p) => t + p.submitted, 0),
          failed,
          byProfile,
        },
        interviews: { requested: count(requested), held: count(held), reported: reportedN, outcomes },
        linksCopied: count(copied),
        chatMessages: count(chats),
      };
      return [me, report] as const;
    })
  );
}

export type MemberReportResult = { day: string; from: string; to: string; posted: number; skipped?: string };

/**
 * Posts every member's report (all approved accounts except admins) to the Daily reports chat.
 * The cron calls it once per report day; `now` (an admin's "Post reports now") posts right away, and the next
 * report then starts from there.
 */
export async function postMemberReports(opts: { now?: boolean } = {}): Promise<MemberReportResult> {
  const settings = await getSettings();
  const tz = settings.reportTimezone || "UTC";
  const day = reportDayKey(tz);
  const to = new Date();
  const prev = await NotificationLog.findOne({ kind: "member-report" }).sort({ createdAt: -1 }).lean<{ meta?: { to?: string } }>();
  const prevTo = prev?.meta?.to ? new Date(prev.meta.to) : null;
  const from = new Date(Math.max(prevTo?.getTime() ?? 0, to.getTime() - (prevTo ? MAX_SPAN : 24 * HOUR)));
  const result = { day, from: from.toISOString(), to: to.toISOString(), posted: 0 };

  if (!opts.now) {
    if (settings.memberReportsEnabled === false) return { ...result, skipped: "Member reports are turned off in Settings" };
    if (!(await claim(`member-report:${day}`, "member-report", { from: result.from, to: result.to })))
      return { ...result, skipped: "Reports already posted for this day" };
  } else {
    await NotificationLog.create({ key: `member-report-now:${result.to}`, kind: "member-report", meta: { from: result.from, to: result.to } });
  }

  const members = await User.find({ status: "approved", role: { $ne: "admin" } })
    .select("name role")
    .sort({ name: 1 })
    .lean<{ _id: Id; name: string; role: string }[]>();
  if (!members.length) return result;
  const reports = await buildWorkReports(members, from, to, day);
  const recent = new Set(
    (await WorkSession.distinct("user", { user: { $in: members.map((m) => m._id) }, end: { $gte: new Date(to.getTime() - RECENT_MS) } })).map(String)
  );
  // Busy members first (alphabetical within each group); members who haven't worked for two weeks are left out.
  const rows = members
    .map((m) => ({ m, r: reports.get(String(m._id))! }))
    .filter(({ m, r }) => !isEmptyReport(r) || recent.has(String(m._id)))
    .sort((a, b) => Number(isEmptyReport(a.r)) - Number(isEmptyReport(b.r)));
  if (!rows.length) return result;

  const conv = await reportsConversation();
  // Inserted directly so each message gets its own createdAt (keeps the order), with the schema's defaults.
  await ChatMessage.collection.insertMany(
    rows.map(({ m, r }, i) => {
      const at = new Date(to.getTime() + i);
      return {
        conversation: conv._id,
        sender: m._id,
        senderName: m.name,
        body: reportText(r),
        images: [],
        replyTo: null,
        mentions: [],
        editedAt: null,
        deletedAt: null,
        reactions: [],
        report: r,
        createdAt: at,
        updatedAt: at,
      };
    })
  );
  const summary = `${rows.length} member report${rows.length === 1 ? "" : "s"} for ${day}`;
  await ChatConversation.updateOne(
    { _id: conv._id },
    { lastMessageAt: new Date(to.getTime() + rows.length - 1), lastMessage: { body: summary, sender: null, senderName: "TailorBid" } }
  );
  const admins = await User.find({ role: "admin", status: "approved" }).select("_id").lean();
  await sendPush(
    admins.map((a) => String(a._id)),
    { title: "Daily reports are ready", body: summary, url: `/chat?c=${conv._id}`, tag: "member-reports" }
  ).catch(() => {});
  return { ...result, posted: rows.length };
}
