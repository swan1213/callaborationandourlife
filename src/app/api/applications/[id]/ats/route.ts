import { NextResponse } from "next/server";
import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { Profile } from "@/lib/models/Profile";
import type { ResumeContent } from "@/lib/generate";
import { runAtsReview } from "@/lib/atsReviewRun";
import { estimateCost, resolveOpenAI } from "@/lib/openaiKeys";
import { oid } from "@/lib/query";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST → { review } (lib/atsReview.ts AtsReview)
 * AI ATS review of this application's resume against its job description, with the profile's OpenAI key. The review is
 * saved on the application (running it again replaces it) and its tokens are added to the application's usage.
 */
export const POST = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const app = await Application.findById(oid((await params).id));
  const isOwner = app && String(app.user) === String(user._id) && !app.deletedByUser;
  const isRep = app && user.role === "user" && canManageProfile(user, app.profile);
  if (!app || (!isOwner && !isRep && user.role !== "admin")) throw new HttpError(404, "Application not found");
  const resume = app.resume as ResumeContent | null;
  if (!resume) throw new HttpError(400, "Generate the application first: the review scores its resume.");
  if (!app.jobDescription?.trim()) throw new HttpError(400, "Add the job description first: the review scores the resume against it.");
  const profile = await Profile.findById(app.profile).lean();
  if (!profile) throw new HttpError(404, "This application's profile was deleted");

  const openai = await resolveOpenAI(profile);
  const { review, promptTokens, completionTokens } = await runAtsReview(openai, {
    resume,
    jobDescription: app.jobDescription,
    jobTitle: app.jobTitle,
    company: app.company,
  });
  await Application.updateOne(
    { _id: app._id },
    {
      $set: { atsReview: review },
      $inc: { "usage.promptTokens": promptTokens, "usage.completionTokens": completionTokens, "usage.costUsd": estimateCost(openai, promptTokens, completionTokens) },
    }
  );
  return NextResponse.json({ review });
});
