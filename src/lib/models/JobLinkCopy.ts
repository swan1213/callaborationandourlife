import { Schema, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/** A job link copied from the Job links page for a profile: one row per (profile, link). */
const JobLinkCopySchema = new Schema(
  {
    profile: { type: Types.ObjectId, ref: "Profile", required: true },
    /** lib/links.ts urlKey, so the same posting matches however it was pasted. */
    urlKey: { type: String, required: true },
    url: { type: String, default: "" },
    firstCopiedAt: { type: Date, default: Date.now },
    /** Last time it was copied for this profile, and by whom. */
    copiedAt: { type: Date, default: Date.now },
    copiedBy: { type: Types.ObjectId, ref: "User", default: null },
    /** How many copies included this link for this profile. */
    count: { type: Number, default: 0 },
  },
  { timestamps: false }
);
JobLinkCopySchema.index({ profile: 1, urlKey: 1 }, { unique: true });

export type JobLinkCopyFields = {
  profile: Types.ObjectId;
  urlKey: string;
  url: string;
  firstCopiedAt: Date;
  copiedAt: Date;
  copiedBy: Types.ObjectId | null;
  count: number;
};
export const JobLinkCopy: Model<JobLinkCopyFields> = defineModel("JobLinkCopy", JobLinkCopySchema);

/** Records that these links were just copied for `profile` by `by`. */
export async function markCopied(profile: Types.ObjectId, links: { url: string; urlKey: string }[], by: Types.ObjectId) {
  if (!links.length) return;
  const now = new Date();
  await JobLinkCopy.bulkWrite(
    links.map((l) => ({
      updateOne: {
        filter: { profile, urlKey: l.urlKey },
        update: { $set: { url: l.url, copiedAt: now, copiedBy: by }, $setOnInsert: { firstCopiedAt: now }, $inc: { count: 1 } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}
