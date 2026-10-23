import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";

const ApplicationSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    profile: { type: Types.ObjectId, ref: "Profile", required: true, index: true },
    /** Profile label at generation time, so history stays readable if the profile is deleted. */
    profileLabel: { type: String, default: "" },
    /** Normalised company name (lib/company.ts) for the same-company cooldown. */
    companyKey: { type: String, default: "", index: true },
    jobUrl: { type: String, default: "" },
    company: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    jobLocation: { type: String, default: "" },
    jobDescription: { type: String, default: "" },
    /** Structured tailored resume produced by the model (see lib/generate.ts ResumeContent). */
    /** Tailored resume; null while status is "not_generated" (job description could not be scraped). */
    resume: { type: Schema.Types.Mixed, default: null },
    coverLetter: { type: String, default: "" },
    /** Latest AI ATS review of the resume (lib/atsReview.ts AtsReview); null until someone runs one. */
    atsReview: { type: Schema.Types.Mixed, default: null },
    /** Profile's document designs at generation time (lib/designs.ts); "" = Standard (older records). */
    resumeDesign: { type: String, default: "" },
    coverLetterDesign: { type: String, default: "" },
    /** not_generated = saved from an import but the job description could not be read; paste it to generate. */
    status: { type: String, enum: ["not_generated", "generated", "submitted"], default: "generated", index: true },
    /** Why generation didn't happen (not_generated only). */
    generationError: { type: String, default: "" },
    submittedAt: Date,
    notes: { type: String, default: "" },
    screenshots: {
      type: [{ url: String, publicId: String, uploadedAt: { type: Date, default: Date.now } }],
      default: [],
    },
    usage: {
      model: String,
      apiKey: { type: Types.ObjectId, ref: "ApiKey", default: null },
      costUsd: { type: Number, default: 0 },
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
    },
    /** Hidden from the user but kept for admin history and billing. */
    deletedByUser: { type: Boolean, default: false, index: true },
    /** Bidder's fee, charged when submitted (0 while generated). */
    fee: { type: Number, default: 0 },
    /** Admin has marked this submitted application's fee as paid out. */
    paid: { type: Boolean, default: false, index: true },
    paidAt: Date,
    paidBy: { type: Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
ApplicationSchema.index({ createdAt: -1 });

export type ApplicationFields = InferSchemaType<typeof ApplicationSchema>;
export const Application: Model<ApplicationFields> =
  defineModel("Application", ApplicationSchema);
