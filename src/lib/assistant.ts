// Interview Assistant (assistant/ in this repo): a companion app that runs on the caller's Windows PC.
// TailorBid signs it a short-lived token for one interview. With that token the assistant reads the
// interview's resume and job description (/api/assistant/context) and calls OpenAI through
// /api/assistant/openai, so the OpenAI keys stay on this server.
import { createHash } from "crypto";
import { SignJWT, errors, jwtVerify } from "jose";
import { after } from "next/server";
import { canRequestInterviews, HttpError } from "./auth";
import { connectDB } from "./db";
import { formatRange, type ResumeContent } from "./generate";
import { interviewVisibility } from "./interviews";
import { InterviewRequest } from "./models/InterviewRequest";
import { Profile } from "./models/Profile";
import { User, type UserDoc } from "./models/User";
import { resolveOpenAI } from "./openaiKeys";
import { oid } from "./query";

const AUDIENCE = "interview-assistant";

/** Who may use the Interview Assistant: admins, users (profile managers) and callers. Not bidders. */
export const canUseAssistant = (role: string) => role === "admin" || role === "user" || role === "caller";
const NOT_ALLOWED = "The Interview Assistant is for TailorBid admins, users and callers.";
const TTL_MS = 12 * 60 * 60 * 1000; // one working day

// A key of its own (derived from JWT_SECRET), so an assistant token can never be used as a sign-in cookie.
function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return createHash("sha256").update(`${s}:${AUDIENCE}`).digest();
}

/** Refuses accounts that may not use the assistant (before a connection token is issued). */
export function requireAssistantRole(user: { role: string }) {
  if (!canUseAssistant(user.role)) throw new HttpError(403, NOT_ALLOWED);
}

export async function signAssistantToken(uid: string, interviewId: string | null) {
  const expiresAt = new Date(Date.now() + TTL_MS);
  const token = await new SignJWT({ uid, iid: interviewId ?? "" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  return { token, expiresAt };
}

/** The interview if this user may see it (same rules as the interview pages); 404 otherwise. */
export async function visibleInterview(user: UserDoc, id: string) {
  if (user.role === "bidder" && !canRequestInterviews(user)) throw new HttpError(403, "Interview requests are not enabled for your account");
  const i = await InterviewRequest.findOne({ $and: [{ _id: oid(id, "interview") }, { deletedAt: null }, interviewVisibility(user)] });
  if (!i) throw new HttpError(404, "Interview not found");
  return i;
}

type TokenPayload = { uid?: string; iid?: string };

/** Checks the token's signature and expiry (no database). */
async function verifyToken(req: Request): Promise<TokenPayload> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  try {
    return (await jwtVerify<TokenPayload>(token, secret(), { audience: AUDIENCE })).payload;
  } catch (e) {
    throw new HttpError(
      401,
      e instanceof errors.JWTExpired
        ? "The TailorBid connection has expired. Click Interview Assistant in TailorBid to connect again."
        : "Not connected to TailorBid. Open the assistant from the Interview Assistant button in TailorBid."
    );
  }
}

async function checkAccess(payload: TokenPayload) {
  await connectDB();
  const user = await User.findById(payload.uid);
  if (!user || user.status !== "approved") throw new HttpError(401, "This TailorBid account can no longer use the assistant.");
  // Checked on every request (not only when connecting), so a role change applies to an open connection too.
  if (!canUseAssistant(user.role)) throw new HttpError(403, NOT_ALLOWED);
  const interview = payload.iid ? await visibleInterview(user, payload.iid) : null;
  return { user, interview };
}

/** Checks the assistant's `Authorization: Bearer <token>`; re-checks the user and their access to the interview. */
export async function requireAssistant(req: Request) {
  return checkAccess(await verifyToken(req));
}

async function lookupKey(payload: TokenPayload) {
  const { interview } = await checkAccess(payload);
  const profile = interview ? await Profile.findById(interview.profile).select("apiKey openaiModel").lean() : null;
  const { client } = await resolveOpenAI(profile ?? {});
  if (!client.apiKey) throw new HttpError(400, "No OpenAI API key is configured. Ask an administrator.");
  return client.apiKey;
}

// Live answers must not wait for the database (about a second): the account check and the key are cached.
// Older than FRESH_MS, the cached key is still used and checked again after the reply; an account switched
// off or a key changed applies from the next request. Unused for STALE_MS, they are looked up before answering.
const FRESH_MS = 60_000;
const STALE_MS = 30 * 60_000;
// On globalThis (like the database connection in db.ts): `next dev` reloads idle routes, which would empty it.
type KeyCache = Map<string, { at: number; apiKey: string; checking?: boolean }>;
const g = globalThis as unknown as { _assistantKeys?: KeyCache };
const keyCache: KeyCache = g._assistantKeys ?? (g._assistantKeys = new Map());

/** The OpenAI key for an assistant request: the interview profile's key → default key → OPENAI_API_KEY. */
export async function assistantOpenAIKey(req: Request) {
  const payload = await verifyToken(req); // every time: an expired token never gets through
  const cacheKey = createHash("sha256").update(req.headers.get("authorization") ?? "").digest("hex");
  const hit = keyCache.get(cacheKey);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < STALE_MS) {
    if (age >= FRESH_MS && !hit.checking) {
      hit.checking = true;
      after(() =>
        lookupKey(payload)
          .then((apiKey) => keyCache.set(cacheKey, { at: Date.now(), apiKey }))
          .catch(() => keyCache.delete(cacheKey))
      );
    }
    return hit.apiKey;
  }

  const apiKey = await lookupKey(payload);
  for (const [k, v] of keyCache) if (Date.now() - v.at >= STALE_MS) keyCache.delete(k);
  keyCache.set(cacheKey, { at: Date.now(), apiKey });
  return apiKey;
}

/** A tailored resume as plain text, the way the assistant's answer prompt reads it. */
export function resumeToText(r: ResumeContent) {
  const plain = (s?: string | null) => (s ?? "").replace(/\*\*/g, "").trim();
  const c = r.contact ?? ({} as ResumeContent["contact"]);
  const lines = [plain(r.fullName), plain(r.titleLine || r.headline), [c.location, c.email, c.phone, c.linkedin, c.github, c.website].filter(Boolean).join(" | ")];
  if (r.summary) lines.push("", "SUMMARY", plain(r.summary));
  if (r.skills?.length) lines.push("", "SKILLS", ...r.skills.map((g) => `${g.category}: ${g.items.join(", ")}`));
  if (r.experience?.length) {
    lines.push("", "EXPERIENCE");
    for (const e of r.experience) {
      lines.push("", `${e.title}, ${[e.company, e.location].filter(Boolean).join(", ")} (${formatRange(e.startDate, e.endDate, !e.endDate)})`);
      if (e.description) lines.push(plain(e.description));
      lines.push(...e.bullets.map((b) => `- ${plain(b)}`));
    }
  }
  if (r.projects?.length) {
    lines.push("", "PROJECTS");
    for (const p of r.projects) {
      lines.push("", `${p.name}${p.techStack?.length ? ` (${p.techStack.join(", ")})` : ""}`);
      if (p.description) lines.push(plain(p.description));
      lines.push(...p.bullets.map((b) => `- ${plain(b)}`));
    }
  }
  if (r.education?.length) {
    lines.push("", "EDUCATION");
    for (const e of r.education) lines.push(`${[e.degree, e.field].filter(Boolean).join(", ")}, ${e.university} (${formatRange(e.startDate, e.endDate)})`);
  }
  return lines.join("\n").trim();
}
