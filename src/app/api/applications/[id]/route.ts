import { after, NextResponse } from "next/server";
import { processSubmissionMilestones } from "@/lib/notifications";
import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import "@/lib/models/Profile";
import { User } from "@/lib/models/User";
import { destroyAsset, isOurCloudinaryUrl, SCREENSHOT_FOLDER } from "@/lib/cloudinary";
import { oid } from "@/lib/query";
import { withReadFlags } from "@/lib/postingReads";
import { markViewed } from "@/lib/appViews";
import { isUnknownCompany, isUntitledRole, missingJobInfo } from "@/lib/jobInfo";
import { companyKey } from "@/lib/company";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const user = await requireUser();
  const app = await Application.findById(oid(id));
  const isOwner = app && String(app.user) === String(user._id) && !app.deletedByUser;
  const isRep = app && user.role === "user" && canManageProfile(user, app.profile);
  if (!app || (!isOwner && !isRep && user.role !== "admin")) throw new HttpError(404, "Application not found");
  return { user, app, isOwner: !!isOwner };
}

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const { user, app } = await load((await params).id);
  await app.populate([
    { path: "profile", select: "label fullName" },
    { path: "user", select: "name email" },
  ]);
  await markViewed(user._id, app._id);
  const [application] = await withReadFlags(user._id, [app.toObject()]);
  // quickSubmit: Submit works without a screenshot (trusted owner). Named neutrally: the bidder never sees "trusted".
  const owner = await User.findById(app.user).select("role trusted").lean();
  return NextResponse.json({ application, quickSubmit: owner?.role === "bidder" && !!owner.trusted });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { user, app, isOwner } = await load((await params).id);
  if (!isOwner && user.role !== "admin") throw new HttpError(403, "Only the bidder or an admin can change this application");
  const body = await req.json();

  if (body.addScreenshot) {
    const { url, publicId } = body.addScreenshot;
    if (!url || !isOurCloudinaryUrl(url)) throw new HttpError(400, "Invalid screenshot URL");
    // Screenshots must come from the bidder's own upload folder (see /api/cloudinary/sign).
    const folder = `${SCREENSHOT_FOLDER}/${app.user}/`;
    if (typeof publicId !== "string" || !publicId.startsWith(folder) || !url.includes(`/${publicId}`))
      throw new HttpError(400, "Screenshot must be uploaded by the bidder of this application");
    if (app.screenshots.length >= 10) throw new HttpError(400, "Maximum 10 screenshots per application");
    app.screenshots.push({ url, publicId, uploadedAt: new Date() });
  }
  if (body.removeScreenshot) {
    if (app.paid && app.screenshots.length <= 1) throw new HttpError(400, "This application is marked as paid, so its last screenshot can't be removed");
    const shot = app.screenshots.find((s) => s.publicId === body.removeScreenshot);
    if (shot) {
      app.screenshots.pull(shot);
      if (shot.publicId) await destroyAsset(shot.publicId);
    }
    if (!app.screenshots.length && app.status === "submitted") {
      app.status = "generated";
      app.submittedAt = undefined;
      app.fee = 0; // no longer submitted → not charged
      app.paid = false;
      app.paidAt = undefined;
    }
  }
  // Company / role: bidders may only fill in a missing one ("Unknown company" / "Untitled role"); admins may change either.
  if (body.company !== undefined || body.jobTitle !== undefined) {
    if (app.status === "not_generated") throw new HttpError(400, "Generate the application first");
    const admin = user.role === "admin";
    if (body.company !== undefined) {
      const v = String(body.company ?? "").trim().slice(0, 200);
      if (v !== app.company) {
        if (!admin && !isUnknownCompany(app.company)) throw new HttpError(403, "The company is already set and can't be changed");
        if (isUnknownCompany(v)) throw new HttpError(400, "Enter the company name");
        app.company = v;
        app.companyKey = companyKey(v);
      }
    }
    if (body.jobTitle !== undefined) {
      const v = String(body.jobTitle ?? "").trim().slice(0, 200);
      if (v !== app.jobTitle) {
        if (!admin && !isUntitledRole(app.jobTitle)) throw new HttpError(403, "The role is already set and can't be changed");
        if (isUntitledRole(v)) throw new HttpError(400, "Enter the role");
        app.jobTitle = v;
      }
    }
  }
  if (typeof body.notes === "string") app.notes = body.notes.slice(0, 2000);
  if (typeof body.coverLetter === "string") app.coverLetter = body.coverLetter;
  let justSubmitted = false;
  if (body.status === "submitted") {
    if (app.status === "not_generated") throw new HttpError(400, "Generate the application first (add the job description)");
    // A bid needs a real company and role (reports, billing, same-company cooldown).
    const missing = app.status !== "submitted" ? missingJobInfo(app) : "";
    if (missing) throw new HttpError(400, missing);
    // Trusted bidders (admin setting) may submit without a screenshot; everyone else needs one.
    if (!app.screenshots.length) {
      const owner = await User.findById(app.user).select("role trusted").lean();
      if (!(owner?.role === "bidder" && owner.trusted)) throw new HttpError(400, "Upload at least one screenshot confirming the submission first");
    }
    // Set the submission time only once (extra screenshots re-send "submitted").
    if (app.status !== "submitted") {
      app.status = "submitted";
      app.submittedAt = body.submittedAt ? new Date(body.submittedAt) : new Date();
      // Fees are charged on submission, at the bidder's current rate (only bidders are charged).
      const owner = await User.findById(app.user).select("role feePerApplication").lean();
      app.fee = owner?.role === "bidder" ? owner.feePerApplication ?? 0 : 0;
      justSubmitted = true;
    }
  } else if (body.status === "generated" && app.status !== "not_generated") {
    if (app.paid) throw new HttpError(400, "This application is marked as paid and can't be un-submitted");
    app.status = "generated";
    app.submittedAt = undefined;
    app.fee = 0;
    app.paid = false;
    app.paidAt = undefined;
  }
  await app.save();
  // Milestone emails (1st / 50th / 100th submitted application) are sent after the response.
  if (justSubmitted) after(() => processSubmissionMilestones(app._id).catch((e) => console.error("milestones failed", e)));
  return NextResponse.json({ application: app.toObject() });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const { user, app, isOwner } = await load((await params).id);
  if (!isOwner && user.role !== "admin") throw new HttpError(403, "Only the bidder or an admin can delete this application");
  if (user.role === "bidder") throw new HttpError(403, "Bidders can't delete applications. Ask an admin if one should be removed.");
  if (app.paid) throw new HttpError(400, "Paid applications can't be deleted");
  if (user.role === "admin") {
    await Promise.all(app.screenshots.map((s) => s.publicId && destroyAsset(s.publicId)));
    await app.deleteOne();
  } else {
    // Keep the record for billing/history; hide it from the user.
    app.deletedByUser = true;
    await app.save();
  }
  return NextResponse.json({ ok: true });
});
