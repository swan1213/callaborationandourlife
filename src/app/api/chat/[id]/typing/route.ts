import { NextResponse } from "next/server";
import { quietHandler, requireUser } from "@/lib/auth";
import { ChatTyping } from "@/lib/models/Chat";
import { conversationFor } from "@/lib/chat";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

/** POST — "I'm typing" (sent every few seconds while typing; shown to the others for a few seconds). Not logged. */
export const POST = quietHandler(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const c = await conversationFor(me, oid((await params).id));
  await ChatTyping.updateOne({ conversation: c._id, user: me._id }, { $set: { name: me.name, at: new Date() } }, { upsert: true });
  return NextResponse.json({ ok: true });
});
