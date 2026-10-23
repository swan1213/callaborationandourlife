import { Schema, type InferSchemaType, type HydratedDocument, type Model, Types } from "mongoose";
import { defineModel } from "./define";

/**
 * An interview a bidder asks a caller to conduct for a profile.
 *
 * Lifecycle: pending (assigned caller must schedule) → scheduled → completed (caller reported the result).
 * A caller who can't make it transfers it with a reason → open (any caller may accept; the first one wins) → scheduled.
 * The bidder (or an admin) may cancel it at any time before it happens.
 *
 * Steps: interviews for the same profile + company + role form a chain (step 1 = initial, 2+ = follow-ups).
 * Once a caller has accepted an interview in a chain, every follow-up goes to that caller and cannot be transferred.
 */
const InterviewRequestSchema = new Schema(
  {
    profile: { type: Types.ObjectId, ref: "Profile", required: true, index: true },
    profileLabel: { type: String, default: "" },
    requestedBy: { type: Types.ObjectId, ref: "User", required: true, index: true },
    application: { type: Types.ObjectId, ref: "Application", default: null },
    company: { type: String, default: "", trim: true },
    jobTitle: { type: String, default: "", trim: true },
    /** Normalised company / role, identifying the interview chain together with the profile. */
    companyKey: { type: String, default: "", index: true },
    roleKey: { type: String, default: "" },
    /** Interview step in the hiring process: 1 = initial interview, 2–10 = follow-ups. */
    step: { type: Number, default: 1, min: 1, max: 10 },
    /** Follow-up bound to the caller who conducted the chain's earlier interview (cannot be transferred). */
    lockedCaller: { type: Boolean, default: false },
    /** Earlier interview of the same chain this follow-up continues. */
    previous: { type: Types.ObjectId, ref: "InterviewRequest", default: null },
    /** exact = one proposed start time; range = any time between windowStart and windowEnd. */
    mode: { type: String, enum: ["exact", "range"], default: "exact" },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, default: null },
    /** Bidder's timezone when the request was made (shown next to the requested time). */
    timezone: { type: String, default: "UTC" },
    durationMinutes: { type: Number, default: 60, min: 5, max: 480 },
    notes: { type: String, default: "" },
    /** Screenshot(s) of the interview invitation email. */
    screenshots: { type: [{ url: String, publicId: String }], default: [] },

    status: { type: String, enum: ["pending", "open", "scheduled", "completed", "cancelled"], default: "pending", index: true },
    /** Caller currently responsible (null while open). */
    caller: { type: Types.ObjectId, ref: "User", default: null, index: true },
    /** Caller the bidder originally sent it to. */
    requestedCaller: { type: Types.ObjectId, ref: "User", default: null },
    scheduledAt: { type: Date, default: null, index: true },
    /** Caller's note for the schedule: meeting link, phone number, etc. */
    callerNote: { type: String, default: "" },
    acceptedAt: Date,
    cancelledAt: Date,
    cancelReason: { type: String, default: "" },
    transfers: {
      type: [{ from: { type: Types.ObjectId, ref: "User" }, fromName: String, reason: String, at: { type: Date, default: Date.now } }],
      default: [],
    },
    /** Deadline for scheduling (3 hours after the request by default); an overdue notice is sent once after it. */
    scheduleBy: { type: Date, required: true, index: true },
    overdueNotifiedAt: Date,
    /** Result the caller reports after the interview. */
    report: {
      outcome: { type: String, enum: ["passed", "failed", "waiting", "no_show"], default: undefined },
      recordingUrl: { type: String, default: "" },
      /** Feedback on the interview (how it went, questions asked, next steps). */
      summary: { type: String, default: "" },
      /** Who interviewed on the company's side, and the caller ID (phone number) they called from. */
      interviewerName: { type: String, default: "" },
      interviewerCallerId: { type: String, default: "" },
      feedbackUpdatedAt: Date,
      reportedAt: Date,
      reportedBy: { type: Types.ObjectId, ref: "User", default: undefined },
      reportedByName: { type: String, default: "" },
    },
    /** When the caller was reminded to report the result (once). */
    reportReminderAt: Date,
    /** Timeline shown on the request (who did what, when). */
    events: {
      type: [{ at: { type: Date, default: Date.now }, by: { type: Types.ObjectId, ref: "User" }, byName: String, action: String, note: String }],
      default: [],
    },
    /**
     * Deleted by an admin: hidden everywhere (status becomes "cancelled") but kept, so admins can list
     * deleted interviews and restore them (back to `statusBeforeDelete`).
     */
    deletedAt: { type: Date, default: null, index: true },
    deletedByName: { type: String, default: "" },
    deleteReason: { type: String, default: "" },
    statusBeforeDelete: { type: String, default: "" },
    /** Notes from admins and the interview's caller (shown in its details and the calendar tooltip). */
    comments: {
      type: [{ at: { type: Date, default: Date.now }, by: { type: Types.ObjectId, ref: "User" }, byName: String, role: String, text: String }],
      default: [],
    },
  },
  { timestamps: true }
);
InterviewRequestSchema.index({ status: 1, scheduleBy: 1 });
InterviewRequestSchema.index({ status: 1, scheduledAt: 1 });
InterviewRequestSchema.index({ profile: 1, companyKey: 1, roleKey: 1, step: 1 });

export type InterviewFields = InferSchemaType<typeof InterviewRequestSchema>;
export type InterviewDoc = HydratedDocument<InterviewFields>;
export const InterviewRequest: Model<InterviewFields> = defineModel("InterviewRequest", InterviewRequestSchema);
