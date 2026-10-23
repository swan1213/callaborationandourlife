import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/**
 * An in-app notification about something that happened (lib/inbox.ts): an interview booked, a result reported,
 * an account approved… One per recipient. Shown with admins' messages in the bell and on Notifications.
 */
const NoticeSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true },
    /** What happened, for the icon (see components/Notifications.tsx KIND_ICON). */
    kind: { type: String, required: true },
    /** info · success · warning · danger: the color of the icon. */
    tone: { type: String, enum: ["info", "success", "warning", "danger"], default: "info" },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    /** Page to open, e.g. "/caller/requests?id=…". */
    url: { type: String, default: "" },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
NoticeSchema.index({ user: 1, createdAt: -1 });
// Old notifications are removed after six months.
NoticeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export type NoticeFields = InferSchemaType<typeof NoticeSchema>;
export const Notice: Model<NoticeFields> = defineModel("Notice", NoticeSchema);
