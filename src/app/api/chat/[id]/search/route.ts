import { NextResponse } from "next/server";
import { quietHandler, requireUser } from "@/lib/auth";
import { ChatMessage } from "@/lib/models/Chat";
import { conversationFor, messageOut, type ChatMsg } from "@/lib/chat";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** GET ?q= — the 30 newest messages in this conversation whose text or sender matches (links included). */
export const GET = quietHandler(async (req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const c = await conversationFor(me, oid((await params).id));
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const re = new RegExp(esc(q), "i");
  const found = await ChatMessage.find({ conversation: c._id, deletedAt: null, $or: [{ body: re }, { senderName: re }] })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean<ChatMsg[]>();
  return NextResponse.json({ results: found.map(messageOut) }, { headers: { "Cache-Control": "no-store" } });
});
