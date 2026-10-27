import { after, NextResponse } from "next/server";
import { handler, HttpError, quietHandler, requireUser } from "@/lib/auth";
import { ChatConversation, ChatMessage, ChatRead, ChatTyping, type ChatImage, type ChatReply } from "@/lib/models/Chat";
import { User } from "@/lib/models/User";
import { Application } from "@/lib/models/Application";
import { conversationFor, markRead, MAX_IMAGES, MAX_MESSAGE, messageOut, preview, type ChatMsg as Msg } from "@/lib/chat";
import { notifyChatMessage } from "@/lib/chatNotify";
import { isOurCloudinaryUrl } from "@/lib/cloudinary";
import { oid } from "@/lib/query";
import type { Types } from "mongoose";

type Ctx = { params: Promise<{ id: string }> };

const PAGE = 50;
/** `now` is sent back this much early, so a reaction saved by a server with a slightly different clock isn't missed. */
const CLOCK_SLACK_MS = 10_000;
/** A "typing" ping counts this long (the page sends one every few seconds while someone types). */
const TYPING_MS = 6_000;
const URL_RE = /https?:\/\/[^\s<>"]+/g;

function when(v: string | null, name: string) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Invalid ${name}`);
  return d;
}

/** Company and title for job links in these messages that someone already generated an application from. */
async function linkInfo(messages: Msg[]) {
  const urls = [...new Set(messages.flatMap((m) => (m.deletedAt ? [] : (m.body.match(URL_RE) ?? []))))].slice(0, 100);
  if (!urls.length) return {};
  const apps = await Application.find({ jobUrl: { $in: urls }, status: { $ne: "not_generated" } })
    .sort({ createdAt: -1 })
    .select("jobUrl company jobTitle")
    .lean<{ jobUrl: string; company?: string; jobTitle?: string }[]>();
  const info: Record<string, { company: string; jobTitle: string }> = {};
  for (const a of apps) if (!info[a.jobUrl] && (a.company || a.jobTitle)) info[a.jobUrl] = { company: a.company ?? "", jobTitle: a.jobTitle ?? "" };
  return info;
}

/**
 * GET — messages, oldest first, and marks the conversation read.
 * `?after=ISO` returns messages from then on (polling; the client drops ones it already has);
 * `?before=ISO` the 50 before then (older history); neither: the latest 50.
 * With `after`, `?changed=ISO` (the `now` of the previous response) also returns older messages that changed since
 * then (reactions, edits, deletions); the client replaces those in place.
 * Also: how far everyone else has read, who is typing, the pinned messages, and job link details.
 */
export const GET = quietHandler(async (req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const c = await conversationFor(me, oid((await params).id));
  const sp = new URL(req.url).searchParams;
  const afterAt = when(sp.get("after"), "after");
  const before = when(sp.get("before"), "before");
  const changed = when(sp.get("changed"), "changed");
  const now = new Date(Date.now() - CLOCK_SLACK_MS);

  let messages: Msg[];
  let hasMore = false;
  if (afterAt) {
    const recent = { createdAt: { $gte: afterAt } };
    messages = await ChatMessage.find({ conversation: c._id, ...(changed ? { $or: [recent, { updatedAt: { $gte: changed } }] } : recent) })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean<Msg[]>();
  } else {
    const found = await ChatMessage.find({ conversation: c._id, ...(before ? { createdAt: { $lt: before } } : {}) })
      .sort({ createdAt: -1 })
      .limit(PAGE + 1)
      .lean<Msg[]>();
    hasMore = found.length > PAGE;
    messages = found.slice(0, PAGE).reverse();
  }
  await markRead(c._id, me._id);
  // How far everyone else has read (read receipts: avatars under the last message each person has read).
  const [readRows, typingRows, links] = await Promise.all([
    ChatRead.find({ conversation: c._id, user: { $ne: me._id } }).select("user at").lean<{ user: Types.ObjectId; at: Date }[]>(),
    ChatTyping.find({ conversation: c._id, user: { $ne: me._id }, at: { $gte: new Date(Date.now() - TYPING_MS) } }).select("user name").lean<{ user: Types.ObjectId; name: string }[]>(),
    linkInfo(messages),
  ]);
  const readers = new Map(
    (await User.find({ _id: { $in: readRows.map((r) => r.user) } }).select("name avatar").lean<{ _id: Types.ObjectId; name: string; avatar?: string }[]>()).map((u) => [String(u._id), u])
  );
  const reads = readRows.flatMap((r) => {
    const u = readers.get(String(r.user));
    return u ? [{ user: String(r.user), name: u.name, avatar: u.avatar ?? "", at: r.at }] : [];
  });

  const otherId = c.members.find((m) => !m.equals(me._id));
  const other = otherId ? await User.findById(otherId).select("name avatar role").lean() : null;
  return NextResponse.json(
    {
      conversation: {
        _id: String(c._id),
        kind: c.kind,
        name: c.kind === "team" ? "Team chat" : c.kind === "reports" ? "Daily reports" : (other?.name ?? "Deleted account"),
        other: c.kind === "direct" ? { _id: String(otherId ?? ""), name: other?.name ?? "Deleted account", avatar: other?.avatar ?? "", role: other?.role ?? "" } : null,
        pinned: (c.pinned ?? []).map((p) => ({ _id: String(p.message), body: p.body, senderName: p.senderName, pinnedBy: p.pinnedBy, pinnedAt: p.pinnedAt })),
      },
      messages: messages.map(messageOut),
      hasMore,
      now,
      reads,
      typing: typingRows.map((t) => ({ _id: String(t.user), name: t.name })),
      links,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
});

/**
 * POST { body, images?, replyTo?, mentions? } — sends a message.
 * images: [{ url, publicId, width, height }] uploaded to our Cloudinary; replyTo: a message id in this conversation;
 * mentions: account ids picked from the @ list, plus "admins" for every admin (kept only when "@Name" / "@admins"
 * is still in the text).
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const c = await conversationFor(me, oid((await params).id));
  const b = await req.json().catch(() => ({}));
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (body.length > MAX_MESSAGE) throw new HttpError(400, `Messages can be at most ${MAX_MESSAGE} characters`);

  const images: ChatImage[] = (Array.isArray(b?.images) ? b.images : [])
    .filter((i: { url?: unknown }) => typeof i?.url === "string" && isOurCloudinaryUrl(i.url))
    .slice(0, MAX_IMAGES)
    .map((i: { url: string; publicId?: unknown; width?: unknown; height?: unknown }) => ({
      url: i.url,
      publicId: typeof i.publicId === "string" ? i.publicId : "",
      ...(Number.isFinite(i.width) ? { width: Number(i.width) } : {}),
      ...(Number.isFinite(i.height) ? { height: Number(i.height) } : {}),
    }));
  if (!body && !images.length) throw new HttpError(400, "Write a message or add an image first");

  let replyTo: ChatReply | null = null;
  if (b?.replyTo) {
    const original = await ChatMessage.findOne({ _id: oid(String(b.replyTo), "replyTo"), conversation: c._id, deletedAt: null }).lean<Msg>();
    if (original) replyTo = { message: original._id, senderName: original.senderName, body: preview(original, 140), image: !!original.images?.length };
  }

  // Mentions (team chat): accounts picked from the @ list whose "@Name" is still in the text, and "@admins".
  let mentioned: { _id: Types.ObjectId; name: string }[] = [];
  if (c.kind === "team" && body.includes("@")) {
    const ids = (Array.isArray(b?.mentions) ? b.mentions : []).filter((x: unknown): x is string => typeof x === "string" && /^[a-f\d]{24}$/i.test(x));
    const lower = body.toLowerCase();
    const picked = await User.find({ _id: { $in: ids }, status: "approved" }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>();
    mentioned = picked.filter((u) => lower.includes(`@${u.name.toLowerCase()}`));
    if (/@admins\b/i.test(body)) {
      const admins = await User.find({ role: "admin", status: "approved" }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>();
      mentioned = [...mentioned, ...admins.filter((a) => !mentioned.some((m) => m._id.equals(a._id)))];
    }
  }

  const m = (
    await ChatMessage.create({
      conversation: c._id,
      sender: me._id,
      senderName: me.name,
      body,
      images,
      replyTo,
      mentions: mentioned.map((u) => ({ user: u._id, name: u.name })),
    })
  ).toObject() as Msg;
  await Promise.all([
    ChatConversation.updateOne({ _id: c._id }, { $set: { lastMessageAt: m.createdAt, lastMessage: { body: preview(m), sender: me._id, senderName: me.name } } }),
    markRead(c._id, me._id, m.createdAt),
    ChatTyping.deleteOne({ conversation: c._id, user: me._id }),
  ]);
  after(() => notifyChatMessage({ conversation: c, sender: me, text: preview(m, 140), mentioned: mentioned.map((u) => u._id) }));
  return NextResponse.json({ message: messageOut(m) });
});
