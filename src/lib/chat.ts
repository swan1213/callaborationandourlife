// Team chat: one channel for every approved account, plus direct conversations between two accounts.
// The page (app/(app)/chat) and the header button poll the API; there is no socket.
import { Types } from "mongoose";
import { HttpError } from "./auth";
import { ChatConversation, ChatRead, type ChatConversationFields, type ChatMessageFields } from "./models/Chat";
import type { UserDoc } from "./models/User";

export const MAX_MESSAGE = 4000;
/** Different emoji one message can collect. */
export const MAX_REACTION_KINDS = 20;

export type ChatMsg = ChatMessageFields & { _id: Types.ObjectId };

/** A message as the API sends it: reactions grouped by emoji (first added first), with who added each. */
export function messageOut(m: ChatMsg) {
  const groups = new Map<string, { _id: string; name: string }[]>();
  for (const r of m.reactions ?? []) {
    const users = groups.get(r.emoji) ?? [];
    users.push({ _id: String(r.user), name: r.name });
    groups.set(r.emoji, users);
  }
  return {
    _id: String(m._id),
    sender: String(m.sender),
    senderName: m.senderName,
    body: m.body,
    reactions: [...groups].map(([emoji, users]) => ({ emoji, users })),
    createdAt: m.createdAt,
  };
}
/** Unread counts stop here (shown as "99+"). */
export const UNREAD_CAP = 99;

type Conv = ChatConversationFields & { _id: Types.ObjectId };

/** The team channel, created the first time anyone opens chat. */
export async function teamConversation() {
  return (await ChatConversation.findOneAndUpdate(
    { key: "team" },
    { $setOnInsert: { kind: "team", key: "team", members: [] } },
    { upsert: true, new: true }
  ).lean<Conv>())!;
}

export const directKey = (a: Types.ObjectId, b: Types.ObjectId) => `dm:${[String(a), String(b)].sort().join(":")}`;

/** The direct conversation between two accounts (created on first use). */
export async function directConversation(a: Types.ObjectId, b: Types.ObjectId) {
  const key = directKey(a, b);
  return (await ChatConversation.findOneAndUpdate(
    { key },
    { $setOnInsert: { kind: "direct", key, members: [a, b] } },
    { upsert: true, new: true }
  ).lean<Conv>())!;
}

/** A conversation the account may read and write: the team channel, or a direct one it is part of. */
export async function conversationFor(user: UserDoc, id: Types.ObjectId) {
  const c = await ChatConversation.findById(id).lean<Conv>();
  if (!c || (c.kind === "direct" && !c.members.some((m) => m.equals(user._id)))) throw new HttpError(404, "Conversation not found");
  return c;
}

/** Marks everything in the conversation up to now as read by the account. */
export function markRead(conversation: Types.ObjectId, user: Types.ObjectId, at = new Date()) {
  return ChatRead.updateOne({ conversation, user }, { $max: { at } }, { upsert: true });
}
