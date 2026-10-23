import { User } from "./models/User";
import { signupEmail, statusEmail, type Email } from "./emailTemplates";
import { logActivity } from "./activity";
import { notify } from "./inbox";

export function appUrl() {
  const url =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return url.replace(/\/$/, "");
}

export function emailEnabled() {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM && process.env.EMAIL_ENABLED !== "0";
}

/** Sends an HTML email via Resend (see sendEmail). Never throws — email is best-effort. Returns true on success. */
async function deliver(to: string | string[], email: Email): Promise<boolean> {
  if (!emailEnabled()) return false;
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
  if (!recipients.length) return false;
  try {
    const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: recipients, subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("Resend error", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("Resend request failed", e);
    return false;
  }
}

export async function notifyAdminsOfSignup(name: string, email: string) {
  const admins = await User.find({ role: "admin", status: "approved" }).select("email").lean();
  await notify(admins, { kind: "account-signup", tone: "warning", title: "New sign-up to approve", body: `${name} (${email}) is waiting for approval.`, url: "/admin/users?status=pending" });
  await sendEmail(
    admins.map((a) => a.email),
    signupEmail({ name, email, url: appUrl() })
  );
}

export async function notifyUserStatus(name: string, email: string, status: string, userId?: unknown) {
  if (!["approved", "rejected", "suspended"].includes(status)) return;
  // Only an active account can sign in and see it.
  if (status === "approved" && userId) await notify([String(userId)], { kind: "account-status", tone: "success", title: "Your account is active", body: "An administrator approved your account. Welcome to TailorBid." });
  await sendEmail(email, statusEmail({ name, status, url: appUrl() }));
}

/** Sends an HTML email via Resend and records it in the activity log. Never throws. Returns true on success. */
export async function sendEmail(to: string | string[], email: Email): Promise<boolean> {
  const ok = await deliver(to, email);
  if (emailEnabled()) {
    const recipients = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
    await logActivity({
      level: ok ? "info" : "warn",
      category: "email",
      action: ok ? "email.sent" : "email.failed",
      summary: `${ok ? "Email sent" : "Email failed"}: "${email.subject}" → ${recipients.join(", ")}`,
      meta: { to: recipients, subject: email.subject },
      status: ok ? 200 : 502,
    });
  }
  return ok;
}
