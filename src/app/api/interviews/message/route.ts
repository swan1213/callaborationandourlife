import { after, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { handler, HttpError, requireStaff } from "@/lib/auth";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { Message } from "@/lib/models/Message";
import { User } from "@/lib/models/User";
import { oid } from "@/lib/query";
import { appUrl, sendEmail } from "@/lib/email";
import { APP_TZ, dayRange, formatDayLong, formatTime, isValidTimeZone, zoneName } from "@/lib/tz";
import { interviewDayMessageEmail } from "@/lib/interviewEmails";

/**
 * POST { callerId, day: "YYYY-MM-DD", note? } — send a caller their interviews for that day (in their time zone),
 * with an optional note: as an in-app notification and by email.
 * Admins: any caller. Profile managers: callers assigned to a profile they manage.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireStaff();
  const b = await req.json();
  const managed = user.role === "admin" ? null : ((user.managedProfiles ?? []) as Types.ObjectId[]);
  const caller = await User.findOne({
    _id: oid(b.callerId, "caller"),
    role: "caller",
    status: "approved",
    ...(managed ? { assignedProfiles: { $in: managed } } : {}),
  })
    .select("name email timezone")
    .lean();
  if (!caller) throw new HttpError(400, managed ? "Choose a caller assigned to one of your profiles" : "Choose an active caller");
  const day = String(b.day ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "Pick the date");
  const note = String(b.note ?? "").trim().slice(0, 2000);

  // The day and times are the caller's own (their time zone, else GMT-04:00).
  const tz = caller.timezone && isValidTimeZone(caller.timezone) ? caller.timezone : APP_TZ;
  const { start, end } = dayRange(day, tz);
  const items = await InterviewRequest.find({
    caller: caller._id,
    status: "scheduled",
    scheduledAt: { $gte: start, $lt: end },
    ...(managed ? { profile: { $in: managed } } : {}),
  })
    .populate("profile", "label")
    .sort({ scheduledAt: 1 })
    .lean<{ _id: Types.ObjectId; scheduledAt: Date; company: string; jobTitle: string; step: number; callerNote: string; profile: { label: string } | null; profileLabel: string }[]>();

  const dayLabel = formatDayLong(day);
  const zone = zoneName(tz, start);
  const rows = items.map((i) => ({
    time: formatTime(new Date(i.scheduledAt), tz),
    profile: i.profile?.label ?? i.profileLabel,
    company: i.company,
    role: `Step ${i.step ?? 1} · ${i.jobTitle}`,
    note: i.callerNote,
  }));
  const lines = rows.length
    ? rows.map((r) => `• ${r.time} · ${r.profile} · ${r.company} (${r.role})${r.note ? ` · ${r.note}` : ""}`).join("\n")
    : "No interviews are scheduled for you on this day.";
  const title = `Your interviews for ${dayLabel}`;
  const body = `${note ? `${note}\n\n` : ""}${lines}\n\nTimes are in ${zone}.`;

  const message = await Message.create({
    title,
    body,
    audience: { roles: [], users: [caller._id] },
    recipients: [caller._id],
    email: true,
    sender: user._id,
    senderName: user.name,
  });
  after(async () => {
    const sent = await sendEmail(
      caller.email,
      interviewDayMessageEmail({ name: caller.name, from: user.name, day: dayLabel, timezone: zone, note, rows, url: `${appUrl()}/caller/schedule` })
    );
    await Message.updateOne({ _id: message._id }, { $set: { emailedCount: sent ? 1 : 0 } });
  });
  return NextResponse.json({ ok: true, caller: caller.name, interviews: rows.length });
});
