import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./define";

/** An OpenAI API key managed in the database. Profiles reference one; usage is tracked per key. */
const ApiKeySchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    keyEnc: { type: String, required: true, select: false },
    keyMask: { type: String, default: "" },
    /** Default model for profiles using this key (a profile may override). */
    model: { type: String, default: "gpt-4o-mini" },
    /** Monthly token budget (prompt + completion); 0 = unlimited. */
    monthlyTokenLimit: { type: Number, default: 0, min: 0 },
    /** USD per 1M tokens, used to estimate spend. */
    inputPricePerM: { type: Number, default: 0.15, min: 0 },
    outputPricePerM: { type: Number, default: 0.6, min: 0 },
    /** Used by profiles that have no key selected. At most one key is default. */
    isDefault: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    notes: { type: String, default: "" },
    lastUsedAt: Date,
    lastError: { type: String, default: "" },
  },
  { timestamps: true }
);

export type ApiKeyFields = InferSchemaType<typeof ApiKeySchema>;
export const ApiKey: Model<ApiKeyFields> = defineModel("ApiKey", ApiKeySchema);
