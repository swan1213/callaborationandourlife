// External read-only API (/api/v1): key creation, key checks and the JSON shapes it returns.
import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { HttpError } from "./auth";
import { AccessToken } from "./models/AccessToken";
import { APP_TZ, formatDateTime, zoneName } from "./tz";

const KEY_PREFIX = "tbk_";
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new random key; only its hash is stored. */
export function newAccessKey() {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 6), hash: hashKey(key) };
}

/** Checks `Authorization: Bearer <key>` (or `X-API-Key: <key>`); throws 401 when missing, unknown, revoked or expired. */
export async function requireAccessKey(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const key = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : req.headers.get("x-api-key") ?? "").trim();
  if (!key) throw new HttpError(401, "Missing API key. Send it as: Authorization: Bearer <key>");
  const token = await AccessToken.findOne({ hash: hashKey(key) });
  if (!token) throw new HttpError(401, "Invalid API key");
  if (token.revokedAt) throw new HttpError(401, "This API key has been revoked");
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) throw new HttpError(401, "This API key has expired");
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0].trim();
  await AccessToken.updateOne({ _id: token._id }, { $set: { lastUsedAt: new Date(), lastUsedIp: ip }, $inc: { useCount: 1 } });
  return token;
}

/** JSON response for the external API (no caching). */
export const apiJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

const id = (v: unknown) => (v ? String((v as { _id?: unknown })._id ?? v) : null);
const when = (d?: Date | string | null) => (d ? { iso: new Date(d).toISOString(), local: formatDateTime(new Date(d), APP_TZ), timeZone: zoneName(APP_TZ, new Date(d)) } : null);

type Doc = Record<string, unknown> & { _id: unknown };

/** Interview as returned by the API. */
export function interviewOut(i: Doc) {
  const profile = i.profile as { _id: unknown; label?: string; fullName?: string } | null;
  const caller = i.caller as { _id: unknown; name?: string; email?: string } | null;
  const by = i.requestedBy as { _id: unknown; name?: string } | null;
  const report = (i.report ?? {}) as Record<string, unknown>;
  const scheduledAt = i.scheduledAt as Date | null;
  return {
    id: String(i._id),
    status: i.status,
    step: i.step ?? 1,
    company: i.company ?? "",
    jobTitle: i.jobTitle ?? "",
    scheduledAt: when(scheduledAt),
    durationMinutes: i.durationMinutes ?? 60,
    requested: { mode: i.mode, start: when(i.windowStart as Date), end: when(i.windowEnd as Date | null) },
    profile: profile ? { id: id(profile), label: profile.label ?? "", fullName: profile.fullName ?? "" } : { id: null, label: i.profileLabel ?? "" },
    caller: caller ? { id: id(caller), name: caller.name ?? "", email: caller.email ?? "" } : null,
    requestedBy: by ? { id: id(by), name: by.name ?? "" } : null,
    applicationId: id(i.application),
    meetingNote: i.callerNote ?? "",
    notes: i.notes ?? "",
    result: report.outcome
      ? {
          outcome: report.outcome,
          interviewerName: report.interviewerName ?? "",
          interviewerCallerId: report.interviewerCallerId ?? "",
          feedback: report.summary ?? "",
          recordingUrl: report.recordingUrl ?? "",
          reportedAt: report.reportedAt ?? null,
        }
      : null,
    links: {
      self: `/api/v1/interviews/${i._id}`,
      profile: `/api/v1/interviews/${i._id}/profile`,
      resume: `/api/v1/interviews/${i._id}/resume`,
      jobDescription: `/api/v1/interviews/${i._id}/job-description`,
    },
  };
}

/** Profile as returned by the API (everything except OpenAI key settings). */
export function profileOut(p: Doc) {
  const { _id, apiKey, openaiModel, monthlyQuota, __v, ...rest } = p as Doc & { apiKey?: unknown; openaiModel?: unknown; monthlyQuota?: unknown; __v?: unknown };
  void apiKey;
  void openaiModel;
  void monthlyQuota;
  void __v;
  return { id: String(_id), ...rest };
}

/** Generated application documents as returned by the API. */
export function applicationOut(a: Doc) {
  const profile = a.profile as { _id: unknown; label?: string } | null;
  return {
    id: String(a._id),
    status: a.status,
    company: a.company ?? "",
    jobTitle: a.jobTitle ?? "",
    jobLocation: a.jobLocation ?? "",
    jobUrl: a.jobUrl ?? "",
    profile: profile ? { id: id(profile), label: profile.label ?? "" } : { id: id(a.profile), label: a.profileLabel ?? "" },
    generatedAt: a.createdAt ?? null,
    submittedAt: a.submittedAt ?? null,
    resume: a.resume ?? null,
    coverLetter: a.coverLetter ?? "",
    jobDescription: a.jobDescription ?? "",
    links: {
      resumePdf: `/api/v1/applications/${a._id}?format=pdf`,
      resumeDocx: `/api/v1/applications/${a._id}?format=docx`,
      jobDescriptionDocx: `/api/v1/applications/${a._id}?format=jd-docx`,
    },
  };
}
