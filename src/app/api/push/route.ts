import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { PushSubscription } from "@/lib/models/PushSubscription";
import { pushPublicKey } from "@/lib/push";

/** GET — the key browsers subscribe with ({ publicKey: null } when web push isn't set up on the server). */
export const GET = handler(async () => {
  await requireUser();
  return NextResponse.json({ publicKey: pushPublicKey() });
});

/** POST { endpoint, keys: { p256dh, auth } } — this browser turned Desktop alerts on (components/desktopNotify.ts). */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const b = await req.json().catch(() => null);
  const endpoint = String(b?.endpoint ?? "");
  const p256dh = String(b?.keys?.p256dh ?? "");
  const auth = String(b?.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw new HttpError(400, "Invalid push subscription");
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { $set: { user: user._id, keys: { p256dh, auth }, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300) } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true });
});

/** DELETE { endpoint } — this browser turned Desktop alerts off. */
export const DELETE = handler(async (req: Request) => {
  const user = await requireUser();
  const b = await req.json().catch(() => null);
  await PushSubscription.deleteOne({ endpoint: String(b?.endpoint ?? ""), user: user._id });
  return NextResponse.json({ ok: true });
});
