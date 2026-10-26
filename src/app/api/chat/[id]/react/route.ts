import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { ChatMessage } from "@/lib/models/Chat";
import { conversationFor, MAX_REACTION_KINDS, messageOut, type ChatMsg } from "@/lib/chat";
import { isSingleEmoji } from "@/lib/emoji";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

/** POST { messageId, emoji } — adds your reaction, or takes it back if you already reacted with that emoji. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const c = await conversationFor(me, oid((await params).id));
  const b = await req.json().catch(() => ({}));
  const emoji = typeof b?.emoji === "string" ? b.emoji.trim() : "";
  if (!isSingleEmoji(emoji)) throw new HttpError(400, "Pick one emoji");
  const match = { _id: oid(typeof b?.messageId === "string" ? b.messageId : "", "message"), conversation: c._id, deletedAt: null };
  const mine = { user: me._id, emoji };

  const removed = await ChatMessage.updateOne({ ...match, reactions: { $elemMatch: mine } }, { $pull: { reactions: mine } });
  if (!removed.modifiedCount) {
    const m = await ChatMessage.findOne(match).select("reactions").lean<Pick<ChatMsg, "reactions">>();
    if (!m) throw new HttpError(404, "Message not found");
    const kinds = new Set((m.reactions ?? []).map((r) => r.emoji));
    if (!kinds.has(emoji) && kinds.size >= MAX_REACTION_KINDS) throw new HttpError(400, `A message can have at most ${MAX_REACTION_KINDS} different reactions`);
    // The $not guard keeps a double click from adding the same reaction twice.
    await ChatMessage.updateOne({ ...match, reactions: { $not: { $elemMatch: mine } } }, { $push: { reactions: { ...mine, name: me.name } } });
  }

  const m = await ChatMessage.findOne(match).lean<ChatMsg>();
  if (!m) throw new HttpError(404, "Message not found");
  return NextResponse.json({ message: messageOut(m) });
});
