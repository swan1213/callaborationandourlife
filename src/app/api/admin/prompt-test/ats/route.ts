import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import type { ResumeContent } from "@/lib/generate";
import { runAtsReview } from "@/lib/atsReviewRun";
import { estimateCost, resolveOpenAI } from "@/lib/openaiKeys";
import { oid } from "@/lib/query";

export const maxDuration = 60;

/**
 * Admin: AI ATS review of a Test Generate Resume result, without saving anything.
 * POST { profileId, resume, jobDescription, jobTitle?, company? } → { review, costUsd }
 * Uses the profile's OpenAI key, like the test generation itself.
 */
export const POST = handler(async (req: Request) => {
  await requireUser("admin");
  const b = await req.json();
  const profile = await Profile.findById(oid(b.profileId, "profile")).lean();
  if (!profile) throw new HttpError(404, "Profile not found");
  const resume = b.resume as ResumeContent | null;
  if (!resume || typeof resume !== "object" || !Array.isArray(resume.experience)) throw new HttpError(400, "Generate a test resume first");
  const jobDescription = String(b.jobDescription ?? "").trim();
  if (!jobDescription) throw new HttpError(400, "The test result has no job description to score against");

  const openai = await resolveOpenAI(profile);
  const { review, promptTokens, completionTokens } = await runAtsReview(openai, {
    resume,
    jobDescription,
    jobTitle: String(b.jobTitle ?? ""),
    company: String(b.company ?? ""),
  });
  return NextResponse.json({ review, costUsd: estimateCost(openai, promptTokens, completionTokens) });
});
