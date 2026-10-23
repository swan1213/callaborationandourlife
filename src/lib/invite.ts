import crypto from "crypto";
import { appUrl, emailEnabled, sendEmail } from "./email";
import { inviteEmail } from "./emailTemplates";

/** 14-char temporary password without look-alike characters (0/O, 1/l/I). */
export function generateTempPassword(length = 14) {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%*?"];
  const all = sets.join("");
  const pick = (s: string) => s[crypto.randomInt(s.length)];
  const chars = [...sets.map(pick), ...Array.from({ length: length - sets.length }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Emails sign-in details (email, password, role). Returns whether the email was accepted by Resend. */
export async function sendInvite(o: { name: string; email: string; role: string; password: string; invitedBy: string; reset?: boolean }) {
  if (!emailEnabled()) return false;
  return sendEmail(o.email, inviteEmail({ ...o, url: appUrl() }));
}
