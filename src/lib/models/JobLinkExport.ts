import { Schema, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/** A job link downloaded from the Job links page (TXT/CSV export), once per link across all staff. */
const JobLinkExportSchema = new Schema(
  {
    /** lib/links.ts urlKey, so the same posting matches however it was pasted. */
    urlKey: { type: String, required: true, unique: true },
    url: { type: String, default: "" },
    firstExportedAt: { type: Date, default: Date.now },
    exportedAt: { type: Date, default: Date.now },
    exportedBy: { type: Types.ObjectId, ref: "User", default: null },
    /** How many downloads included this link. */
    count: { type: Number, default: 0 },
  },
  { timestamps: false }
);

export type JobLinkExportFields = { urlKey: string; url: string; firstExportedAt: Date; exportedAt: Date; exportedBy: Types.ObjectId | null; count: number };
export const JobLinkExport: Model<JobLinkExportFields> = defineModel("JobLinkExport", JobLinkExportSchema);

/** Records that these links were just downloaded by `by`. */
export async function markExported(links: { url: string; urlKey: string }[], by: Types.ObjectId) {
  if (!links.length) return;
  const now = new Date();
  await JobLinkExport.bulkWrite(
    links.map((l) => ({
      updateOne: {
        filter: { urlKey: l.urlKey },
        update: { $set: { url: l.url, exportedAt: now, exportedBy: by }, $setOnInsert: { firstExportedAt: now }, $inc: { count: 1 } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}
