import { NextResponse } from "next/server";
import { handler } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

export const POST = handler(async (_req: Request) => {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
