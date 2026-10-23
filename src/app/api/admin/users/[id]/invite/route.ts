import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { User } from "@/lib/models/User";
import { oid } from "@/lib/query";
import { emailEnabled } from "@/lib/email";
import { generateTempPassword, sendInvite } from "@/lib/invite";

/**
 * Resend invite: issues a new temporary password (the old one is never stored) and emails it.
 * If the email can't be sent, the password is returned once so the admin can share it manually.
 */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireUser("admin");
  const user = await User.findById(oid((await params).id));
  if (!user) throw new HttpError(404, "Account not found");
  if (String(user._id) === String(admin._id)) throw new HttpError(400, "Use My Page to change your own password");

  const password = generateTempPassword();
  user.passwordHash = await bcrypt.hash(password, 10);
  user.mustChangePassword = true;
  if (user.status === "pending") user.status = "approved";
  await user.save();

  const invited = await sendInvite({ name: user.name, email: user.email, role: user.role, password, invitedBy: admin.name, reset: true });
  return NextResponse.json({ invited, emailConfigured: emailEnabled(), ...(invited ? {} : { password }) });
});
