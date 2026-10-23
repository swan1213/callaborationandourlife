import type { Types } from "mongoose";
import { ActivityLog } from "./models/ActivityLog";
import { User } from "./models/User";

type Actor = { _id: unknown; name?: string; email?: string; role?: string } | null;

export type LogEntry = {
  level?: "info" | "warn" | "error";
  category: string;
  action: string;
  summary: string;
  actor?: Actor;
  actorEmail?: string;
  method?: string;
  path?: string;
  targetId?: string;
  status?: number;
  durationMs?: number;
  ip?: string;
  userAgent?: string;
  meta?: unknown;
};

/** Writes one log row. Never throws: logging must not break the request. */
export async function logActivity(e: LogEntry) {
  try {
    await ActivityLog.create({
      level: e.level ?? "info",
      category: e.category,
      action: e.action.slice(0, 200),
      summary: e.summary.slice(0, 500),
      actor: (e.actor?._id as Types.ObjectId | undefined) ?? null,
      actorName: e.actor?.name ?? "",
      actorEmail: e.actor?.email ?? e.actorEmail ?? "",
      actorRole: e.actor?.role ?? "",
      method: e.method ?? "",
      path: (e.path ?? "").slice(0, 300),
      targetId: e.targetId ?? "",
      status: e.status ?? 0,
      durationMs: e.durationMs ?? 0,
      ip: (e.ip ?? "").slice(0, 100),
      userAgent: (e.userAgent ?? "").slice(0, 300),
      meta: e.meta ?? null,
    });
  } catch (err) {
    console.error("activity log failed", err);
  }
}

/* ------------------------------------------------------------ request logging */

const OID = /^[a-f0-9]{24}$/i;
const SECRET = /pass(word)?|secret|token|api[-_]?key|^key$|keyEnc|signature|credential/i;

/** Small, safe copy of a JSON body for the log: secrets dropped, long strings cut, arrays summarised. */
export function sanitize(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return v.length > 200 ? `${v.slice(0, 200)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.length > 10 ? `[${v.length} items]` : depth > 2 ? `[${v.length} items]` : v.map((x) => sanitize(x, depth + 1));
  if (typeof v === "object") {
    if (depth > 2) return "{…}";
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 30)) out[k] = SECRET.test(k) ? "••••" : sanitize(x, depth + 1);
    return out;
  }
  return String(v);
}

/** "/api/interviews/64f…/documents" → "/api/interviews/:id/documents" */
const normalize = (path: string) =>
  path
    .split("/")
    .map((s) => (OID.test(s) ? ":id" : s))
    .join("/");

const CATEGORY: [RegExp, string][] = [
  [/^\/api\/auth/, "auth"],
  [/^\/api\/(admin\/)?applications|^\/api\/cloudinary/, "application"],
  [/^\/api\/interviews/, "interview"],
  [/^\/api\/admin\/(users|assignments)|^\/api\/me(\/|$)/, "account"],
  [/^\/api\/(admin\/)?profiles/, "profile"],
  [/^\/api\/admin\/messages|^\/api\/notifications/, "notification"],
  [/^\/api\/feedback/, "feedback"],
  [/^\/api\/admin\/(settings|keys|models|reports|access-keys|prompt-test)/, "settings"],
  [/^\/api\/cron/, "system"],
];
export const LOG_CATEGORIES = ["auth", "application", "interview", "account", "profile", "notification", "feedback", "settings", "email", "system", "other"];

/** Readable sentence for common actions (falls back to the method + path). */
function describe(method: string, key: string, body: Record<string, unknown> | null, status: number): string {
  const ok = status < 400;
  const b = body ?? {};
  const act = typeof b.action === "string" ? b.action : "";
  const map: Record<string, string> = {
    "POST /api/auth/login": ok ? `Signed in` : `Failed sign-in for ${b.email ?? "unknown email"}`,
    "POST /api/auth/logout": "Signed out",
    "POST /api/auth/register": `Registered ${b.email ?? ""}`,
    "POST /api/applications/generate": b.applicationId ? "Generated a not-generated application" : `Generated an application${b.jobUrl ? ` from ${b.jobUrl}` : ""}`,
    "PATCH /api/applications/:id": b.status === "submitted" ? "Submitted an application" : b.addScreenshot ? "Uploaded a screenshot" : b.removeScreenshot ? "Removed a screenshot" : b.status === "generated" ? "Un-submitted an application" : "Updated an application",
    "DELETE /api/applications/:id": "Deleted an application",
    "GET /api/applications/:id/download": `Downloaded application documents${b.format ? ` (${b.format})` : ""}`,
    "POST /api/applications/bulk-download": `Downloaded ${Array.isArray(b.ids) ? b.ids.length : "several"} applications (${b.content ?? "all"})`,
    "GET /api/admin/applications/export": "Exported applications (ZIP)",
    "POST /api/admin/applications/paid": `Marked ${Array.isArray(b.ids) ? b.ids.length : ""} application(s) as ${b.paid === false ? "not paid" : "paid"}`,
    "POST /api/interviews": `Requested a step ${b.step ?? 1} interview`,
    "PATCH /api/interviews/:id": act ? `Interview: ${act}${act === "transfer" && b.reason ? ` (${b.reason})` : ""}${act === "report" && b.outcome ? ` (${b.outcome})` : ""}` : "Updated an interview",
    "GET /api/interviews/:id/documents": `Downloaded interview materials (${b.type ?? "zip"})`,
    "POST /api/admin/users": `Created ${b.role ?? "an"} account ${b.email ?? ""}`,
    "PATCH /api/admin/users/:id": b.status ? `Changed account status to ${b.status}` : b.role ? `Changed account role to ${b.role}` : b.newPassword ? "Reset an account password" : "Updated an account",
    "DELETE /api/admin/users/:id": "Deleted an account",
    "PUT /api/admin/assignments": "Changed profile assignments",
    "POST /api/admin/profiles": `Created profile ${b.label ?? ""}`,
    "PATCH /api/admin/profiles/:id": "Updated a profile",
    "PUT /api/admin/profiles/:id": "Updated a profile",
    "DELETE /api/admin/profiles/:id": "Deleted a profile",
    "POST /api/admin/messages": `Sent notification "${b.title ?? ""}"${b.email ? " (in-app + email)" : ""}`,
    "DELETE /api/admin/messages/:id": "Deleted a notification",
    "POST /api/feedback": `Sent feedback "${b.subject ?? ""}"`,
    "PATCH /api/feedback/:id": b.reply ? "Replied to feedback" : `Set feedback status to ${b.status ?? ""}`,
    "PATCH /api/admin/settings": "Changed settings",
    "PATCH /api/me": b.avatar !== undefined ? "Changed avatar" : b.newPassword ? "Changed own password" : b.callerSettings ? "Changed reminder settings" : "Updated own account",
  };
  const base = map[`${method} ${key}`] ?? `${method} ${key}`;
  return ok ? base : `${base} (failed: ${status})`;
}

// Frequent, low-value calls kept out of the log.
const SKIP = [/^\/api\/notifications\/:id\/read$/, /^\/api\/notifications\/read-all$/, /^\/api\/applications\/:id\/read$/, /^\/api\/reads/, /^\/api\/cloudinary\/sign$/];
const FILE_GETS = [/\/download$/, /\/export$/, /\/documents$/];

/**
 * Called by `handler()` after every API request. Records mutations, file downloads and failures.
 * `body` is a pre-read clone of the JSON body (or null).
 */
export async function logRequest(req: Request, res: Response, started: number, body: Record<string, unknown> | null, error?: unknown) {
  try {
    const url = new URL(req.url);
    const key = normalize(url.pathname);
    const method = req.method.toUpperCase();
    const status = res.status;
    const mutation = method !== "GET" && method !== "HEAD";
    const fileGet = method === "GET" && FILE_GETS.some((r) => r.test(key));
    const cron = key.startsWith("/api/cron");
    if (!(mutation || fileGet || cron || status >= 500)) return;
    if (SKIP.some((r) => r.test(key))) return;

    const query = Object.fromEntries(url.searchParams);
    const merged = { ...(fileGet ? query : {}), ...(body ?? {}) };
    // Who: the signed-in user, or for sign-in attempts the account matching the email.
    const { currentUser } = await import("./auth");
    let actor: Actor = await currentUser().catch(() => null);
    if (!actor && typeof merged.email === "string" && key === "/api/auth/login") actor = await User.findOne({ email: merged.email.toLowerCase() }).select("name email role").lean();

    await logActivity({
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      category: CATEGORY.find(([r]) => r.test(url.pathname))?.[1] ?? "other",
      action: `${method} ${key}${typeof merged.action === "string" ? ` · ${merged.action}` : ""}`,
      summary: describe(method, key, merged, status) + (error instanceof Error && status >= 500 ? `: ${error.message}` : ""),
      actor,
      actorEmail: typeof merged.email === "string" ? merged.email : undefined,
      method,
      path: url.pathname + (url.search || ""),
      targetId: url.pathname.split("/").find((s) => OID.test(s)) ?? "",
      status,
      durationMs: Date.now() - started,
      ip: (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0].trim(),
      userAgent: req.headers.get("user-agent") ?? "",
      meta: Object.keys(merged).length ? sanitize(merged) : null,
    });
  } catch (err) {
    console.error("request log failed", err);
  }
}
