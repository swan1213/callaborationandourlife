import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/**
 * A stretch of active work: TailorBid or the Interview Assistant open and in use (lib/presence.ts).
 * Extended by each heartbeat; a new one starts after a gap. Work Time adds them up per day.
 */
const WorkSessionSchema = new Schema({
  user: { type: Types.ObjectId, ref: "User", required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
});
WorkSessionSchema.index({ user: 1, end: -1 });
WorkSessionSchema.index({ start: 1 });

export type WorkSessionFields = InferSchemaType<typeof WorkSessionSchema>;
export const WorkSession: Model<WorkSessionFields> = defineModel("WorkSession", WorkSessionSchema);
