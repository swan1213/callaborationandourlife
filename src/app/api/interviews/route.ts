import { after, NextResponse } from "next/server";
import { canManageProfile, canRequestInterviews, handler, HttpError, requireUser } from "@/lib/auth";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { Profile } from "@/lib/models/Profile";
import { User } from "@/lib/models/User";
import { Application } from "@/lib/models/Application";
import { getSettings } from "@/lib/models/Settings";
import { isOurCloudinaryUrl, SCREENSHOT_FOLDER } from "@/lib/cloudinary";
import { oid } from "@/lib/query";
import { isValidTimeZone } from "@/lib/tz";
import { chainInfo, interviewVisibility, maybeRunInterviewSweep, notifyNewRequest, roleKey } from "@/lib/interviews";
import { companyKey } from "@/lib/company";

const MAX_LIST = 1000;

/**
 * GET ?view=mine|open|all &status= &profile= &caller= &from= &to= &deleted=include|only (admins)
 * - from/to select requests scheduled in (or, while unscheduled, requested for) that range — used by the calendars.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  if (user.role === "bidder" && !canRequestInterviews(user)) throw new HttpError(403, "Interview requests are not enabled for your account");
  after(maybeRunInterviewSweep);
  const sp = new URL(req.url).searchParams;
  const and: Record<string, unknown>[] = [interviewVisibility(user)];

  const deleted = user.role === "admin" ? sp.get("deleted") : null;
  if (deleted === "only") and.push({ deletedAt: { $ne: null } });
  else if (deleted !== "include") and.push({ deletedAt: null });

  const view = sp.get("view");
  if (view === "mine") and.push(user.role === "caller" ? { caller: user._id } : { requestedBy: user._id });
  if (view === "open") and.push({ status: "open" });
  const status = sp.get("status");
  if (status) and.push({ status: { $in: status.split(",") } });
  if (sp.get("profile")) and.push({ profile: oid(sp.get("profile"), "profile") });
  if (sp.get("caller")) and.push({ caller: oid(sp.get("caller"), "caller") });
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;
  if (from || to) {
    const range = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
    and.push({ $or: [{ scheduledAt: range }, { scheduledAt: null, windowStart: range }] });
  }

  const items = await InterviewRequest.find({ $and: and })
    .populate("profile", "label fullName")
    .populate("requestedBy", "name email")
    .populate("caller", "name email")
    .populate("requestedCaller", "name")
    .populate("application", "company jobTitle jobUrl status")
    .sort({ createdAt: -1 })
    .limit(MAX_LIST)
    .lean();

  // Badge counts for the caller's tabs.
  const counts =
    user.role === "caller"
      ? {
          pending: await InterviewRequest.countDocuments({ caller: user._id, status: "pending" }),
          open: await InterviewRequest.countDocuments({ status: "open" }),
          upcoming: await InterviewRequest.countDocuments({ caller: user._id, status: "scheduled", scheduledAt: { $gte: new Date() } }),
          reportDue: await InterviewRequest.countDocuments({ caller: user._id, status: "scheduled", scheduledAt: { $lt: new Date() } }),
        }
      : undefined;
  return NextResponse.json({ items, counts });
});

/** A bidder (or staff) asks one of the profile's callers to conduct an interview. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  if (user.role === "caller") throw new HttpError(403, "Callers cannot request interviews");
  if (user.role === "bidder" && !canRequestInterviews(user)) throw new HttpError(403, "Interview requests are not enabled for your account");
  const b = await req.json();

  const profileId = oid(b.profileId, "profile");
  const allowed =
    user.assignedProfiles.some((p) => String(p) === String(profileId)) || (user.role !== "bidder" && canManageProfile(user, profileId));
  if (!allowed) throw new HttpError(403, "This profile is not assigned to you");
  const profile = await Profile.findById(profileId).select("label active").lean();
  if (!profile || !profile.active) throw new HttpError(404, "Profile not found or inactive");

  // When: one start time, or a window.
  const mode = b.mode === "range" ? "range" : "exact";
  const windowStart = new Date(b.windowStart);
  const windowEnd = mode === "range" ? new Date(b.windowEnd) : null;
  if (isNaN(windowStart.getTime())) throw new HttpError(400, "Enter the interview date and time");
  if (windowStart.getTime() < Date.now() - 5 * 60_000) throw new HttpError(400, "The interview time must be in the future");
  if (windowEnd) {
    if (isNaN(windowEnd.getTime()) || windowEnd <= windowStart) throw new HttpError(400, "The end of the range must be after its start");
    if (windowEnd.getTime() - windowStart.getTime() > 31 * 86400_000) throw new HttpError(400, "The date range can span at most 31 days");
  }
  const duration = Math.round(Number(b.durationMinutes) || 60);
  if (duration < 5 || duration > 480) throw new HttpError(400, "Interview length must be between 5 and 480 minutes");

  // Screenshot(s) of the interview email, uploaded by this user (see /api/cloudinary/sign).
  const folder = `${SCREENSHOT_FOLDER}/${user._id}/`;
  const screenshots = ((b.screenshots as { url?: string; publicId?: string }[]) ?? []).map((s) => ({ url: String(s?.url ?? ""), publicId: String(s?.publicId ?? "") }));
  if (!screenshots.length) throw new HttpError(400, "Attach a screenshot of the interview email");
  if (screenshots.length > 5) throw new HttpError(400, "Attach at most 5 screenshots");
  if (screenshots.some((s) => !isOurCloudinaryUrl(s.url) || !s.publicId.startsWith(folder) || !s.url.includes(`/${s.publicId}`)))
    throw new HttpError(400, "Invalid screenshot");

  // Required: the submitted application (resume + job posting) this interview is for.
  // Bidders pick their own; admins / managing users may pick any application of the profile.
  if (!b.applicationId) throw new HttpError(400, "Choose the submitted application this interview is for");
  const app = await Application.findOne({
    _id: oid(b.applicationId, "application"),
    profile: profileId,
    status: "submitted",
    ...(user.role === "bidder" ? { user: user._id, deletedByUser: false } : {}),
  })
    .select("company jobTitle")
    .lean();
  if (!app) throw new HttpError(400, "Choose one of your submitted applications for this profile");
  const application = app._id;
  const company = (app.company || String(b.company ?? "")).trim().slice(0, 200);
  const jobTitle = (app.jobTitle || String(b.jobTitle ?? "")).trim().slice(0, 200);
  if (!company) throw new HttpError(400, "Enter the company");
  if (!jobTitle) throw new HttpError(400, "Enter the role");

  // Initial or follow-up? Earlier interviews for this profile + company + role decide.
  const chain = await chainInfo(profileId, company, jobTitle);
  const step = Math.round(Number(b.step) || chain.nextStep);
  if (step < 1 || step > 10) throw new HttpError(400, "Interview step must be between 1 and 10");
  const taken = chain.previous.find((p) => p.step === step);
  if (taken) throw new HttpError(400, `Step ${step} already exists for this role (${taken.status}). The next step is ${chain.nextStep}.`);
  // A follow-up goes to the caller who conducted the earlier interview; they can't transfer it.
  const locked = !!chain.lead?.active;
  const callerQuery: Record<string, unknown> = locked
    ? { _id: oid(chain.lead!.id), role: "caller", status: "approved" }
    : { _id: oid(b.callerId, "caller"), role: "caller", status: "approved", assignedProfiles: profileId };
  const caller = await User.findOne(callerQuery).select("_id name").lean();
  if (!caller) throw new HttpError(400, "Choose a caller assigned to this profile");

  const settings = await getSettings();
  const now = new Date();
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
    mode,
    windowStart,
    windowEnd,
    timezone: typeof b.timezone === "string" && isValidTimeZone(b.timezone) ? b.timezone : "UTC",
    durationMinutes: duration,
    notes: String(b.notes ?? "").slice(0, 2000),
    screenshots,
    status: "pending",
    caller: caller._id,
    requestedCaller: caller._id,
    scheduleBy: new Date(now.getTime() + (settings.interviewScheduleHours ?? 3) * 3600_000),
    events: [
      {
        at: now,
        by: user._id,
        byName: user.name,
        action: "requested",
        note: locked ? `Step ${step} follow-up · must be conducted by ${caller.name}` : `Step ${step} · sent to ${caller.name}`,
      },
    ],
  });
  after(() => notifyNewRequest(created._id));
  return NextResponse.json({ id: String(created._id) });
});
