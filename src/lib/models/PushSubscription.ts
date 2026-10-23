import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A browser that turned on Desktop alerts (lib/push.ts): where to send web push notifications for one person,
 * so they arrive even when TailorBid is closed. One per browser; removed when the browser drops it.
 */
const PushSubscriptionSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
    lastSuccessAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type PushSubscriptionFields = InferSchemaType<typeof PushSubscriptionSchema>;
export const PushSubscription: Model<PushSubscriptionFields> = defineModel("PushSubscription", PushSubscriptionSchema);
