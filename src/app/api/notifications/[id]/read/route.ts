import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Message, MessageRead } from "@/lib/models/Message";
import { Notice } from "@/lib/models/Notice";
import { oid } from "@/lib/query";

/** Marks one notification read for the signed-in user (an event notice, or an admin message; first read time is kept). */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = oid((await params).id);
  const notice = await Notice.updateOne({ _id: id, user: user._id, readAt: null }, { $set: { readAt: new Date() } });
  if (notice.matchedCount || (await Notice.exists({ _id: id, user: user._id }))) return NextResponse.json({ ok: true });
  if (!(await Message.exists({ _id: id, recipients: user._id }))) throw new HttpError(404, "Notification not found");
  await MessageRead.updateOne({ message: id, user: user._id }, { $setOnInsert: { at: new Date() } }, { upsert: true });
  return NextResponse.json({ ok: true });
});
