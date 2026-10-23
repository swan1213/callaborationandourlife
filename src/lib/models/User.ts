import { Schema, type InferSchemaType, type HydratedDocument, type Model, Types } from "mongoose";
import { defineModel } from "./define";

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    /** admin = everything · user = admin-like access limited to managedProfiles · bidder = generates applications · caller = conducts interviews. */
    role: { type: String, enum: ["admin", "user", "bidder", "caller"], default: "bidder" },
    status: { type: String, enum: ["pending", "approved", "rejected", "suspended"], default: "pending" },
    /** Fee charged per submitted application (e.g. 0.07). Only bidders are charged. */
    feePerApplication: { type: Number, default: 0.07, min: 0 },
    /** Admin-only flag (never shown to the bidder): a trusted bidder may submit applications without a screenshot. */
    trusted: { type: Boolean, default: false },
    /** Bidders: may use the Interview Requests page (admins can switch it off per bidder). */
    interviewAccess: { type: Boolean, default: true },
    /** Bidders: how many job postings may wait for a manual paste ("not generated") before generating from URLs pauses. 0 = no limit. */
    manualLimit: { type: Number, default: 100, min: 0 },
    /** Bidders: profiles they generate with. Callers: profiles whose interview requests they handle. */
    assignedProfiles: [{ type: Types.ObjectId, ref: "Profile" }],
    /** Profiles a "user" (manager role) manages and receives reports/notifications for. */
    managedProfiles: [{ type: Types.ObjectId, ref: "Profile" }],
    lastLoginAt: Date,
    /** Newest release note (lib/releaseNotes.ts) this account has seen in What's new. */
    seenRelease: { type: String, default: "" },
    /** Presence (lib/presence.ts): last heartbeat from an open TailorBid tab or the Interview Assistant. */
    lastSeenAt: Date,
    /** Last mouse/keyboard input there (or a running interview in the assistant). */
    lastActiveAt: Date,
    /** Set when an admin issues a temporary password; cleared when the owner changes it. */
    mustChangePassword: { type: Boolean, default: false },
    /** IANA time zone for showing times (My Page); "" = the site time zone (EST). */
    timezone: { type: String, default: "" },
    /** "preset:<id>" (components/Avatar.tsx) or an uploaded photo URL; "" = initials. */
    avatar: { type: String, default: "" },
    /** Caller preferences (My Page): reminder lead time and when the next-day schedule is emailed. */
    callerSettings: {
      timezone: { type: String, default: "" }, // "" = the site's report timezone
      reminderMinutes: { type: Number, default: 60, min: 0 },
      digestHour: { type: Number, default: 18, min: 0, max: 23 },
    },
  },
  { timestamps: true }
);

export type UserFields = InferSchemaType<typeof UserSchema>;
export type UserDoc = HydratedDocument<UserFields>;
export const User: Model<UserFields> = defineModel("User", UserSchema);
