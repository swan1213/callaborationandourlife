import { after, NextResponse } from "next/server";
import { canManageProfile, canRequestInterviews, handler, HttpError, requireUser } from "@/lib/auth";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { User } from "@/lib/models/User";
import { getSettings } from "@/lib/models/Settings";
import { oid } from "@/lib/query";
import { chainInfo, interviewVisibility, notifyAccepted, notifyAdminScheduled, notifyCancelled, notifyNewRequest, notifyOpen, notifyReported, roleKey } from "@/lib/interviews";
import { Application } from "@/lib/models/Application";
import { companyKey } from "@/lib/company";
import { isValidTimeZone } from "@/lib/tz";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const user = await requireUser();
  if (user.role === "bidder" && !canRequestInterviews(user)) throw new HttpError(403, "Interview requests are not enabled for your account");
  const r = await InterviewRequest.findOne({ $and: [{ _id: oid(id) }, interviewVisibility(user)] });
  if (!r) throw new HttpError(404, "Interview request not found");
  return { user, r };
}

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const { r } = await load((await params).id);
  await r.populate([
    { path: "profile", select: "label fullName" },
    { path: "requestedBy", select: "name email" },
    { path: "caller", select: "name email" },
    { path: "requestedCaller", select: "name" },
    { path: "application", select: "company jobTitle jobUrl" },
  ]);
  // The other interviews of this profile + company + role stay visible here (with their results and feedback).
  const history = await InterviewRequest.find({
    _id: { $ne: r._id },
    profile: r.profile,
    companyKey: r.companyKey,
    roleKey: r.roleKey,
    deletedAt: null,
    status: { $ne: "cancelled" },
  })
    .select("step status scheduledAt windowStart caller report company jobTitle")
    .populate("caller", "name")
    .sort({ step: 1, createdAt: 1 })
    .lean();
  return NextResponse.json({ request: r.toObject(), history });
});

/**
 * DELETE { reason? } — admin: delete an interview (scheduled or a request). It disappears everywhere but is kept:
 * admins can list deleted interviews (Deleted filter) and restore them.
 * If a caller still had it (waiting or scheduled), they are emailed that it was cancelled.
 */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const { user, r } = await load((await params).id);
  if (user.role !== "admin") throw new HttpError(403, "Only admins can delete interviews");
  if (r.deletedAt) throw new HttpError(400, "Already deleted");
  const b = await req.json().catch(() => ({}));
  const reason = String(b?.reason ?? "").trim().slice(0, 1000);
  const tellCaller = r.caller && ["pending", "scheduled"].includes(r.status);
  const now = new Date();
  r.set({ statusBeforeDelete: r.status, status: "cancelled", deletedAt: now, deletedByName: user.name, deleteReason: reason });
  r.events.push({ at: now, by: user._id, byName: user.name, action: "deleted", note: reason });
  await r.save();
  if (tellCaller) after(() => notifyCancelled(r._id, r.caller!, user.name, reason || "Removed by an admin"));
  return NextResponse.json({ ok: true, company: r.company });
});

/** Feedback fields of a report: feedback text, interviewer name and caller ID (required when the interview took place). */
function readFeedback(b: Record<string, unknown>, held: boolean) {
  const summary = String(b.summary ?? "").trim().slice(0, 4000);
  const interviewerName = String(b.interviewerName ?? "").trim().slice(0, 200);
  const interviewerCallerId = String(b.interviewerCallerId ?? "").trim().slice(0, 50);
  if (held && !interviewerName) throw new HttpError(400, "Enter the interviewer's name");
  if (held && !summary) throw new HttpError(400, "Write your feedback on the interview");
  if (interviewerCallerId && !/^[+\d][\d\s().\-x#*]{2,49}$/i.test(interviewerCallerId))
    throw new HttpError(400, "The caller ID should be a phone number, e.g. +1 555 010 2030");
  return { summary, interviewerName, interviewerCallerId };
}

/** Caller-confirmed step: 1–10 and not already used by another interview of the same chain. */
async function parseStep(r: { _id: unknown; profile: unknown; company: string; jobTitle: string; step: number }, v: unknown) {
  if (v === undefined || v === null || v === "") return r.step;
  const step = Math.round(Number(v));
  if (!Number.isFinite(step) || step < 1 || step > 10) throw new HttpError(400, "Interview step must be between 1 and 10");
  if (step !== r.step) {
    const chain = await chainInfo(r.profile as string, r.company, r.jobTitle, r._id as string);
    if (chain.previous.some((p) => p.step === step)) throw new HttpError(400, `Step ${step} already exists for this role`);
  }
  return step;
}

const OUTCOMES = ["passed", "failed", "waiting", "no_show"];

function parseTime(v: unknown) {
  const d = new Date(String(v ?? ""));
  if (isNaN(d.getTime())) throw new HttpError(400, "Choose the interview date and time");
  if (d.getTime() < Date.now() - 5 * 60_000) throw new HttpError(400, "The interview time must be in the future");
  return d;
}

/**
 * PATCH { action, ... }
 * - accept { scheduledAt, durationMinutes?, callerNote? } — caller: schedule a request assigned to them, or claim an open one (first wins).
 * - reschedule { scheduledAt, durationMinutes?, callerNote? } — the scheduled caller (or an admin).
 * - transfer { reason } — the responsible caller can't do it: the request opens to every other caller (not for locked follow-ups).
 * - report { outcome, recordingUrl, summary?, step? } — after the interview: result + recording URL → completed.
 * - assign { callerId } — admin / managing user hands the request to a specific caller.
 * - cancel { reason? } — the requester, an admin or a managing user.
 * - note { text } — admin or the interview's caller: add a note (any status, including done).
 * - restore — admin: bring back a deleted interview (its caller is emailed if it is scheduled again).
 * - edit { scheduledAt, callerId, durationMinutes?, applicationId? | company + jobTitle, step?, callerNote?, notes?, timezone? }
 *   — admin: change any part of the schedule; the interview becomes scheduled with that caller and time.
 */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const id = (await params).id;
  const { user, r } = await load(id);
  const b = await req.json();
  const now = new Date();
  const mine = String(r.caller) === String(user._id);
  const event = (action: string, note = "") => ({ at: now, by: user._id, byName: user.name, action, note });
  const staff = user.role === "admin" || (user.role === "user" && canManageProfile(user, r.profile));

  switch (b.action) {
    case "accept": {
      if (user.role !== "caller") throw new HttpError(403, "Only callers can accept interview requests");
      const scheduledAt = parseTime(b.scheduledAt);
      const step = await parseStep(r, b.step);
      const duration = b.durationMinutes ? Math.min(480, Math.max(5, Math.round(Number(b.durationMinutes)))) : r.durationMinutes;
      const wasOpen = r.status === "open";
      // Atomic: the first caller to accept an open request gets it.
      const updated = await InterviewRequest.findOneAndUpdate(
        { _id: r._id, $or: [{ status: "pending", caller: user._id }, { status: "open" }] },
        {
          $set: { status: "scheduled", caller: user._id, scheduledAt, step, durationMinutes: duration, callerNote: String(b.callerNote ?? "").slice(0, 1000), acceptedAt: now },
          $push: { events: event("accepted", wasOpen ? "Took the open request" : "") },
        },
        { new: true }
      );
      if (!updated) {
        const fresh = await InterviewRequest.findById(r._id).populate("caller", "name").lean<{ status: string; caller?: { name: string } | null }>();
        if (fresh?.status === "scheduled") throw new HttpError(409, `Already accepted by ${fresh.caller?.name ?? "another caller"}`);
        if (fresh?.status === "cancelled") throw new HttpError(409, "This request was cancelled");
        throw new HttpError(409, "This request is assigned to another caller");
      }
      after(() => notifyAccepted(updated._id));
      return NextResponse.json({ ok: true });
    }

    case "reschedule": {
      if (r.status !== "scheduled" || (!mine && user.role !== "admin")) throw new HttpError(403, "Only the scheduled caller can reschedule this interview");
      r.scheduledAt = parseTime(b.scheduledAt);
      r.step = await parseStep(r, b.step);
      r.set({ reportReminderAt: undefined });
      if (b.durationMinutes) r.durationMinutes = Math.min(480, Math.max(5, Math.round(Number(b.durationMinutes))));
      if (typeof b.callerNote === "string") r.callerNote = b.callerNote.slice(0, 1000);
      if (r.events[0]?.action === "scheduled") r.windowStart = r.scheduledAt;
      r.events.push(event("rescheduled"));
      await r.save();
      after(() => Promise.all([notifyAccepted(r._id, true), mine ? null : notifyAdminScheduled(r._id, true)]));
      return NextResponse.json({ ok: true });
    }

    case "transfer": {
      if (user.role !== "caller" || !mine || !["pending", "scheduled"].includes(r.status))
        throw new HttpError(403, "Only the caller responsible for this request can transfer it");
      if (r.lockedCaller)
        throw new HttpError(403, `This is a step ${r.step} follow-up. The caller who conducted the earlier interview must conduct it, so it can't be transferred.`);
      const reason = String(b.reason ?? "").trim();
      if (reason.length < 3) throw new HttpError(400, "Enter the reason you can't conduct this interview");
      const hours = (await getSettings()).interviewScheduleHours ?? 3;
      r.set({
        status: "open",
        caller: null,
        scheduledAt: null,
        acceptedAt: undefined,
        // Other callers get a fresh scheduling window.
        scheduleBy: new Date(now.getTime() + hours * 3600_000),
        overdueNotifiedAt: undefined,
      });
      r.transfers.push({ from: user._id, fromName: user.name, reason: reason.slice(0, 1000), at: now });
      r.events.push(event("transferred", reason.slice(0, 1000)));
      await r.save();
      after(() => notifyOpen(r._id, { id: String(user._id), name: user.name }, reason));
      return NextResponse.json({ ok: true });
    }

    case "assign": {
      if (!staff) throw new HttpError(403, "Only admins and the profile's users can assign callers");
      if (r.status === "cancelled" || r.status === "completed") throw new HttpError(400, `This request is ${r.status}`);
      if (r.lockedCaller && user.role !== "admin")
        throw new HttpError(403, "Follow-up interviews stay with the caller who conducted the earlier interview. Only an admin can reassign them.");
      const caller = await User.findOne({ _id: oid(b.callerId, "caller"), role: "caller", status: "approved" }).select("_id name").lean();
      if (!caller) throw new HttpError(400, "Choose an active caller");
      const hours = (await getSettings()).interviewScheduleHours ?? 3;
      r.set({
        status: "pending",
        caller: caller._id,
        scheduledAt: null,
        acceptedAt: undefined,
        scheduleBy: new Date(now.getTime() + hours * 3600_000),
        overdueNotifiedAt: undefined,
        // An admin override releases the follow-up lock.
        lockedCaller: false,
      });
      r.events.push(event("assigned", `Assigned to ${caller.name}`));
      await r.save();
      after(() => notifyNewRequest(r._id));
      return NextResponse.json({ ok: true });
    }

    case "cancel": {
      const own = String(r.requestedBy) === String(user._id);
      if (!own && !staff) throw new HttpError(403, "Only the requester or an admin can cancel this request");
      if (r.status === "cancelled") throw new HttpError(400, "Already cancelled");
      if (r.status === "completed") throw new HttpError(400, "This interview already took place");
      const previousCaller = r.caller ?? null;
      const reason = String(b.reason ?? "").trim().slice(0, 1000);
      r.set({ status: "cancelled", cancelledAt: now, cancelReason: reason });
      r.events.push(event("cancelled", reason));
      await r.save();
      after(() => notifyCancelled(r._id, previousCaller, user.name, reason));
      return NextResponse.json({ ok: true });
    }

    case "report": {
      if (r.status !== "scheduled" || (!mine && user.role !== "admin")) throw new HttpError(403, "Only the caller who conducted this interview can report its result");
      if (!r.scheduledAt || r.scheduledAt.getTime() > now.getTime()) throw new HttpError(400, "You can report the result once the interview has started");
      const outcome = String(b.outcome ?? "");
      if (!OUTCOMES.includes(outcome)) throw new HttpError(400, "Choose the interview result");
      const recordingUrl = String(b.recordingUrl ?? "").trim();
      if (outcome !== "no_show") {
        if (!recordingUrl) throw new HttpError(400, "Enter the URL of the recorded video");
        try {
          if (!["http:", "https:"].includes(new URL(recordingUrl).protocol)) throw new Error();
        } catch {
          throw new HttpError(400, "The recording URL must start with http:// or https://");
        }
      }
      const fb = readFeedback(b, outcome !== "no_show");
      r.step = await parseStep(r, b.step);
      r.set({
        status: "completed",
        report: {
          outcome,
          recordingUrl: recordingUrl.slice(0, 2000),
          ...fb,
          reportedAt: now,
          reportedBy: user._id,
          reportedByName: user.name,
        },
      });
      r.events.push(event("reported", outcome));
      await r.save();
      after(() => notifyReported(r._id));
      return NextResponse.json({ ok: true });
    }

    case "feedback": {
      // After the interview: add or update the feedback and the interviewer's name / caller ID.
      if (!mine && user.role !== "admin") throw new HttpError(403, "Only the caller who conducted this interview or an admin can add feedback");
      if (r.status !== "completed" || !r.report?.outcome) throw new HttpError(400, "Report the interview result first");
      const fb = readFeedback(b, r.report.outcome !== "no_show");
      r.set({ "report.summary": fb.summary, "report.interviewerName": fb.interviewerName, "report.interviewerCallerId": fb.interviewerCallerId, "report.feedbackUpdatedAt": now });
      r.events.push(event("feedback", fb.interviewerName ? `Interviewer: ${fb.interviewerName}` : ""));
      await r.save();
      return NextResponse.json({ ok: true, report: r.report });
    }

    case "restore": {
      if (user.role !== "admin") throw new HttpError(403, "Only admins can restore interviews");
      if (!r.deletedAt) throw new HttpError(400, "This interview isn't deleted");
      const back = (r.statusBeforeDelete || "pending") as typeof r.status;
      if (back !== "cancelled") {
        const chain = await chainInfo(r.profile, r.company, r.jobTitle, r._id);
        if (chain.previous.some((p) => p.step === r.step))
          throw new HttpError(409, `Step ${r.step} for this role has been used by another interview since. Edit or delete that one first.`);
      }
      r.set({ status: back, deletedAt: null, deletedByName: "", deleteReason: "", statusBeforeDelete: "" });
      r.events.push(event("restored"));
      await r.save();
      if (back === "scheduled" && r.scheduledAt && r.scheduledAt.getTime() > Date.now()) after(() => notifyAdminScheduled(r._id, true));
      return NextResponse.json({ ok: true, status: back });
    }

    case "note": {
      if (user.role !== "admin" && !mine) throw new HttpError(403, "Only admins and this interview's caller can add notes");
      const text = String(b.text ?? "").trim().slice(0, 2000);
      if (!text) throw new HttpError(400, "Write a note");
      r.comments.push({ at: now, by: user._id, byName: user.name, role: user.role, text });
      await r.save();
      return NextResponse.json({ ok: true, comments: r.comments });
    }

    case "edit": {
      if (user.role !== "admin") throw new HttpError(403, "Only admins can edit a schedule");
      if (r.status === "cancelled" || r.status === "completed") throw new HttpError(400, `This interview is ${r.status}`);

      const scheduledAt = new Date(b.scheduledAt);
      if (isNaN(scheduledAt.getTime())) throw new HttpError(400, "Enter the interview date and time");
      const timeChanged = !r.scheduledAt || r.scheduledAt.getTime() !== scheduledAt.getTime();
      if (timeChanged && scheduledAt.getTime() < Date.now() - 5 * 60_000) throw new HttpError(400, "The interview time must be in the future");
      const duration = Math.round(Number(b.durationMinutes) || r.durationMinutes || 60);
      if (duration < 5 || duration > 480) throw new HttpError(400, "Interview length must be between 5 and 480 minutes");

      let application = b.applicationId === undefined ? r.application : null;
      let company = String(b.company ?? r.company).trim();
      let jobTitle = String(b.jobTitle ?? r.jobTitle).trim();
      if (b.applicationId) {
        const app = await Application.findOne({ _id: oid(b.applicationId, "application"), profile: r.profile, status: "submitted" }).select("company jobTitle").lean();
        if (!app) throw new HttpError(400, "Choose a submitted application of this profile");
        application = app._id;
        company = app.company || company;
        jobTitle = app.jobTitle || jobTitle;
      }
      company = company.slice(0, 200);
      jobTitle = jobTitle.slice(0, 200);
      if (!company) throw new HttpError(400, "Enter the company");
      if (!jobTitle) throw new HttpError(400, "Enter the role");

      const chain = await chainInfo(r.profile, company, jobTitle, r._id);
      const step = Math.round(Number(b.step) || r.step || chain.nextStep);
      if (step < 1 || step > 10) throw new HttpError(400, "Interview step must be between 1 and 10");
      const taken = chain.previous.find((p) => p.step === step);
      if (taken) throw new HttpError(400, `Step ${step} already exists for this role (${taken.status}).`);

      const caller = await User.findOne({ _id: oid(b.callerId, "caller"), role: "caller", status: "approved" }).select("_id name").lean();
      if (!caller) throw new HttpError(400, "Choose an active caller");
      const previousCaller = r.caller ? String(r.caller) : null;
      const callerChanged = previousCaller !== String(caller._id);
      const directlyBooked = r.events[0]?.action === "scheduled";

      r.set({
        application,
        company,
        jobTitle,
        companyKey: companyKey(company),
        roleKey: roleKey(jobTitle),
        step,
        status: "scheduled",
        caller: caller._id,
        scheduledAt,
        durationMinutes: duration,
        callerNote: String(b.callerNote ?? r.callerNote ?? "").slice(0, 1000),
        notes: String(b.notes ?? r.notes ?? "").slice(0, 2000),
        acceptedAt: r.acceptedAt ?? now,
        lockedCaller: !!chain.lead?.active && chain.lead.id === String(caller._id),
        // A directly booked interview has no separate requested time: keep it in step with the schedule.
        ...(directlyBooked
          ? { windowStart: scheduledAt, mode: "exact", timezone: typeof b.timezone === "string" && isValidTimeZone(b.timezone) ? b.timezone : r.timezone }
          : {}),
      });
      const changes = [timeChanged && "time", callerChanged && `caller → ${caller.name}`].filter(Boolean).join(", ");
      r.events.push(event("edited", changes || "details"));
      await r.save();
      after(async () => {
        await Promise.all([
          callerChanged && previousCaller ? notifyCancelled(r._id, previousCaller, user.name, `Moved to ${caller.name}`) : null,
          notifyAdminScheduled(r._id, !callerChanged),
          // Someone else asked for this interview (e.g. a bidder): tell them about the new time.
          timeChanged && !directlyBooked ? notifyAccepted(r._id, true) : null,
        ]);
      });
      return NextResponse.json({ ok: true, caller: caller.name });
    }

    default:
      throw new HttpError(400, "Unknown action");
  }
});
