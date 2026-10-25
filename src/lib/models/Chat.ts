import { Schema, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/** A chat: the whole-team channel (one, key "team") or a direct conversation between two accounts. */
const ChatConversationSchema = new Schema(
  {
    kind: { type: String, enum: ["team", "direct"], required: true },
    /** "team", or "dm:<id>:<id>" with the two account ids sorted, so each pair has one conversation. */
    key: { type: String, required: true, unique: true },
    /** The two accounts of a direct conversation (empty for the team channel: every approved account). */
    members: { type: [{ type: Types.ObjectId, ref: "User" }], default: [], index: true },
    lastMessageAt: { type: Date, default: null },
    lastMessage: { body: { type: String, default: "" }, sender: { type: Types.ObjectId, ref: "User", default: null }, senderName: { type: String, default: "" } },
  },
  { timestamps: true }
);

export type ChatConversationFields = {
  kind: "team" | "direct";
  key: string;
  members: Types.ObjectId[];
  lastMessageAt: Date | null;
  lastMessage: { body: string; sender: Types.ObjectId | null; senderName: string };
  createdAt: Date;
  updatedAt: Date;
};
export const ChatConversation: Model<ChatConversationFields> = defineModel("ChatConversation", ChatConversationSchema);

const ChatMessageSchema = new Schema(
  {
    conversation: { type: Types.ObjectId, ref: "ChatConversation", required: true },
    sender: { type: Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, default: "" },
    body: { type: String, required: true },
    /** One entry per account per emoji, in the order they were added. */
    reactions: {
      type: [
        {
          _id: false,
          emoji: { type: String, required: true },
          user: { type: Types.ObjectId, ref: "User", required: true },
          name: { type: String, default: "" },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);
ChatMessageSchema.index({ conversation: 1, createdAt: -1 });
// Polling picks up reactions on older messages by updatedAt.
ChatMessageSchema.index({ conversation: 1, updatedAt: -1 });

export type ChatReaction = { emoji: string; user: Types.ObjectId; name: string };
export type ChatMessageFields = {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  senderName: string;
  body: string;
  reactions: ChatReaction[];
  createdAt: Date;
  updatedAt: Date;
};
export const ChatMessage: Model<ChatMessageFields> = defineModel("ChatMessage", ChatMessageSchema);

/** How far each account has read each conversation (messages after `at` are unread). */
const ChatReadSchema = new Schema(
  {
    conversation: { type: Types.ObjectId, ref: "ChatConversation", required: true },
    user: { type: Types.ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
ChatReadSchema.index({ user: 1, conversation: 1 }, { unique: true });

export type ChatReadFields = { conversation: Types.ObjectId; user: Types.ObjectId; at: Date };
export const ChatRead: Model<ChatReadFields> = defineModel("ChatRead", ChatReadSchema);
