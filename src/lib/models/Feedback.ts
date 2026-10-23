import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/** Feedback any user sends to the administrators, with optional screenshots and admin replies. */
const FeedbackSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, default: "" },
    userEmail: { type: String, default: "" },
    role: { type: String, default: "" },
    category: { type: String, enum: ["bug", "idea", "question", "other"], default: "other" },
    subject: { type: String, required: true, trim: true },
    message: { type: String, default: "" },
    screenshots: { type: [{ url: String, publicId: String }], default: [] },
    status: { type: String, enum: ["new", "in_progress", "resolved"], default: "new", index: true },
    replies: {
      type: [{ by: { type: Types.ObjectId, ref: "User" }, byName: String, message: String, at: { type: Date, default: Date.now } }],
      default: [],
    },
    /** First time an admin opened it. */
    seenAt: Date,
  },
  { timestamps: true }
);
FeedbackSchema.index({ createdAt: -1 });

export type FeedbackFields = InferSchemaType<typeof FeedbackSchema>;
export const Feedback: Model<FeedbackFields> = defineModel("Feedback", FeedbackSchema);
