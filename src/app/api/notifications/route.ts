import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { Message, MessageRead } from "@/lib/models/Message";
import { Notice } from "@/lib/models/Notice";

/**
 * The signed-in user's notifications (newest first) with read flags and the unread count. ?limit= (default 50).
 * Two kinds in one list: messages admins send (kind "message", with a sender) and events (lib/inbox.ts, with a link).
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const limit = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 50));
  // One parallel batch: this is polled by every open page, so each sequential round trip adds up.
  const [messages, messageTotal, reads, all, notices, noticeTotal, noticeUnread] = await Promise.all([
    Message.find({ recipients: user._id }).select("title body images senderName createdAt").sort({ createdAt: -1 }).limit(limit).lean(),
    Message.countDocuments({ recipients: user._id }),
    MessageRead.find({ user: user._id }).select("message").lean(),
    Message.find({ recipients: user._id }).select("_id").lean(),
    Notice.find({ user: user._id }).select("kind tone title body url readAt createdAt").sort({ createdAt: -1 }).limit(limit).lean(),
    Notice.countDocuments({ user: user._id }),
    Notice.countDocuments({ user: user._id, readAt: null }),
  ]);
  const readIds = new Set(reads.map((r) => String(r.message)));
  const items = [
    ...messages.map((m) => ({ ...m, _id: String(m._id), kind: "message", tone: "info", url: "", read: readIds.has(String(m._id)) })),
    ...notices.map((n) => ({ _id: String(n._id), kind: n.kind, tone: n.tone, title: n.title, body: n.body, url: n.url, images: [], senderName: "TailorBid", createdAt: n.createdAt, read: !!n.readAt })),
  ]
    .sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime())
    .slice(0, limit);
  return NextResponse.json({
    items,
    total: messageTotal + noticeTotal,
    unread: all.filter((m) => !readIds.has(String(m._id))).length + noticeUnread,
  });
});
