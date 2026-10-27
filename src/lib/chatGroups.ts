// Group chats: only admins make them and manage their members (app/api/chat/groups, app/api/chat/[id]/group).
import { Types } from "mongoose";
import { HttpError } from "./auth";
import { notify } from "./inbox";
import { User } from "./models/User";

export const MAX_GROUP_NAME = 60;
export const MAX_GROUP_MEMBERS = 100;

/** A trimmed group name, or a 400. */
export function groupName(raw: unknown) {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new HttpError(400, "Give the group a name");
  if (name.length > MAX_GROUP_NAME) throw new HttpError(400, `Group names can be at most ${MAX_GROUP_NAME} characters`);
  return name;
}

/** The approved accounts among `raw` (account ids), without `except`. */
export async function groupMembers(raw: unknown, except?: Types.ObjectId) {
  const ids = [...new Set((Array.isArray(raw) ? raw : []).filter((x): x is string => typeof x === "string" && /^[a-f\d]{24}$/i.test(x)))]
    .filter((x) => !except || x !== String(except))
    .slice(0, MAX_GROUP_MEMBERS);
  const users = await User.find({ _id: { $in: ids }, status: "approved" }).select("_id").lean<{ _id: Types.ObjectId }[]>();
  return users.map((u) => u._id);
}

/** Tells the people just added to a group (bell notification and desktop alert). */
export async function notifyAdded(users: Types.ObjectId[], byName: string, group: { _id: Types.ObjectId; name?: string }) {
  if (!users.length) return;
  await notify(users, {
    kind: "chat-group",
    title: `${byName} added you to ${group.name || "a group"}`,
    body: "Open Chat to see the group.",
    url: `/chat?c=${group._id}`,
    tag: `chat-group-${group._id}`,
  }).catch((e) => console.error("group notice failed", e));
}
