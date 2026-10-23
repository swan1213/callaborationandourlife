import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/** A notification an admin sends to people and/or role groups; shown in-app and optionally emailed. */
const MessageSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "" },
    images: { type: [{ url: String, publicId: String }], default: [] },
    /** What the admin picked (shown on the sent list). */
    audience: {
      roles: { type: [String], default: [] }, // "admin" | "user" | "bidder" | "caller"
      users: [{ type: Types.ObjectId, ref: "User" }],
    },
    /** Everyone it was delivered to, resolved when sent. */
    recipients: { type: [{ type: Types.ObjectId, ref: "User" }], default: [], index: true },
    email: { type: Boolean, default: false },
    emailedCount: { type: Number, default: 0 },
    sender: { type: Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, default: "" },
  },
  { timestamps: true }
);
MessageSchema.index({ createdAt: -1 });

export type MessageFields = InferSchemaType<typeof MessageSchema>;
export const Message: Model<MessageFields> = defineModel("Message", MessageSchema);

/** One row per (message, reader) the first time the recipient opens it. */
const MessageReadSchema = new Schema(
  {
    message: { type: Types.ObjectId, ref: "Message", required: true },
    user: { type: Types.ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
MessageReadSchema.index({ message: 1, user: 1 }, { unique: true });
MessageReadSchema.index({ user: 1 });

export const MessageRead: Model<InferSchemaType<typeof MessageReadSchema>> = defineModel("MessageRead", MessageReadSchema);
