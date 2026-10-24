import { NextResponse } from "next/server";
import { handler, HttpError, quietHandler, requireUser } from "@/lib/auth";
import { ChatConversation, ChatMessage, type ChatMessageFields } from "@/lib/models/Chat";
import { User } from "@/lib/models/User";
import { conversationFor, markRead, MAX_MESSAGE } from "@/lib/chat";
import { oid } from "@/lib/query";
import type { Types } from "mongoose";

type Ctx = { params: Promise<{ id: string }> };
type Msg = ChatMessageFields & { _id: Types.ObjectId };

const PAGE = 50;
const out = (m: Msg) => ({ _id: String(m._id), sender: String(m.sender), senderName: m.senderName, body: m.body, createdAt: m.createdAt });

function when(v: string | null, name: string) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Invalid ${name}`);
  return d;
}

/**
 * GET — messages, oldest first, and marks the conversation read.
 * `?after=ISO` returns messages from then on (polling; the client drops ones it already has);
 * `?before=ISO` the 50 before then (older history); neither: the latest 50.
 */
export const GET = quietHandler(async (req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const c = await conversationFor(me, oid((await params).id));
  const sp = new URL(req.url).searchParams;
  const after = when(sp.get("after"), "after");
  const before = when(sp.get("before"), "before");

  let messages: Msg[];
  let hasMore = false;
  if (after) {
    messages = await ChatMessage.find({ conversation: c._id, createdAt: { $gte: after } }).sort({ createdAt: 1 }).limit(200).lean<Msg[]>();
  } else {
    const found = await ChatMessage.find({ conversation: c._id, ...(before ? { createdAt: { $lt: before } } : {}) })
      .sort({ createdAt: -1 })
      .limit(PAGE + 1)
      .lean<Msg[]>();
    hasMore = found.length > PAGE;
    messages = found.slice(0, PAGE).reverse();
  }
  await markRead(c._id, me._id);

  const otherId = c.members.find((m) => !m.equals(me._id));
  const other = otherId ? await User.findById(otherId).select("name avatar role").lean() : null;
  return NextResponse.json(
    {
      conversation: {
        _id: String(c._id),
        kind: c.kind,
        name: c.kind === "team" ? "Team chat" : (other?.name ?? "Deleted account"),
        other: c.kind === "direct" ? { _id: String(otherId ?? ""), name: other?.name ?? "Deleted account", avatar: other?.avatar ?? "", role: other?.role ?? "" } : null,
      },
      messages: messages.map(out),
      hasMore,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
});

/** POST { body } — sends a message. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const c = await conversationFor(me, oid((await params).id));
  const b = await req.json().catch(() => ({}));
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (!body) throw new HttpError(400, "Write a message first");
  if (body.length > MAX_MESSAGE) throw new HttpError(400, `Messages can be at most ${MAX_MESSAGE} characters`);

  const m = (await ChatMessage.create({ conversation: c._id, sender: me._id, senderName: me.name, body })).toObject() as Msg;
  await Promise.all([
    ChatConversation.updateOne(
      { _id: c._id },
      { $set: { lastMessageAt: m.createdAt, lastMessage: { body: body.slice(0, 200), sender: me._id, senderName: me.name } } }
    ),
    markRead(c._id, me._id, m.createdAt),
  ]);
  return NextResponse.json({ message: out(m) });
});
