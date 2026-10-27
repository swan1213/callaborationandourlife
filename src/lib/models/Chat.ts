import { Schema, type Model, Types } from "mongoose";
import { defineModel } from "./define";
import type { WorkReport } from "../workReport";

/**
 * A chat: the whole-team channel (one, key "team"), a direct conversation between two accounts, or the admins-only
 * daily reports channel (one, key "reports"; lib/memberReports.ts posts each member's report there every evening).
 */
const ChatConversationSchema = new Schema(
  {
    kind: { type: String, enum: ["team", "direct", "reports"], required: true },
    /** "team", or "dm:<id>:<id>" with the two account ids sorted, so each pair has one conversation. */
    key: { type: String, required: true, unique: true },
    /** The two accounts of a direct conversation (empty for the team channel: every approved account). */
    members: { type: [{ type: Types.ObjectId, ref: "User" }], default: [], index: true },
    lastMessageAt: { type: Date, default: null },
    lastMessage: { body: { type: String, default: "" }, sender: { type: Types.ObjectId, ref: "User", default: null }, senderName: { type: String, default: "" } },
    /** Messages admins pinned to the top of the team chat (newest first; a snapshot, so a later edit doesn't change it). */
    pinned: {
      type: [
        {
          _id: false,
          message: { type: Types.ObjectId, ref: "ChatMessage", required: true },
          body: { type: String, default: "" },
          senderName: { type: String, default: "" },
          pinnedBy: { type: String, default: "" },
          pinnedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export type ChatConversationFields = {
  kind: "team" | "direct" | "reports";
  key: string;
  members: Types.ObjectId[];
  lastMessageAt: Date | null;
  lastMessage: { body: string; sender: Types.ObjectId | null; senderName: string };
  pinned: ChatPin[];
  createdAt: Date;
  updatedAt: Date;
};
export const ChatConversation: Model<ChatConversationFields> = defineModel("ChatConversation", ChatConversationSchema);

const ChatMessageSchema = new Schema(
  {
    conversation: { type: Types.ObjectId, ref: "ChatConversation", required: true },
    sender: { type: Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, default: "" },
    /** Text; may be empty when the message is only images. */
    body: { type: String, default: "" },
    /** Pasted or attached images (Cloudinary). */
    images: {
      type: [{ _id: false, url: { type: String, required: true }, publicId: { type: String, default: "" }, width: Number, height: Number }],
      default: [],
    },
    /** The message this one answers: a snapshot, so the quote stays readable if the original changes. */
    replyTo: {
      type: { _id: false, message: { type: Types.ObjectId, ref: "ChatMessage" }, senderName: String, body: String, image: Boolean },
      default: null,
    },
    /** Accounts @mentioned (already notified). */
    mentions: { type: [{ _id: false, user: { type: Types.ObjectId, ref: "User" }, name: String }], default: [] },
    editedAt: { type: Date, default: null },
    /** Deleted messages stay as a "message deleted" line; their text and images are removed. */
    deletedAt: { type: Date, default: null },
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
    /** Set on a forwarded copy: who wrote the original (the first author when it was forwarded again) and when. */
    forwarded: { type: { _id: false, senderName: String, at: Date }, default: null },
    /** An automatic daily report (lib/workReport.ts WorkReport), shown as a card; `body` holds the same as text. */
    report: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);
ChatMessageSchema.index({ conversation: 1, createdAt: -1 });
// Polling picks up reactions on older messages by updatedAt.
ChatMessageSchema.index({ conversation: 1, updatedAt: -1 });

export type ChatReaction = { emoji: string; user: Types.ObjectId; name: string };
export type ChatImage = { url: string; publicId: string; width?: number; height?: number };
export type ChatReply = { message: Types.ObjectId; senderName: string; body: string; image: boolean };
export type ChatPin = { message: Types.ObjectId; body: string; senderName: string; pinnedBy: string; pinnedAt: Date };
export type ChatMessageFields = {
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  senderName: string;
  body: string;
  images: ChatImage[];
  replyTo: ChatReply | null;
  mentions: { user: Types.ObjectId; name: string }[];
  report?: WorkReport | null;
  forwarded?: { senderName: string; at: Date } | null;
  editedAt: Date | null;
  deletedAt: Date | null;
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

/** "Is typing" pings (one per account per conversation); they expire by themselves a minute later. */
const ChatTypingSchema = new Schema(
  {
    conversation: { type: Types.ObjectId, ref: "ChatConversation", required: true },
    user: { type: Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
ChatTypingSchema.index({ conversation: 1, user: 1 }, { unique: true });
ChatTypingSchema.index({ at: 1 }, { expireAfterSeconds: 60 });

export type ChatTypingFields = { conversation: Types.ObjectId; user: Types.ObjectId; name: string; at: Date };
export const ChatTyping: Model<ChatTypingFields> = defineModel("ChatTyping", ChatTypingSchema);
