import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { ChatConversation, ChatMessage } from "@/lib/models/Chat";
import { conversationFor, MAX_PINS, preview, type ChatMsg } from "@/lib/chat";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

/** POST { messageId, pinned } — admins pin a team chat message to the top (newest first, at most 5) or unpin it. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const c = await conversationFor(me, oid((await params).id));
  if (c.kind !== "team" || me.role !== "admin") throw new HttpError(403, "Only admins can pin messages in the team chat");
  const b = await req.json().catch(() => ({}));
  const id = oid(typeof b?.messageId === "string" ? b.messageId : "", "message");
  if (!b?.pinned) {
    await ChatConversation.updateOne({ _id: c._id }, { $pull: { pinned: { message: id } } });
    return NextResponse.json({ ok: true });
  }
  const m = await ChatMessage.findOne({ _id: id, conversation: c._id, deletedAt: null }).lean<ChatMsg>();
  if (!m) throw new HttpError(404, "Message not found");
  const pin = { message: m._id, body: preview(m, 300), senderName: m.senderName, pinnedBy: me.name, pinnedAt: new Date() };
  await ChatConversation.updateOne({ _id: c._id }, { $pull: { pinned: { message: m._id } } });
  await ChatConversation.updateOne({ _id: c._id }, { $push: { pinned: { $each: [pin], $position: 0, $slice: MAX_PINS } } });
  return NextResponse.json({ ok: true });
});
