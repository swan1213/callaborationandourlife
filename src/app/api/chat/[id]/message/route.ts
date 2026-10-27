import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { ChatConversation, ChatMessage } from "@/lib/models/Chat";
import { conversationFor, EDIT_WINDOW_MS, MAX_MESSAGE, messageOut, preview, type ChatMsg } from "@/lib/chat";
import { destroyAsset } from "@/lib/cloudinary";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, params: Ctx["params"]) {
  const me = await requireUser();
  const c = await conversationFor(me, oid((await params).id));
  const b = await req.json().catch(() => ({}));
  const m = await ChatMessage.findOne({ _id: oid(typeof b?.messageId === "string" ? b.messageId : "", "message"), conversation: c._id }).lean<ChatMsg>();
  if (!m || m.deletedAt) throw new HttpError(404, "Message not found");
  return { me, c, b, m };
}

/** Keeps the conversation list preview right when the newest message was edited or deleted. */
async function syncPreview(c: { _id: unknown; lastMessageAt: Date | null }, m: ChatMsg) {
  if (c.lastMessageAt && c.lastMessageAt.getTime() === new Date(m.createdAt).getTime())
    await ChatConversation.updateOne({ _id: c._id }, { $set: { "lastMessage.body": preview(m) } });
}

/** PATCH { messageId, body } — edits your own message within 15 minutes of sending it. */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { me, c, b, m } = await load(req, params);
  if (!m.sender.equals(me._id)) throw new HttpError(403, "You can only edit your own messages");
  if (m.forwarded?.senderName) throw new HttpError(400, "Forwarded messages can't be edited");
  if (Date.now() - new Date(m.createdAt).getTime() > EDIT_WINDOW_MS) throw new HttpError(400, "Messages can only be edited for 15 minutes after sending");
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (!body && !m.images?.length) throw new HttpError(400, "A message can't be empty: delete it instead");
  if (body.length > MAX_MESSAGE) throw new HttpError(400, `Messages can be at most ${MAX_MESSAGE} characters`);
  const updated = await ChatMessage.findOneAndUpdate({ _id: m._id }, { $set: { body, editedAt: new Date() } }, { returnDocument: "after" }).lean<ChatMsg>();
  await syncPreview(c, updated!);
  return NextResponse.json({ message: messageOut(updated!) });
});

/**
 * DELETE { messageId } — deletes a message: your own, or (admins) anyone's in Team chat or Daily reports. It stays as a
 * "Message deleted" line; its text, images, reactions and any pin are removed.
 */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const { me, c, m } = await load(req, params);
  const mine = m.sender.equals(me._id);
  if (!mine && !(me.role === "admin" && c.kind !== "direct")) throw new HttpError(403, "You can only delete your own messages");
  const updated = await ChatMessage.findOneAndUpdate(
    { _id: m._id },
    { $set: { deletedAt: new Date(), body: "", images: [], reactions: [], mentions: [] } },
    { returnDocument: "after" }
  ).lean<ChatMsg>();
  // Forwarded copies share the images: only remove the ones no other message still shows.
  const ids = (m.images ?? []).map((i) => i.publicId).filter(Boolean);
  const shared = ids.length ? await ChatMessage.distinct("images.publicId", { "images.publicId": { $in: ids }, deletedAt: null }) : [];
  await Promise.all([
    syncPreview(c, updated!),
    ChatConversation.updateOne({ _id: c._id }, { $pull: { pinned: { message: m._id } } }),
    ...ids.filter((id) => !shared.includes(id)).map((id) => destroyAsset(id)),
  ]);
  return NextResponse.json({ message: messageOut(updated!) });
});
