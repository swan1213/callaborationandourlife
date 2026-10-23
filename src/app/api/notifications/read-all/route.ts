import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { Message, MessageRead } from "@/lib/models/Message";
import { Notice } from "@/lib/models/Notice";

/** Marks every notification read for the signed-in user (admin messages and event notices). */
export const POST = handler(async () => {
  const user = await requireUser();
  const ids = (await Message.find({ recipients: user._id }).select("_id").lean()).map((m) => m._id);
  const [, notices] = await Promise.all([
    ids.length
      ? MessageRead.bulkWrite(
          ids.map((message) => ({ updateOne: { filter: { message, user: user._id }, update: { $setOnInsert: { at: new Date() } }, upsert: true } })),
          { ordered: false }
        )
      : null,
    Notice.updateMany({ user: user._id, readAt: null }, { $set: { readAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true, count: ids.length + notices.modifiedCount });
});
