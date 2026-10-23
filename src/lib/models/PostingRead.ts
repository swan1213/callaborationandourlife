import { Schema, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/** A job posting link a user has opened (per user, across devices). */
const PostingReadSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true },
    /** Normalised URL (lib/postingReads.ts) so the same posting matches everywhere. */
    urlKey: { type: String, required: true },
    url: { type: String, default: "" },
    readAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
PostingReadSchema.index({ user: 1, urlKey: 1 }, { unique: true });

export type PostingReadFields = { user: Types.ObjectId; urlKey: string; url: string; readAt: Date };
export const PostingRead: Model<PostingReadFields> = defineModel("PostingRead", PostingReadSchema);
