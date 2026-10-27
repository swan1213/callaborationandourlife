// Alerts for chat messages, sent after the message is saved (never fails the send):
// - @mentions in the team chat or a group: a notification in the bell, pushed to the browsers that turned Desktop alerts on;
// - direct messages and groups: a desktop push to the other members, unless they are reading that conversation right now.
import type { Types } from "mongoose";
import { notify } from "./inbox";
import { ChatRead } from "./models/Chat";
import { sendPush } from "./push";

/** Someone whose chat page polled this conversation this recently is reading it: no push. */
const READING_MS = 10_000;

export async function notifyChatMessage(o: {
  conversation: { _id: Types.ObjectId; kind: "team" | "direct" | "group" | "reports"; members: Types.ObjectId[]; name?: string };
  sender: { _id: Types.ObjectId; name: string };
  text: string;
  mentioned: Types.ObjectId[];
}) {
  const url = `/chat?c=${o.conversation._id}`;
  const where = o.conversation.kind === "group" ? o.conversation.name || "a group" : "Team chat";
  try {
    const mentioned = o.mentioned.filter((u) => !u.equals(o.sender._id));
    if (mentioned.length)
      await notify(mentioned, { kind: "chat-mention", title: `${o.sender.name} mentioned you in ${where}`, body: o.text, url, tag: `chat-mention-${o.conversation._id}` });

    if (o.conversation.kind !== "direct" && o.conversation.kind !== "group") return;
    // Everyone else in the chat (the mentioned already got the notification above) who isn't reading it right now.
    const others = o.conversation.members.filter((m) => !m.equals(o.sender._id) && !mentioned.some((x) => x.equals(m)));
    if (!others.length) return;
    const reading = await ChatRead.find({ conversation: o.conversation._id, user: { $in: others }, at: { $gte: new Date(Date.now() - READING_MS) } })
      .select("user")
      .lean<{ user: Types.ObjectId }[]>();
    const to = others.filter((m) => !reading.some((r) => r.user.equals(m))).map(String);
    if (to.length)
      await sendPush(to, {
        title: o.conversation.kind === "group" ? `${o.sender.name} in ${where}` : o.sender.name,
        body: o.text,
        url,
        tag: `chat-${o.conversation._id}`,
      });
  } catch (e) {
    console.error("chat alert failed", e);
  }
}
