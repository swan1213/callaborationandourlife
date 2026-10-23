import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";

const CaptionSchema = new Schema(
  {
    /** Milliseconds since 1970, when the line was heard. */
    t: { type: Number, default: 0 },
    text: { type: String, default: "" },
    translation: { type: String, default: "" },
  },
  { _id: false }
);

/** A question the Interview Assistant answered, with the sections of its suggested answer. */
const AnswerSchema = new Schema(
  {
    t: { type: Number, default: 0 },
    question: { type: String, default: "" },
    /** "live" (written during the call) or "prepared" (a common question answered ahead of time). */
    source: { type: String, default: "live" },
    answer: { type: String, default: "" },
    keyPoints: { type: String, default: "" },
    meaning: { type: String, default: "" },
    mood: { type: String, default: "" },
  },
  { _id: false }
);

/**
 * An interview recorded by the Interview Assistant (assistant/): its captions, the suggested answers and
 * an optional AI review. Saved while the interview runs; shown on Interview History.
 */
const InterviewSessionSchema = new Schema(
  {
    /** Who recorded it (the account the assistant was opened with). */
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, default: "" },
    /** The assistant's own id for the recording, so repeated saves update the same document. */
    clientId: { type: String, required: true },
    /** The TailorBid interview the assistant was opened for, if any. */
    interview: { type: Types.ObjectId, ref: "InterviewRequest", default: null, index: true },
    profile: { type: Types.ObjectId, ref: "Profile", default: null },
    profileLabel: { type: String, default: "" },
    company: { type: String, default: "" },
    role: { type: String, default: "" },
    /** recruiter | hr | technical | takehome | final | onboarding (see lib/interviewSessions.ts STAGE_NAMES). */
    stage: { type: String, default: "" },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    captions: { type: [CaptionSchema], default: [] },
    answers: { type: [AnswerSchema], default: [] },
    /** AI review: { summary, wentWell[], toImprove[{question, tip}], thankYouEmail, nextStagePrep[], generatedAt }. */
    report: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);
InterviewSessionSchema.index({ user: 1, clientId: 1 }, { unique: true });
InterviewSessionSchema.index({ startedAt: -1 });

export type InterviewSessionFields = InferSchemaType<typeof InterviewSessionSchema>;
export const InterviewSession: Model<InterviewSessionFields> = defineModel("InterviewSession", InterviewSessionSchema);
