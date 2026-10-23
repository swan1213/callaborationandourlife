import { Schema, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/** "This viewer has opened this application" (per user; drives read/unread in the tables). */
const AppViewSchema = new Schema({
  user: { type: Types.ObjectId, ref: "User", required: true },
  application: { type: Types.ObjectId, ref: "Application", required: true },
  viewedAt: { type: Date, default: Date.now },
});
AppViewSchema.index({ user: 1, application: 1 }, { unique: true });

export type AppViewFields = { user: Types.ObjectId; application: Types.ObjectId; viewedAt: Date };
export const AppView: Model<AppViewFields> = defineModel("AppView", AppViewSchema);
