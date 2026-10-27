import { after, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { ChatConversation, ChatMessage } from "@/lib/models/Chat";
import { User } from "@/lib/models/User";
import { conversationFor, directConversation, markRead, preview, type ChatMsg } from "@/lib/chat";
import { notifyChatMessage } from "@/lib/chatNotify";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

/** Conversations one forward can go to. */
const MAX_TARGETS = 10;
const isId = (x: unknown): x is string => typeof x === "string" && /^[a-f\d]{24}$/i.test(x);

/**
 * POST { messageId, conversations?, users? } — (admins only) forwards a message of this conversation to other conversations you can
 * write in, and/or to people (opening the direct conversation when there's none yet). The copy keeps the text, images
 * and report card, and shows who wrote the original; replies, mentions and reactions aren't copied.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const me = await requireUser("admin");
  const source = await conversationFor(me, oid((await params).id));
  const b = await req.json().catch(() => ({}));
  const m = await ChatMessage.findOne({ _id: oid(typeof b?.messageId === "string" ? b.messageId : "", "message"), conversation: source._id }).lean<ChatMsg>();
  if (!m || m.deletedAt) throw new HttpError(404, "Message not found");

  const convIds = [...new Set((Array.isArray(b?.conversations) ? b.conversations : []).filter(isId))] as string[];
  const userIds = [...new Set((Array.isArray(b?.users) ? b.users : []).filter(isId))].filter((u) => u !== String(me._id)) as string[];
  if (!convIds.length && !userIds.length) throw new HttpError(400, "Pick where to forward the message");
  if (convIds.length + userIds.length > MAX_TARGETS) throw new HttpError(400, `Forward to at most ${MAX_TARGETS} chats at once`);

  const people = await User.find({ _id: { $in: userIds }, status: "approved" }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  const targets = [
    ...(await Promise.all(convIds.map((id) => conversationFor(me, oid(id))))),
    ...(await Promise.all(people.map((p) => directConversation(me._id, p._id)))),
  ].filter((c, i, all) => all.findIndex((x) => x._id.equals(c._id)) === i);

  const forwarded = m.forwarded?.senderName ? m.forwarded : { senderName: m.senderName, at: m.createdAt };
  const sent: string[] = [];
  for (const c of targets) {
    const copy = (
      await ChatMessage.create({
        conversation: c._id,
        sender: me._id,
        senderName: me.name,
        body: m.body,
        images: m.images ?? [],
        report: m.report ?? null,
        forwarded,
      })
    ).toObject() as ChatMsg;
    await Promise.all([
      ChatConversation.updateOne({ _id: c._id }, { $set: { lastMessageAt: copy.createdAt, lastMessage: { body: preview(copy), sender: me._id, senderName: me.name } } }),
      markRead(c._id, me._id, copy.createdAt),
    ]);
    after(() => notifyChatMessage({ conversation: c, sender: me, text: `Forwarded: ${preview(copy, 130)}`, mentioned: [] }));
    sent.push(String(c._id));
  }
  return NextResponse.json({ sent });
});
