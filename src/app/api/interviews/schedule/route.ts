import { after, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { handler, HttpError, requireUser } from "@/lib/auth";
import type { UserDoc } from "@/lib/models/User";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { Profile } from "@/lib/models/Profile";
import { User } from "@/lib/models/User";
import { Application } from "@/lib/models/Application";
import { oid } from "@/lib/query";
import { APP_TZ, isValidTimeZone } from "@/lib/tz";
import { chainInfo, notifyAdminScheduled, roleKey } from "@/lib/interviews";
import { companyKey } from "@/lib/company";

/**
 * Book an interview straight onto a caller's calendar (no request / screenshot step).
 * - admin: any active profile, any active caller
 * - user (profile manager): profiles they manage, callers assigned to that profile
 * - caller: profiles assigned to them, callers assigned to that profile (themselves included)
 */
async function scope(user: UserDoc): Promise<Types.ObjectId[] | null> {
  if (user.role === "admin") return null;
  if (user.role === "user") return (user.managedProfiles ?? []) as Types.ObjectId[];
  if (user.role === "caller") return (user.assignedProfiles ?? []) as Types.ObjectId[];
  throw new HttpError(403, "You can't schedule interviews");
}
const allows = (ids: Types.ObjectId[] | null, id: unknown) => !ids || ids.some((p) => String(p) === String(id));

/**
 * GET — form choices: profiles (each with its assigned callers) and, for admins, every active caller.
 * GET ?profile= — that profile's submitted applications (to attach the resume + job description).
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const ids = await scope(user);
  const profileParam = new URL(req.url).searchParams.get("profile");
  if (profileParam) {
    const profile = oid(profileParam, "profile");
    if (!allows(ids, profile)) throw new HttpError(403, "This profile is not yours to schedule for");
    const items = await Application.find({ profile, status: "submitted" })
      .select("company jobTitle jobUrl submittedAt user")
      .populate("user", "name")
      .sort({ submittedAt: -1 })
      .limit(1000)
      .lean();
    return NextResponse.json({ items });
  }
  const profiles = await Profile.find({ active: true, ...(ids ? { _id: { $in: ids } } : {}) })
    .select("label")
    .sort({ label: 1 })
    .lean();
  const callers = await User.find({ role: "caller", status: "approved" }).select("name assignedProfiles timezone").sort({ name: 1 }).lean();
  const zoneOf = (c: { timezone?: string | null }) => (c.timezone && isValidTimeZone(c.timezone) ? c.timezone : APP_TZ);
  return NextResponse.json({
    me: { id: String(user._id), role: user.role },
    profiles: profiles.map((p) => ({
      id: String(p._id),
      label: p.label,
      callers: callers.filter((c) => (c.assignedProfiles ?? []).some((x) => String(x) === String(p._id))).map((c) => ({ id: String(c._id), name: c.name, tz: zoneOf(c) })),
    })),
    // Only admins may book callers who aren't assigned to the profile.
    callers: ids ? [] : callers.map((c) => ({ id: String(c._id), name: c.name, tz: zoneOf(c) })),
  });
});

/** POST { profileId, callerId, scheduledAt, durationMinutes?, applicationId? | company + jobTitle, step?, callerNote?, notes?, timezone? } */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const ids = await scope(user);
  const b = await req.json();

  const profileId = oid(b.profileId, "profile");
  if (!allows(ids, profileId)) throw new HttpError(403, "This profile is not yours to schedule for");
  const profile = await Profile.findById(profileId).select("label active").lean();
  if (!profile || !profile.active) throw new HttpError(404, "Profile not found or inactive");

  const scheduledAt = new Date(b.scheduledAt);
  if (isNaN(scheduledAt.getTime())) throw new HttpError(400, "Enter the interview date and time");
  if (scheduledAt.getTime() < Date.now() - 5 * 60_000) throw new HttpError(400, "The interview time must be in the future");
  const duration = Math.round(Number(b.durationMinutes) || 60);
  if (duration < 5 || duration > 480) throw new HttpError(400, "Interview length must be between 5 and 480 minutes");

  // Optional: the submitted application (gives the caller its resume + job description).
  let application = null;
  let company = String(b.company ?? "").trim();
  let jobTitle = String(b.jobTitle ?? "").trim();
  if (b.applicationId) {
    const app = await Application.findOne({ _id: oid(b.applicationId, "application"), profile: profileId, status: "submitted" })
      .select("company jobTitle")
      .lean();
    if (!app) throw new HttpError(400, "Choose a submitted application of this profile");
    application = app._id;
    company = app.company || company;
    jobTitle = app.jobTitle || jobTitle;
  }
  company = company.slice(0, 200);
  jobTitle = jobTitle.slice(0, 200);
  if (!company) throw new HttpError(400, "Enter the company");
  if (!jobTitle) throw new HttpError(400, "Enter the role");

  const chain = await chainInfo(profileId, company, jobTitle);
  const step = Math.round(Number(b.step) || chain.nextStep);
  if (step < 1 || step > 10) throw new HttpError(400, "Interview step must be between 1 and 10");
  const taken = chain.previous.find((p) => p.step === step);
  if (taken) throw new HttpError(400, `Step ${step} already exists for this role (${taken.status}). The next step is ${chain.nextStep}.`);

  const caller = await User.findOne({
    _id: oid(b.callerId, "caller"),
    role: "caller",
    status: "approved",
    ...(ids ? { assignedProfiles: profileId } : {}),
  })
    .select("_id name")
    .lean();
  if (!caller) throw new HttpError(400, ids ? "Choose a caller assigned to this profile" : "Choose an active caller");
  // Keeping the chain's caller keeps the follow-up lock.
  const locked = !!chain.lead?.active && chain.lead.id === String(caller._id);

  const now = new Date();
  const self = String(caller._id) === String(user._id);
  const created = await InterviewRequest.create({
    profile: profileId,
    profileLabel: profile.label,
    requestedBy: user._id,
    application,
    company,
    jobTitle,
    companyKey: companyKey(company),
    roleKey: roleKey(jobTitle),
    step,
    lockedCaller: locked,
    previous: chain.lastId,
    mode: "exact",
    windowStart: scheduledAt,
    timezone: typeof b.timezone === "string" && isValidTimeZone(b.timezone) ? b.timezone : "UTC",
    durationMinutes: duration,
    notes: String(b.notes ?? "").slice(0, 2000),
    status: "scheduled",
    caller: caller._id,
    requestedCaller: caller._id,
    scheduledAt,
    callerNote: String(b.callerNote ?? "").slice(0, 1000),
    acceptedAt: now,
    scheduleBy: now,
    events: [{ at: now, by: user._id, byName: user.name, action: "scheduled", note: `Step ${step} · scheduled for ${self ? "themselves" : caller.name}` }],
  });
  // A caller booking their own interview doesn't need an email about it.
  if (!self) after(() => notifyAdminScheduled(created._id));
  return NextResponse.json({ id: String(created._id), caller: caller.name, emailed: !self });
});
