// Alerts for chat messages, sent after the message is saved (never fails the send):
// - @mentions in the team chat: a notification in the bell, pushed to the browsers that turned Desktop alerts on;
// - direct messages: a desktop push to the other person, unless they are reading that conversation right now.
import type { Types } from "mongoose";
import { notify } from "./inbox";
import { ChatRead } from "./models/Chat";
import { sendPush } from "./push";

/** Someone whose chat page polled this conversation this recently is reading it: no push. */
const READING_MS = 10_000;

export async function notifyChatMessage(o: {
  conversation: { _id: Types.ObjectId; kind: "team" | "direct"; members: Types.ObjectId[] };
  sender: { _id: Types.ObjectId; name: string };
  text: string;
  mentioned: Types.ObjectId[];
}) {
  const url = `/chat?c=${o.conversation._id}`;
  try {
    if (o.conversation.kind === "direct") {
      const other = o.conversation.members.find((m) => !m.equals(o.sender._id));
      if (!other) return;
      const read = await ChatRead.findOne({ conversation: o.conversation._id, user: other }).select("at").lean<{ at: Date }>();
      if (read && Date.now() - read.at.getTime() < READING_MS) return;
      await sendPush([String(other)], { title: o.sender.name, body: o.text, url, tag: `chat-${o.conversation._id}` });
      return;
    }
    const to = o.mentioned.filter((u) => !u.equals(o.sender._id));
    if (to.length)
      await notify(to, { kind: "chat-mention", title: `${o.sender.name} mentioned you in Team chat`, body: o.text, url, tag: `chat-mention-${o.conversation._id}` });
  } catch (e) {
    console.error("chat alert failed", e);
  }
}
