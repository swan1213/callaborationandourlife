import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { postMemberReports } from "@/lib/memberReports";

export const maxDuration = 60;

/** POST — (admins) posts every member's report now, covering the time since the last one; the next starts from here. */
export const POST = handler(async () => {
  await requireUser("admin");
  return NextResponse.json(await postMemberReports({ now: true }));
});
