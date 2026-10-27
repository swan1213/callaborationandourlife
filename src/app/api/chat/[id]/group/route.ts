import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { ChatConversation, ChatMessage, ChatRead, ChatTyping } from "@/lib/models/Chat";
import { User } from "@/lib/models/User";
import { conversationFor } from "@/lib/chat";
import { groupMembers, groupName, MAX_GROUP_MEMBERS, notifyAdded } from "@/lib/chatGroups";
import { destroyAsset } from "@/lib/cloudinary";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

/** The group (admins in it only). */
async function load(params: Ctx["params"]) {
  const me = await requireUser("admin");
  const c = await conversationFor(me, oid((await params).id));
  if (c.kind !== "group") throw new HttpError(400, "Only group chats have members to manage");
  return { me, c };
}

/**
 * PATCH { name?, add?, remove? } — (admins) renames the group, adds accounts, removes members. An admin can leave
 * (remove themselves) only while another admin stays in the group, so someone can still manage it.
 */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const { me, c } = await load(params);
  const b = await req.json().catch(() => ({}));
  const set: { name?: string } = {};
  if (b?.name !== undefined) set.name = groupName(b.name);

  const current = c.members.map(String);
  const add = (await groupMembers(b?.add)).filter((u) => !current.includes(String(u)));
  const removeIds = (await groupMembers(b?.remove)).map(String).filter((u) => current.includes(u));
  // Accounts deleted or suspended since can be removed too.
  for (const x of Array.isArray(b?.remove) ? b.remove : []) if (typeof x === "string" && current.includes(x) && !removeIds.includes(x)) removeIds.push(x);

  const after = [...current.filter((u) => !removeIds.includes(u)), ...add.map(String)];
  if (after.length > MAX_GROUP_MEMBERS) throw new HttpError(400, `A group can have at most ${MAX_GROUP_MEMBERS} members`);
  if (removeIds.includes(String(me._id))) {
    const admins = await User.countDocuments({ _id: { $in: after }, role: "admin", status: "approved" });
    if (!admins) throw new HttpError(400, "Add another admin before you leave, or delete the group");
  }

  const remove = c.members.filter((m) => removeIds.includes(String(m)));
  await ChatConversation.updateOne({ _id: c._id }, { $set: set, $pull: { members: { $in: remove } } });
  if (add.length) await ChatConversation.updateOne({ _id: c._id }, { $addToSet: { members: { $each: add } } });
  const now = new Date();
  await Promise.all([
    // Removed: their read marker and typing go too (no avatar under the messages any more).
    remove.length ? ChatRead.deleteMany({ conversation: c._id, user: { $in: remove } }) : null,
    remove.length ? ChatTyping.deleteMany({ conversation: c._id, user: { $in: remove } }) : null,
    // Added: earlier messages count as read, so they don't arrive with the whole history unread.
    ...add.map((user) => ChatRead.updateOne({ conversation: c._id, user }, { $set: { at: now } }, { upsert: true })),
  ]);
  await notifyAdded(add, me.name, { _id: c._id, name: set.name ?? c.name });
  return NextResponse.json({ ok: true, added: add.length, removed: remove.length });
});

/** DELETE — (admins) deletes the group with all its messages for everyone. */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const { c } = await load(params);
  const images = await ChatMessage.distinct("images.publicId", { conversation: c._id, "images.publicId": { $nin: ["", null] } });
  await Promise.all([
    ChatMessage.deleteMany({ conversation: c._id }),
    ChatRead.deleteMany({ conversation: c._id }),
    ChatTyping.deleteMany({ conversation: c._id }),
    ChatConversation.deleteOne({ _id: c._id }),
  ]);
  // Images forwarded to other chats stay.
  const shared = images.length ? await ChatMessage.distinct("images.publicId", { "images.publicId": { $in: images }, deletedAt: null }) : [];
  await Promise.all(images.filter((id) => !shared.includes(id)).map((id) => destroyAsset(id as string)));
  return NextResponse.json({ ok: true });
});
