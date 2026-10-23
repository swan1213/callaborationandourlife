import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { handler, HttpError } from "@/lib/auth";
import { User } from "@/lib/models/User";
import { getSettings } from "@/lib/models/Settings";
import { notifyAdminsOfSignup } from "@/lib/email";

export const POST = handler(async (req: Request) => {
  const { name, email, password } = await req.json();
  if (!name?.trim() || !email?.trim() || !password) throw new HttpError(400, "Name, email and password are required");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Invalid email");
  if (String(password).length < 8) throw new HttpError(400, "Password must be at least 8 characters");

  await connectDB();
  const settings = await getSettings();
  if (!settings.allowRegistration) throw new HttpError(403, "Registration is currently closed");
  if (await User.exists({ email: email.toLowerCase().trim() })) throw new HttpError(409, "An account with this email already exists");

  await User.create({
    name: name.trim(),
    email,
    passwordHash: await bcrypt.hash(password, 10),
    feePerApplication: settings.defaultFee,
  });
  await notifyAdminsOfSignup(name.trim(), email.toLowerCase().trim());
  return NextResponse.json({ ok: true, message: "Account created. An administrator must approve it before you can sign in." });
});
