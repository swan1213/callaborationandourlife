import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { handler, HttpError, setSessionCookie } from "@/lib/auth";
import { User } from "@/lib/models/User";
import { signSession } from "@/lib/session";

/** Creates the first admin from SEED_ADMIN_* (or ADMIN_*) env vars when no admin exists yet. */
async function bootstrapAdmin(email: string, password: string) {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Administrator";
  if (!adminEmail || !adminPassword) return;
  if (email !== adminEmail.toLowerCase() || password !== adminPassword) return;
  if (await User.exists({ role: "admin" })) return;
  await User.findOneAndUpdate(
    { email },
    { name, email, passwordHash: await bcrypt.hash(password, 10), role: "admin", status: "approved", feePerApplication: 0 },
    { upsert: true }
  );
}

export const POST = handler(async (req: Request) => {
  const body = await req.json();
  const email = String(body.email || "").toLowerCase().trim();
  const password = String(body.password || "");
  const remember = body.remember === true;
  if (!email || !password) throw new HttpError(400, "Email and password are required");

  await connectDB();
  await bootstrapAdmin(email, password);
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, "Invalid email or password");
  if (user.status === "pending") throw new HttpError(403, "Your account is awaiting administrator approval");
  if (user.status === "suspended") throw new HttpError(403, "Your account has been deactivated. Contact an administrator.");
  if (user.status !== "approved") throw new HttpError(403, "Your sign-up request was not approved.");

  user.lastLoginAt = new Date();
  await user.save();

  // "Remember me" keeps the session for 30 days; otherwise it ends when the browser closes (token capped at 12h).
  const token = await signSession({ uid: String(user._id), role: user.role, name: user.name }, remember ? "30d" : "12h");
  const res = NextResponse.json({ ok: true, role: user.role });
  setSessionCookie(res, token, remember ? 60 * 60 * 24 * 30 : null);
  return res;
});
