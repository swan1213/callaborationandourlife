import { NextResponse } from "next/server";
import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import { Application } from "@/lib/models/Application";
import { getSettings } from "@/lib/models/Settings";
import { pastedJob, scrapeJob, type ScrapedJob } from "@/lib/scrape";
import { generateApplication } from "@/lib/generate";
import { estimateCost, recordKeyResult, resolveOpenAI } from "@/lib/openaiKeys";
import { monthStart, oid } from "@/lib/query";
import { companyKey } from "@/lib/company";
import { cooldownRule, findCooldownHit, rejectForCooldown } from "@/lib/cooldown";
import { findDuplicate } from "@/lib/duplicates";
import { urlKey } from "@/lib/links";
import { markPostingRead } from "@/lib/postingReads";
import { manualLimitMessage, manualQueue } from "@/lib/manualQueue";
import { retryOnDrop } from "@/lib/db";

export const maxDuration = 60;

/**
 * POST { profileId, jobUrl?, jobText?, force?, keepOnScrapeFail?, applicationId? }
 * - keepOnScrapeFail (single URL / multi-URL import): track the attempt; if scraping or the AI step fails (or the request is cut off),
 *   it stays in the history as a "not_generated" application instead of being lost.
 * - applicationId: generate an existing "not_generated" application (usually with a pasted jobText).
 */
export const POST = handler(async (req: Request) => {
  const requestStarted = Date.now();
  const user = await requireUser();
  if (user.role === "caller") throw new HttpError(403, "Callers cannot generate applications");
  const body = await req.json();
  const manualText = String(body.jobText || "").trim();
  if (manualText && manualText.length < 100) throw new HttpError(400, "Pasted job description is too short");

  // Existing "not generated" application to fill in (by id, or found below by URL).
  let target = body.applicationId ? await Application.findById(oid(body.applicationId, "application")) : null;
  if (body.applicationId) {
    if (!target || (String(target.user) !== String(user._id) && user.role !== "admin")) throw new HttpError(404, "Application not found");
    if (target.status !== "not_generated") throw new HttpError(400, "This application has already been generated");
  }

  const profileId = target ? target.profile : oid(body.profileId, "profile");
  const jobUrl = target ? target.jobUrl || "" : String(body.jobUrl || "").trim();
  if (!jobUrl && !manualText) throw new HttpError(400, "Enter a job URL or paste the job description");

  const assigned =
    user.assignedProfiles.some((p) => String(p) === String(profileId)) ||
    (user.role !== "bidder" && canManageProfile(user, profileId)) ||
    (!!target && user.role === "admin");
  if (!assigned) throw new HttpError(403, "This profile is not assigned to you");

  const profile = await Profile.findById(profileId);
  if (!profile || !profile.active) throw new HttpError(404, "Profile not found or inactive");

  if (profile.monthlyQuota > 0) {
    const used = await Application.countDocuments({ profile: profile._id, createdAt: { $gte: monthStart() }, status: { $ne: "not_generated" } });
    if (used >= profile.monthlyQuota)
      throw new HttpError(429, `Monthly quota reached for this profile (${used}/${profile.monthlyQuota}). Contact an administrator.`);
  }

  if (jobUrl && !target && !body.force) {
    // Same posting however it was pasted (tracking parameters, www, /apply…): lib/links.ts urlKey.
    const dup = await findDuplicate(user._id, profile._id, jobUrl);
    if (dup?.status === "not_generated") target = await Application.findById(dup._id); // retry the saved placeholder
    else if (dup)
      return NextResponse.json(
        {
          error: `You already generated an application for this job with this profile${dup.company ? ` (${[dup.company, dup.jobTitle].filter(Boolean).join(" · ")})` : ""}.`,
          duplicateId: String(dup._id),
        },
        { status: 409 }
      );
  }

  // Too many postings already waiting for a manual paste: no new automatic (URL) generation until some are handled.
  // Pasting a description (manual) and retrying an existing not-generated one are always allowed.
  if (jobUrl && !manualText && !target && user.role === "bidder") {
    const q = await manualQueue(user);
    // `reason` tells the page this is the paste limit, not the profile's monthly quota (both are 429).
    if (q.blocked)
      return NextResponse.json({ error: manualLimitMessage(q.pending, q.limit), reason: "manual_limit", pending: q.pending, limit: q.limit }, { status: 429 });
  }

  // URL-based attempts (single URL without pasted text, multi-URL import) are always tracked in the history:
  // a "not generated" placeholder is saved before scraping, so even a request killed by the function time limit leaves a record.
  const keep = !!(body.keepOnScrapeFail || target) && !!jobUrl;
  let createdPlaceholder = false;
  if (keep && !target) {
    target = await Application.create({
      user: user._id,
      profile: profile._id,
      profileLabel: profile.label,
      jobUrl,
      jobUrlKey: urlKey(jobUrl),
      company: hostLabel(jobUrl),
      fee: 0,
      status: "not_generated",
      generationError: INTERRUPTED,
    });
    createdPlaceholder = true;
  }
  const saveNotGenerated = async (reason: string) => {
    const placeholder = target!;
    placeholder.set({ status: "not_generated", generationError: reason, company: placeholder.company || hostLabel(jobUrl) });
    await placeholder.save();
    await markPostingRead(user._id, jobUrl).catch(() => {});
    return NextResponse.json(
      { id: String(placeholder._id), status: "not_generated", company: placeholder.company, jobTitle: "", message: reason },
      { status: 202 }
    );
  };
  // Policy refusals (same-company cooldown) are not failed attempts: drop a placeholder made for this request.
  const discardPlaceholder = async () => {
    if (createdPlaceholder && target) await target.deleteOne().catch(() => {});
  };

  let phase: "scrape" | "generate" = "scrape";
  let openai: Awaited<ReturnType<typeof resolveOpenAI>> | null = null;
  let result;
  let job: Omit<ScrapedJob, "url">;
  const settings = await getSettings();
  // Same-company cooldown: days set globally and per profile; scope and exempt companies in Settings.
  const rule = cooldownRule(settings, profile);
  const refuse = (hit: NonNullable<Awaited<ReturnType<typeof findCooldownHit>>>, company: string, role: string) =>
    rejectForCooldown({ hit, user, settings, profile, company, role });
  try {
    // Job description: pasted text, or scraped from the URL.
    job = manualText ? await pastedJob(manualText, jobUrl) : await scrapeJob(jobUrl);
    if (rule.days > 0 && job.companyTrusted && job.company) {
      // Known before generation (structured data) → block without spending tokens. With the role scope and no title
      // yet, it waits for the title the AI reads (below).
      const hit = await findCooldownHit(profile._id, job.company, rule, job.title);
      if (hit && !hit.sameRoleOnly) await refuse(hit, job.company, job.title);
    }
    phase = "generate";
    openai = await resolveOpenAI(profile);
    result = await generateApplication(openai, profile.toObject(), { ...job, url: jobUrl }, settings.promptInstructions, settings.resumePromptTemplate, settings.atsTargetScore ?? 85, requestStarted);
  } catch (e) {
    if (openai && e instanceof HttpError && e.status === 502) await recordKeyResult(openai.apiKeyId, e.message);
    const cooldown = e instanceof HttpError && e.status === 409;
    if (!keep || cooldown) {
      await discardPlaceholder();
      throw e;
    }
    // Scraping or the AI step failed: keep the attempt as "not generated" so it appears in the history and can be retried.
    const msg = (e as Error).message || "Unknown error";
    return saveNotGenerated(phase === "generate" ? `Resume generation failed: ${msg}` : msg);
  }
  await recordKeyResult(openai!.apiKeyId);

  // Company identified by the AI (pasted descriptions, pages without structured data) → check again before saving.
  if (rule.days > 0 && result.company) {
    const hit = await findCooldownHit(profile._id, result.company, rule, result.jobTitle);
    if (hit && !hit.sameRoleOnly) {
      await discardPlaceholder();
      await refuse(hit, result.company, result.jobTitle);
    }
  }

  const fields = {
    jobUrlKey: jobUrl ? urlKey(jobUrl) : "",
    company: result.company,
    companyKey: companyKey(result.company),
    jobTitle: result.jobTitle,
    jobLocation: result.jobLocation,
    jobDescription: result.jobDescription,
    resume: result.resume,
    coverLetter: result.coverLetter,
    resumeDesign: profile.resumeDesign ?? "",
    coverLetterDesign: profile.coverLetterDesign ?? "",
    status: "generated" as const,
    generationError: "",
    usage: {
      ...result.usage,
      apiKey: openai.apiKeyId,
      costUsd: estimateCost(openai, result.usage.promptTokens, result.usage.completionTokens),
    },
    fee: 0, // charged when the application is submitted (see PATCH /api/applications/[id])
  };

  let app;
  if (target) {
    target.set(fields);
    // The documents are already paid for: a dropped connection gets one more try instead of losing them.
    app = await retryOnDrop(() => target!.save());
    // It becomes a bid now: date it to the generation (daily report, quota month).
    await retryOnDrop(() => Application.collection.updateOne({ _id: target!._id }, { $set: { createdAt: new Date() } }));
  } else {
    const doc = new Application({ user: user._id, profile: profile._id, profileLabel: profile.label, jobUrl, ...fields });
    app = await retryOnDrop(() => doc.save());
  }

  if (jobUrl) await markPostingRead(user._id, jobUrl).catch(() => {});
  return NextResponse.json({ id: String(app._id), status: "generated", company: app.company, jobTitle: app.jobTitle });
});

/** Reason left on a placeholder when the request never finished (e.g. the serverless time limit). */
const INTERRUPTED = "Generation did not finish (timed out or interrupted). Try again or paste the job description.";

/** "boards.greenhouse.io/acme/jobs/1" → "acme"; other sites → hostname. Used as a placeholder's company label. */
function hostLabel(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const board = /(greenhouse|lever|workday|ashbyhq|smartrecruiters|jobvite|icims|bamboohr|workable)/i.test(host);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    return board && seg ? seg.replace(/[-_]+/g, " ") : host;
  } catch {
    return "";
  }
}
