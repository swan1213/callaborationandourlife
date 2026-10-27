import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { HttpError, quietHandler, handler, requireUser } from "@/lib/auth";
import { ChatConversation, ChatMessage, ChatRead, ChatTyping, type ChatConversationFields } from "@/lib/models/Chat";
import { User } from "@/lib/models/User";
import { directConversation, reportsConversation, teamConversation, UNREAD_CAP } from "@/lib/chat";
import { oid } from "@/lib/query";

type Conv = ChatConversationFields & { _id: Types.ObjectId };

/**
 * GET — the account's conversations (team channel first, then for admins the daily reports, then direct ones by latest
 * message) with unread counts.
 * Polled by the header button and the chat page, so it stays out of the activity log.
 */
export const GET = quietHandler(async () => {
  const me = await requireUser();
  const [team, reports, directs] = await Promise.all([
    teamConversation(),
    me.role === "admin" ? reportsConversation() : null,
    ChatConversation.find({ kind: "direct", members: me._id, lastMessageAt: { $ne: null } }).sort({ lastMessageAt: -1 }).limit(200).lean<Conv[]>(),
  ]);
  const convs = [team, ...(reports ? [reports] : []), ...directs];

  const otherIds = directs.map((c) => c.members.find((m) => !m.equals(me._id))).filter((x): x is Types.ObjectId => !!x);
  const [others, reads, typingRows] = await Promise.all([
    User.find({ _id: { $in: otherIds } }).select("name avatar role").lean(),
    ChatRead.find({ user: me._id, conversation: { $in: convs.map((c) => c._id) } }).lean(),
    // Who is typing where (same 6 seconds as the conversation view), for "typing…" in the list.
    ChatTyping.find({ conversation: { $in: convs.map((c) => c._id) }, user: { $ne: me._id }, at: { $gte: new Date(Date.now() - 6_000) } })
      .select("conversation name")
      .lean<{ conversation: Types.ObjectId; name: string }[]>(),
  ]);
  const otherById = new Map(others.map((u) => [String(u._id), u]));
  const readAt = new Map(reads.map((r) => [String(r.conversation), r.at]));
  // Team messages from before the account existed don't count as unread.
  const floor = me.createdAt ?? new Date(0);

  const unread = await Promise.all(
    convs.map((c) =>
      !c.lastMessageAt || c.lastMessageAt <= (readAt.get(String(c._id)) ?? floor)
        ? 0
        : ChatMessage.countDocuments({ conversation: c._id, sender: { $ne: me._id }, createdAt: { $gt: readAt.get(String(c._id)) ?? floor } }, { limit: UNREAD_CAP })
    )
  );

  const conversations = convs.map((c, i) => {
    const otherId = c.members.find((m) => !m.equals(me._id));
    const other = otherId ? otherById.get(String(otherId)) : null;
    return {
      _id: String(c._id),
      kind: c.kind,
      name: c.kind === "team" ? "Team chat" : c.kind === "reports" ? "Daily reports" : (other?.name ?? "Deleted account"),
      other: c.kind === "direct" ? { _id: String(otherId ?? ""), name: other?.name ?? "Deleted account", avatar: other?.avatar ?? "", role: other?.role ?? "" } : null,
      lastMessage: c.lastMessageAt ? { body: c.lastMessage.body, senderName: c.lastMessage.senderName, mine: !!c.lastMessage.sender?.equals(me._id), at: c.lastMessageAt } : null,
      unread: unread[i],
      typing: typingRows.filter((t) => t.conversation.equals(c._id)).map((t) => t.name),
    };
  });
  return NextResponse.json(
    { me: String(me._id), conversations, unread: unread.reduce((t, n) => t + n, 0) },
    { headers: { "Cache-Control": "no-store" } }
  );
});

/** POST { userId } — opens (creating if needed) the direct conversation with another approved account. */
export const POST = handler(async (req: Request) => {
  const me = await requireUser();
  const b = await req.json().catch(() => ({}));
  const other = oid(b?.userId, "userId");
  if (other.equals(me._id)) throw new HttpError(400, "You can't start a conversation with yourself");
  if (!(await User.exists({ _id: other, status: "approved" }))) throw new HttpError(404, "Account not found");
  const c = await directConversation(me._id, other);
  return NextResponse.json({ _id: String(c._id) });
});
