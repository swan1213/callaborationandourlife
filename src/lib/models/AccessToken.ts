import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A key for the read-only external API (/api/v1): scheduled interviews, profiles, generated resumes.
 * Created by an admin; only a SHA-256 hash is stored (the key itself is shown once, when created).
 */
const AccessTokenSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** First characters of the key, shown in the list to tell keys apart. */
    prefix: { type: String, required: true },
    hash: { type: String, required: true, unique: true, select: false },
    createdBy: { type: Types.ObjectId, ref: "User" },
    createdByName: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedByName: { type: String, default: "" },
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: "" },
    useCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type AccessTokenFields = InferSchemaType<typeof AccessTokenSchema>;
export const AccessToken: Model<AccessTokenFields> = defineModel("AccessToken", AccessTokenSchema);
