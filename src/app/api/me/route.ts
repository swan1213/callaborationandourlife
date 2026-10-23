import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { getSettings } from "@/lib/models/Settings";
import { monthStart } from "@/lib/query";
import { isValidTimeZone } from "@/lib/tz";
import { manualQueue } from "@/lib/manualQueue";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { isOurCloudinaryUrl, SCREENSHOT_FOLDER } from "@/lib/cloudinary";
import { AVATAR_PRESETS } from "@/components/Avatar";

export const GET = handler(async () => {
  const user = await requireUser();
  const settings = await getSettings();
  const [totals] = await Application.aggregate([
    { $match: { user: user._id, status: { $ne: "not_generated" } } },
    {
      $group: {
        _id: null,
        generated: { $sum: 1 },
        submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
        fees: { $sum: "$fee" },
        monthGenerated: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart()] }, 1, 0] } },
        monthFees: { $sum: { $cond: [{ $gte: ["$createdAt", monthStart()] }, "$fee", 0] } },
      },
    },
  ]);
  return NextResponse.json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      feePerApplication: user.role === "bidder" ? user.feePerApplication : null,
      mustChangePassword: !!user.mustChangePassword,
      avatar: user.avatar ?? "",
      createdAt: user.get("createdAt"),
      // Admins, users and callers have their own zone (bidders use the default GMT-04:00).
      timezone: user.role !== "bidder" ? user.timezone || "" : "",
      callerSettings:
        user.role === "caller"
          ? { reminderMinutes: user.callerSettings?.reminderMinutes ?? 60, digestHour: user.callerSettings?.digestHour ?? 18 }
          : null,
    },
    interviews:
      user.role === "caller"
        ? {
            pending: await InterviewRequest.countDocuments({ caller: user._id, status: "pending" }),
            open: await InterviewRequest.countDocuments({ status: "open" }),
            upcoming: await InterviewRequest.countDocuments({ caller: user._id, status: "scheduled", scheduledAt: { $gte: new Date() } }),
            reportDue: await InterviewRequest.countDocuments({ caller: user._id, status: "scheduled", scheduledAt: { $lt: new Date() } }),
            done: await InterviewRequest.countDocuments({ caller: user._id, status: "completed" }),
          }
        : null,
    manualQueue: user.role === "bidder" ? await manualQueue(user) : null,
    notice: settings.myPageNotice,
    siteName: settings.siteName,
    stats: totals ?? { generated: 0, submitted: 0, fees: 0, monthGenerated: 0, monthFees: 0 },
  });
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  const { name, currentPassword, newPassword, callerSettings, avatar, timezone } = await req.json();
  // Own time zone (admins, users, callers): used on the interview pages, and for callers' emails too.
  if (typeof timezone === "string" && user.role !== "bidder") {
    if (timezone && !isValidTimeZone(timezone)) throw new HttpError(400, "Unknown time zone");
    user.timezone = timezone;
  }
  if (typeof avatar === "string") {
    const ok =
      avatar === "" ||
      AVATAR_PRESETS.some((p) => `preset:${p.id}` === avatar) ||
      (isOurCloudinaryUrl(avatar) && avatar.includes(`/${SCREENSHOT_FOLDER}/${user._id}/`));
    if (!ok) throw new HttpError(400, "Invalid avatar");
    user.avatar = avatar;
  }
  if (callerSettings && user.role === "caller") {
    const reminder = Number(callerSettings.reminderMinutes);
    if (!Number.isFinite(reminder) || reminder < 0 || reminder > 1440) throw new HttpError(400, "Reminder must be between 0 and 1440 minutes");
    const hour = Number(callerSettings.digestHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new HttpError(400, "Choose the hour for the next-day schedule email");
    user.set("callerSettings", { timezone: "", reminderMinutes: Math.round(reminder), digestHour: hour });
  }
  if (name !== undefined) {
    if (!String(name).trim()) throw new HttpError(400, "Name cannot be empty");
    user.name = String(name).trim();
  }
  if (newPassword) {
    if (!(await bcrypt.compare(String(currentPassword || ""), user.passwordHash)))
      throw new HttpError(400, "Current password is incorrect");
    if (String(newPassword).length < 8) throw new HttpError(400, "New password must be at least 8 characters");
    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    user.mustChangePassword = false;
  }
  await user.save();
  return NextResponse.json({ ok: true });
});
