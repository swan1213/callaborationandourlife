import type { Types } from "mongoose";
import { Application } from "./models/Application";
import { Profile } from "./models/Profile";
import { User } from "./models/User";
import { getSettings } from "./models/Settings";
import { claim, NotificationLog } from "./models/NotificationLog";
import { appUrl, sendEmail } from "./email";
import { notify } from "./inbox";
import { dailyReportEmail, profileMilestoneEmail, userMilestoneEmail, type BidRow, type ProfileReport } from "./emailTemplates";
import { dayKey, dayRange, formatDayLong, formatTime, todayRange } from "./tz";

type BidDoc = {
  _id: Types.ObjectId;
  user: Types.ObjectId | { _id: Types.ObjectId; name?: string };
  profile: Types.ObjectId;
  company?: string | null;
  jobTitle?: string | null;
  jobUrl?: string | null;
  status: string;
  createdAt: Date;
};

function bidRow(b: BidDoc, tz: string, bidderName?: string): BidRow {
  const u = b.user as { name?: string };
  return {
    time: formatTime(new Date(b.createdAt), tz),
    company: b.company || "",
    role: b.jobTitle || "",
    bidder: bidderName ?? u?.name ?? "Unknown",
    status: b.status,
    jobUrl: b.jobUrl || undefined,
  };
}

/* ------------------------------------------------------------ milestones */

/**
 * Called when an application becomes SUBMITTED (confirmation screenshot uploaded).
 * Sends each configured milestone (1st, 50th, 100th…) of submitted applications once per period
 * to the profile's managers (users/admins) and to the bidder.
 * Uses ">= milestone" plus an idempotency key, so concurrent submissions can't skip or duplicate a milestone.
 */
export async function processSubmissionMilestones(applicationId: Types.ObjectId | string) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;
  const milestones = [...new Set((settings.milestones ?? []).filter((n) => n > 0))].sort((a, b) => a - b);
  if (!milestones.length) return;

  const app = await Application.findById(applicationId).lean<BidDoc & { submittedAt?: Date }>();
  if (!app || app.status !== "submitted") return;
  const tz = settings.reportTimezone || "UTC";
  const period = (settings.milestonePeriod as "daily" | "lifetime") || "daily";
  const { start, key: today } = todayRange(tz, new Date(app.submittedAt ?? Date.now()));
  const since = period === "daily" ? start : new Date(0);
  const periodKey = period === "daily" ? today : "all";
  const url = appUrl();

  const [bidder, profile] = await Promise.all([
    User.findById(app.user).select("name email").lean(),
    Profile.findById(app.profile).select("label").lean(),
  ]);
  const latest = bidRow(app, tz, bidder?.name);

  // Users and admins assigned to manage this profile
  const submitted: Record<string, unknown> = { status: "submitted", deletedByUser: { $ne: true }, submittedAt: { $gte: since } };
  const profileCount = await Application.countDocuments({ profile: app.profile, ...submitted } as Record<string, unknown>);
  const reached = milestones.filter((m) => profileCount >= m);
  if (reached.length && profile) {
    const reps = await User.find({ role: { $in: ["user", "admin"] }, status: "approved", managedProfiles: app.profile }).select("name email").lean();
    for (const m of reached) {
      if (!reps.length) break;
      if (!(await claim(`ms-sub:profile:${app.profile}:${periodKey}:${m}`, "milestone-profile", { profileCount, applicationId: String(app._id) }))) continue;
      await notify(reps, {
        kind: "milestone",
        tone: "success",
        title: `${profile.label}: ${m} submitted ${period === "daily" ? "today" : "in total"}`,
        body: `${profileCount} applications submitted for ${profile.label}${period === "daily" ? " today" : ""}. Latest: ${latest.company || "a company"}${latest.role ? ` · ${latest.role}` : ""} by ${latest.bidder}.`,
        url: "/admin/applications",
      });
      await Promise.all(
        reps.map((r) =>
          sendEmail(
            r.email,
            profileMilestoneEmail({ recipientName: r.name, profileLabel: profile.label, milestone: m, count: profileCount, period, latest, url })
          )
        )
      );
    }
  }

  // The bidder
  if (bidder) {
    const userCount = await Application.countDocuments({ user: app.user, ...submitted } as Record<string, unknown>);
    for (const m of milestones.filter((x) => userCount >= x)) {
      if (!(await claim(`ms-sub:user:${app.user}:${periodKey}:${m}`, "milestone-user", { userCount, applicationId: String(app._id) }))) continue;
      await notify([bidder._id], {
        kind: "milestone",
        tone: "success",
        title: `Milestone: ${m} submitted ${period === "daily" ? "today" : "in total"}`,
        body: `You have submitted ${userCount} applications${period === "daily" ? " today" : ""}. Keep it up!`,
        url: "/applications",
      });
      await sendEmail(bidder.email, userMilestoneEmail({ recipientName: bidder.name, milestone: m, count: userCount, period, latest, url }));
    }
  }
}

/* ---------------------------------------------------------- daily report */

/** The local day that most recently ended (cron may fire anywhere in the first hour after midnight). */
export function reportDayKey(tz: string, now = new Date()) {
  return dayKey(new Date(now.getTime() - 2 * 3600 * 1000), tz);
}

export async function buildProfileReports(key: string, tz: string, profileIds: Types.ObjectId[] | null) {
  const { start, end } = dayRange(key, tz);
  const profileFilter = profileIds ? { _id: { $in: profileIds } } : {};
  const profiles = await Profile.find(profileFilter)
    .select("label fullName active")
    .sort({ label: 1 })
    .lean();
  const bids = await Application.find({
    createdAt: { $gte: start, $lt: end },
    status: { $ne: "not_generated" },
    profile: { $in: profiles.map((p) => p._id) },
  })
    .select("user profile company jobTitle jobUrl status createdAt")
    .populate("user", "name")
    .sort({ createdAt: 1 })
    .lean<BidDoc[]>();

  const byProfile = new Map<string, BidDoc[]>();
  for (const b of bids) {
    const k = String(b.profile);
    byProfile.set(k, [...(byProfile.get(k) ?? []), b]);
  }
  // Inactive profiles are only listed when they had bids that day.
  return profiles
    .filter((p) => p.active || byProfile.has(String(p._id)))
    .map<ProfileReport>((p) => {
      const list = byProfile.get(String(p._id)) ?? [];
      return {
        label: p.label,
        fullName: p.fullName,
        count: list.length,
        submitted: list.filter((b) => b.status === "submitted").length,
        bids: list.map((b) => bidRow(b, tz)),
      };
    });
}

export type ReportResult = { day: string; sent: { email: string; scope: string; bids: number; ok: boolean }[]; skipped?: string };

/**
 * Emails the daily report for `key` (defaults to the day that just ended): every admin gets all
 * profiles; every user (manager) gets their managed profiles. Idempotent per day unless `force`.
 */
export async function sendDailyReports(opts: { key?: string; force?: boolean; onlyTo?: string } = {}): Promise<ReportResult> {
  const settings = await getSettings();
  const tz = settings.reportTimezone || "UTC";
  const key = opts.key || reportDayKey(tz);
  if (!opts.force && !settings.dailyReportEnabled) return { day: key, sent: [], skipped: "Daily report is disabled in Settings" };
  if (!opts.force && !(await claim(`report:${key}`, "daily-report"))) return { day: key, sent: [], skipped: "Report already sent for this day" };

  const dayLabel = formatDayLong(key);
  const url = appUrl();
  const staff = await User.find({ role: { $in: ["admin", "user"] }, status: "approved", ...(opts.onlyTo ? { email: opts.onlyTo } : {}) })
    .select("name email role managedProfiles")
    .lean();

  const allReports = staff.some((s) => s.role === "admin") ? await buildProfileReports(key, tz, null) : [];
  const sent: ReportResult["sent"] = [];
  for (const s of staff) {
    const isAdmin = s.role === "admin";
    if (!isAdmin && !s.managedProfiles?.length) continue;
    const profiles = isAdmin ? allReports : await buildProfileReports(key, tz, s.managedProfiles as Types.ObjectId[]);
    const email = dailyReportEmail({ recipientName: s.name, scope: isAdmin ? "all" : "managed", dayLabel, timezone: tz, profiles, url });
    const ok = await sendEmail(s.email, email);
    sent.push({ email: s.email, scope: isAdmin ? "all" : "managed", bids: profiles.reduce((a, p) => a + p.count, 0), ok });
  }
  if (!opts.force) await NotificationLog.updateOne({ key: `report:${key}` }, { recipients: sent.map((x) => x.email), meta: { sent } });
  return { day: key, sent };
}
