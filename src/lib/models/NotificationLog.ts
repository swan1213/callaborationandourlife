import { Schema, type Model } from "mongoose";
import { defineModel } from "./define";

/** One row per sent notification/report; the unique key makes every send idempotent. */
const NotificationLogSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    kind: { type: String, enum: ["milestone-profile", "milestone-user", "daily-report", "interview-digest", "interview-reminder", "interview-report"], required: true },
    recipients: { type: [String], default: [] },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const NotificationLog: Model<{ key: string; kind: string; recipients: string[]; meta?: unknown }> =
  defineModel("NotificationLog", NotificationLogSchema);

/** Returns true if this key was claimed now (i.e. the caller should send). */
export async function claim(key: string, kind: string, meta?: unknown) {
  try {
    await NotificationLog.create({ key, kind, meta });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false;
    throw e;
  }
}
