import { NextResponse } from "next/server";
import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { Profile } from "@/lib/models/Profile";
import { getSettings } from "@/lib/models/Settings";
import { scrapeJob } from "@/lib/scrape";
import { generateApplication } from "@/lib/generate";
import { companyKey } from "@/lib/company";
import { tidyJobText } from "@/lib/jobText";
import { estimateCost, recordKeyResult, resolveOpenAI } from "@/lib/openaiKeys";
import { oid } from "@/lib/query";
import { retryOnDrop } from "@/lib/db";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST → { id, company, jobTitle }
 * Writes a generated (not yet submitted) application's resume and cover letter again, in place: same application,
 * date, notes and screenshots. The posting is read again from its link (the scraper may read it better now); when
 * that fails, the saved job description is used. Not a new bid, so no quota, duplicate or same-company check; its
 * tokens are added to the application's usage.
 */
export const POST = handler(async (_req: Request, { params }: Ctx) => {
  const started = Date.now();
  const user = await requireUser();
  if (user.role === "caller") throw new HttpError(403, "Callers cannot generate applications");
  const app = await Application.findById(oid((await params).id));
  const isOwner = app && String(app.user) === String(user._id) && !app.deletedByUser;
  const isRep = app && user.role === "user" && canManageProfile(user, app.profile);
  if (!app || (!isOwner && !isRep && user.role !== "admin")) throw new HttpError(404, "Application not found");
  if (app.status === "not_generated") throw new HttpError(400, "This application hasn't been generated yet: paste the job description to generate it.");
  if (app.status === "submitted" || app.paid) throw new HttpError(400, "This application was already submitted, so its documents stay as they were sent.");

  const profile = await Profile.findById(app.profile);
  if (!profile || !profile.active) throw new HttpError(404, "This application's profile was deleted or is inactive");

  const saved = {
    text: tidyJobText(app.jobDescription || ""),
    title: app.jobTitle || "",
    titleTrusted: !!app.jobTitle,
    company: app.company || "",
    location: app.jobLocation || "",
  };
  let job = saved;
  if (app.jobUrl) {
    const fresh = await scrapeJob(app.jobUrl).catch(() => null);
    // A closed posting or a page that now reads worse than before keeps the saved text.
    if (fresh && fresh.text.length >= Math.min(saved.text.length * 0.6, 1500))
      job = { text: fresh.text, title: fresh.title || saved.title, titleTrusted: !!fresh.titleTrusted || saved.titleTrusted, company: fresh.company || saved.company, location: fresh.location || saved.location };
  }
  if (job.text.length < 100) throw new HttpError(400, "There's no job description to generate from. Open the posting and generate it again from the Generate page.");

  const settings = await getSettings();
  const openai = await resolveOpenAI(profile);
  let result;
  try {
    result = await generateApplication(openai, profile.toObject(), { ...job, url: app.jobUrl || "" }, settings.promptInstructions, settings.resumePromptTemplate, settings.atsTargetScore ?? 85, started);
  } catch (e) {
    if (e instanceof HttpError && e.status === 502) await recordKeyResult(openai.apiKeyId, e.message);
    throw e;
  }
  await recordKeyResult(openai.apiKeyId);

  const prev = app.usage ?? { promptTokens: 0, completionTokens: 0, costUsd: 0 };
  app.set({
    company: result.company || app.company,
    companyKey: companyKey(result.company || app.company || ""),
    jobTitle: result.jobTitle || app.jobTitle,
    jobLocation: result.jobLocation || app.jobLocation,
    jobDescription: result.jobDescription,
    resume: result.resume,
    coverLetter: result.coverLetter,
    resumeDesign: profile.resumeDesign ?? "",
    coverLetterDesign: profile.coverLetterDesign ?? "",
    // The AI review was of the old resume.
    atsReview: null,
    generationError: "",
    usage: {
      model: result.usage.model,
      apiKey: openai.apiKeyId,
      promptTokens: (prev.promptTokens ?? 0) + result.usage.promptTokens,
      completionTokens: (prev.completionTokens ?? 0) + result.usage.completionTokens,
      costUsd: (prev.costUsd ?? 0) + estimateCost(openai, result.usage.promptTokens, result.usage.completionTokens),
    },
  });
  await retryOnDrop(() => app.save());
  return NextResponse.json({ id: String(app._id), company: app.company, jobTitle: app.jobTitle });
});
