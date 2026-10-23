import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/** Audit trail: every change made through the API, downloads, server errors and sent emails. */
const ActivityLogSchema = new Schema(
  {
    level: { type: String, enum: ["info", "warn", "error"], default: "info", index: true },
    category: { type: String, default: "other", index: true },
    /** Stable action key, e.g. "PATCH /api/interviews/:id · accept". */
    action: { type: String, default: "" },
    /** Human-readable description. */
    summary: { type: String, default: "" },
    actor: { type: Types.ObjectId, ref: "User", default: null, index: true },
    actorName: { type: String, default: "" },
    actorEmail: { type: String, default: "" },
    actorRole: { type: String, default: "" },
    method: { type: String, default: "" },
    path: { type: String, default: "" },
    targetId: { type: String, default: "" },
    status: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    /** Sanitised request details (never passwords, secrets or keys). */
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
ActivityLogSchema.index({ createdAt: -1 });
// Keep a year of history.
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 86400, name: "ttl_createdAt" });

export type ActivityLogFields = InferSchemaType<typeof ActivityLogSchema>;
export const ActivityLog: Model<ActivityLogFields> = defineModel("ActivityLog", ActivityLogSchema);
