import { NextResponse } from "next/server";
import { handler, quietHandler, requireUser } from "@/lib/auth";
import { User } from "@/lib/models/User";
import { LATEST_RELEASE, unseenNotes } from "@/lib/releaseNotes";

/** GET → { notes } — release notes this account hasn't seen, for its role (components/WhatsNew.tsx). */
export const GET = quietHandler(async () => {
  const user = await requireUser();
  return NextResponse.json({ notes: user.seenRelease === LATEST_RELEASE ? [] : unseenNotes(user.role, user.seenRelease) });
});

/** POST → marks every current note as seen ("Got it"). */
export const POST = handler(async () => {
  const user = await requireUser();
  await User.updateOne({ _id: user._id }, { $set: { seenRelease: LATEST_RELEASE } });
  return NextResponse.json({ ok: true });
});
