import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/models/Settings";
import { isValidTimeZone } from "@/lib/tz";
import { companyMatchKey } from "@/lib/company";
import { DEFAULT_RESUME_PROMPT } from "@/lib/resumePrompt";

export const GET = handler(async () => {
  await requireUser("admin");
  return NextResponse.json({ settings: (await getSettings()).toObject(), defaultResumePrompt: DEFAULT_RESUME_PROMPT });
});

export const PATCH = handler(async (req: Request) => {
  await requireUser("admin");
  const body = await req.json();
  const settings = await getSettings();
  if (typeof body.siteName === "string" && body.siteName.trim()) settings.siteName = body.siteName.trim();
  if (typeof body.myPageNotice === "string") settings.myPageNotice = body.myPageNotice;
  if (typeof body.promptInstructions === "string") settings.promptInstructions = body.promptInstructions;
  if (typeof body.resumePromptTemplate === "string") {
    const t = body.resumePromptTemplate.trim();
    if (t && t === DEFAULT_RESUME_PROMPT.trim()) settings.resumePromptTemplate = ""; // identical to default → follow future defaults
    else {
      if (t && !t.includes("{{CANDIDATE_PROFILE}}")) throw new HttpError(400, "The prompt must include {{CANDIDATE_PROFILE}}");
      settings.resumePromptTemplate = t;
    }
  }
  if (body.atsTargetScore !== undefined) {
    const n = Number(body.atsTargetScore);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new HttpError(400, "ATS target score must be a whole number from 0 to 100");
    settings.atsTargetScore = n;
  }
  if (typeof body.allowRegistration === "boolean") settings.allowRegistration = body.allowRegistration;
  if (body.defaultFee !== undefined) {
    const fee = Number(body.defaultFee);
    if (!Number.isFinite(fee) || fee < 0) throw new HttpError(400, "Default fee must be a non-negative number");
    settings.defaultFee = fee;
  }
  if (typeof body.reportTimezone === "string") {
    if (!isValidTimeZone(body.reportTimezone)) throw new HttpError(400, "Unknown timezone (use an IANA name like America/New_York)");
    settings.reportTimezone = body.reportTimezone;
  }
  if (body.interviewScheduleHours !== undefined) {
    const h = Number(body.interviewScheduleHours);
    if (!Number.isFinite(h) || h < 0.25 || h > 72) throw new HttpError(400, "Interview scheduling time must be between 0.25 and 72 hours");
    settings.interviewScheduleHours = h;
  }
  if (body.companyCooldownDays !== undefined) {
    const d = Number(body.companyCooldownDays);
    if (!Number.isInteger(d) || d < 0 || d > 365) throw new HttpError(400, "Company cooldown must be a whole number of days (0–365)");
    settings.companyCooldownDays = d;
  }
  if (body.cooldownScope === "company" || body.cooldownScope === "role") settings.cooldownScope = body.cooldownScope;
  if (body.cooldownExemptCompanies !== undefined) {
    // One company per line (or an array); blanks and repeats ("Acme" / "Acme, Inc.") dropped.
    const list = (Array.isArray(body.cooldownExemptCompanies) ? body.cooldownExemptCompanies : String(body.cooldownExemptCompanies).split(/\r?\n/))
      .map((x: unknown) => String(x).trim().slice(0, 100))
      .filter(Boolean);
    if (list.length > 500) throw new HttpError(400, "Up to 500 exempt companies");
    settings.cooldownExemptCompanies = [...new Map<string, string>(list.map((n: string) => [companyMatchKey(n) || n.toLowerCase(), n])).values()];
  }
  if (typeof body.dailyReportEnabled === "boolean") settings.dailyReportEnabled = body.dailyReportEnabled;
  if (typeof body.memberReportsEnabled === "boolean") settings.memberReportsEnabled = body.memberReportsEnabled;
  if (typeof body.notificationsEnabled === "boolean") settings.notificationsEnabled = body.notificationsEnabled;
  if (body.milestonePeriod === "daily" || body.milestonePeriod === "lifetime") settings.milestonePeriod = body.milestonePeriod;
  if (body.milestones !== undefined) {
    const list = (Array.isArray(body.milestones) ? body.milestones : String(body.milestones).split(/[,\s]+/))
      .filter((x: unknown) => String(x).trim() !== "")
      .map(Number);
    if (list.some((n: number) => !Number.isInteger(n) || n < 1)) throw new HttpError(400, "Milestones must be whole numbers ≥ 1");
    settings.milestones = [...new Set<number>(list)].sort((a, b) => a - b);
  }
  await settings.save();
  return NextResponse.json({ settings: settings.toObject() });
});
