import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { workTime } from "@/lib/presence";
import { APP_TZ, isValidTimeZone } from "@/lib/tz";

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&tz= — admin: active work time per account and day. */
export const GET = handler(async (req: Request) => {
  await requireUser("admin");
  const sp = new URL(req.url).searchParams;
  const tz = sp.get("tz") && isValidTimeZone(sp.get("tz")!) ? sp.get("tz")! : APP_TZ;
  return NextResponse.json({ ...(await workTime(sp.get("from") ?? "", sp.get("to") ?? "", tz)), tz });
});
