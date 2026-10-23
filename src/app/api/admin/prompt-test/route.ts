import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import { getSettings } from "@/lib/models/Settings";
import { scrapeJob } from "@/lib/scrape";
import { generateApplication } from "@/lib/generate";
import { DEFAULT_RESUME_PROMPT } from "@/lib/resumePrompt";
import { estimateCost, recordKeyResult, resolveOpenAI } from "@/lib/openaiKeys";
import { oid } from "@/lib/query";

export const maxDuration = 60;

/**
 * Admin: try a resume prompt without saving anything.
 * POST { profileId, jobUrl? | jobText?, promptTemplate?, promptInstructions? }
 * - promptTemplate / promptInstructions: the draft to test; when left out, the saved Settings values are used
 *   (exactly what real generation uses).
 * Returns the generated resume, cover letter and job description, plus tokens and cost. No application is created,
 * no fee is charged and the profile's quota and same-company cooldown don't apply.
 */
export const POST = handler(async (req: Request) => {
  await requireUser("admin");
  const b = await req.json();
  const profile = await Profile.findById(oid(b.profileId, "profile"));
  if (!profile) throw new HttpError(404, "Profile not found");

  const jobUrl = String(b.jobUrl ?? "").trim();
  const jobText = String(b.jobText ?? "").trim();
  if (!jobUrl && !jobText) throw new HttpError(400, "Enter a job URL or paste the job description");
  if (jobText && jobText.length < 100) throw new HttpError(400, "Pasted job description is too short");

  const settings = await getSettings();
  const promptTemplate = typeof b.promptTemplate === "string" ? b.promptTemplate : settings.resumePromptTemplate;
  const promptInstructions = typeof b.promptInstructions === "string" ? b.promptInstructions : settings.promptInstructions;

  const job = jobText ? { text: jobText.slice(0, 20000), title: "", company: "", location: "" } : await scrapeJob(jobUrl);
  const openai = await resolveOpenAI(profile);
  const started = Date.now();
  let result;
  try {
    result = await generateApplication(openai, profile.toObject(), { ...job, url: jobUrl }, promptInstructions, promptTemplate, settings.atsTargetScore ?? 85);
  } catch (e) {
    if (e instanceof HttpError && e.status === 502) await recordKeyResult(openai.apiKeyId, e.message);
    throw e;
  }
  await recordKeyResult(openai.apiKeyId);
  const usingDefault = !promptTemplate.trim() || promptTemplate.trim() === DEFAULT_RESUME_PROMPT.trim();
  return NextResponse.json({
    result,
    // The profile's document designs, so the preview matches what a real generation would download.
    designs: { resume: profile.resumeDesign ?? "", coverLetter: profile.coverLetterDesign ?? "" },
    meta: {
      model: result.usage.model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      costUsd: estimateCost(openai, result.usage.promptTokens, result.usage.completionTokens),
      seconds: Math.round((Date.now() - started) / 100) / 10,
      prompt: usingDefault ? "default" : "custom",
    },
  });
});
