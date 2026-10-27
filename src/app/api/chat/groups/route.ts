import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { handler, requireUser } from "@/lib/auth";
import { ChatConversation, ChatRead } from "@/lib/models/Chat";
import { groupMembers, groupName, notifyAdded } from "@/lib/chatGroups";

/** POST { name, members } — (admins) makes a group chat with these accounts; the admin making it is always in it. */
export const POST = handler(async (req: Request) => {
  const me = await requireUser("admin");
  const b = await req.json().catch(() => ({}));
  const name = groupName(b?.name);
  const added = await groupMembers(b?.members, me._id);
  const id = new Types.ObjectId();
  const c = await ChatConversation.create({ _id: id, kind: "group", key: `group:${id}`, name, members: [me._id, ...added], createdBy: me._id });
  // Starts read for everyone, so a new group isn't "unread" before anyone writes.
  const now = new Date();
  await ChatRead.insertMany([me._id, ...added].map((user) => ({ conversation: c._id, user, at: now })));
  await notifyAdded(added, me.name, c);
  return NextResponse.json({ _id: String(c._id) });
});
