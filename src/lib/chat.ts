// Team chat: one channel for every approved account, direct conversations between two accounts, and the admins-only
// Daily reports channel (lib/memberReports.ts).
// The page (app/(app)/chat) and the header button poll the API; there is no socket.
import { Types } from "mongoose";
import { HttpError } from "./auth";
import { ChatConversation, ChatRead, type ChatConversationFields, type ChatMessageFields } from "./models/Chat";
import type { UserDoc } from "./models/User";

export const MAX_MESSAGE = 4000;
/** Different emoji one message can collect. */
export const MAX_REACTION_KINDS = 20;

export type ChatMsg = ChatMessageFields & { _id: Types.ObjectId };

/** Your own messages can be edited for this long after sending. */
export const EDIT_WINDOW_MS = 15 * 60_000;
/** Images per message. */
export const MAX_IMAGES = 6;
/** Pinned messages kept on the team chat. */
export const MAX_PINS = 5;

/** One line for previews (conversation list, pins, replies, notifications): the text, or "📷 Photo". */
export function preview(m: { body?: string; images?: unknown[]; deletedAt?: Date | null }, max = 200) {
  if (m.deletedAt) return "Message deleted";
  const text = (m.body ?? "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, max);
  return m.images?.length ? (m.images.length > 1 ? `📷 ${m.images.length} photos` : "📷 Photo") : "";
}

/** A message as the API sends it: reactions grouped by emoji (first added first), with who added each. */
export function messageOut(m: ChatMsg) {
  const groups = new Map<string, { _id: string; name: string }[]>();
  const deleted = !!m.deletedAt;
  for (const r of deleted ? [] : (m.reactions ?? [])) {
    const users = groups.get(r.emoji) ?? [];
    users.push({ _id: String(r.user), name: r.name });
    groups.set(r.emoji, users);
  }
  return {
    _id: String(m._id),
    sender: String(m.sender),
    senderName: m.senderName,
    body: deleted ? "" : (m.body ?? ""),
    images: deleted ? [] : (m.images ?? []).map((i) => ({ url: i.url, width: i.width ?? null, height: i.height ?? null })),
    replyTo: !deleted && m.replyTo?.message ? { _id: String(m.replyTo.message), senderName: m.replyTo.senderName, body: m.replyTo.body, image: !!m.replyTo.image } : null,
    mentions: deleted ? [] : (m.mentions ?? []).map((x) => ({ _id: String(x.user), name: x.name })),
    reactions: [...groups].map(([emoji, users]) => ({ emoji, users })),
    report: deleted ? null : (m.report ?? null),
    forwarded: !deleted && m.forwarded?.senderName ? { senderName: m.forwarded.senderName, at: m.forwarded.at } : null,
    edited: !!m.editedAt,
    deleted,
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

/** The admins-only channel the daily member reports are posted to (created on first use). */
export async function reportsConversation() {
  return (await ChatConversation.findOneAndUpdate(
    { key: "reports" },
    { $setOnInsert: { kind: "reports", key: "reports", members: [] } },
    { upsert: true, returnDocument: "after" }
  ).lean<Conv>())!;
}

/** A conversation the account may read and write: the team channel, a direct one it is part of, or (admins) the reports. */
export async function conversationFor(user: UserDoc, id: Types.ObjectId) {
  const c = await ChatConversation.findById(id).lean<Conv>();
  if (!c || (c.kind === "direct" && !c.members.some((m) => m.equals(user._id))) || (c.kind === "reports" && user.role !== "admin"))
    throw new HttpError(404, "Conversation not found");
  return c;
}

/** Marks everything in the conversation up to now as read by the account. */
export function markRead(conversation: Types.ObjectId, user: Types.ObjectId, at = new Date()) {
  return ChatRead.updateOne({ conversation, user }, { $max: { at } }, { upsert: true });
}
