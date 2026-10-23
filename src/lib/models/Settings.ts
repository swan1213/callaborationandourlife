import { Schema, type InferSchemaType, type Model } from "mongoose";
import { defineModel } from "./define";

const SettingsSchema = new Schema(
  {
    key: { type: String, default: "global", unique: true },
    siteName: { type: String, default: "TailorBid" },
    /** Fee applied to newly approved users. */
    defaultFee: { type: Number, default: 0.07, min: 0 },
    allowRegistration: { type: Boolean, default: true },
    /** Announcement shown on every user's My Page. */
    myPageNotice: { type: String, default: "" },
    /** Extra instructions appended to every generation prompt. */
    promptInstructions: { type: String, default: "" },
    /** Full resume/cover-letter prompt; "" = the built-in default prompt (lib/resumePrompt.ts). */
    resumePromptTemplate: { type: String, default: "" },
    /** Resumes whose keyword match (lib/matchScore.ts) is below this get one AI revision pass (lib/generate.ts atsRevise); 0 = off. */
    atsTargetScore: { type: Number, default: 85, min: 0, max: 100 },
    /** IANA timezone that defines "a day" for the midnight report and daily milestones. */
    reportTimezone: { type: String, default: "America/New_York" },
    dailyReportEnabled: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true },
    /** Submitted-application counts that trigger a notification (1 = first submission). */
    milestones: { type: [Number], default: [1, 50, 100] },
    /** Whether milestone counts reset every day (in reportTimezone) or accumulate forever. */
    milestonePeriod: { type: String, enum: ["daily", "lifetime"], default: "daily" },
    /** A profile cannot apply to the same company again within this many days (0 = off). */
    companyCooldownDays: { type: Number, default: 30, min: 0 },
    /** Hours a caller has to schedule an interview request before the responsible users are notified. */
    interviewScheduleHours: { type: Number, default: 3, min: 0.25 },
    /** Pages turned off per role ({ user: [keys], bidder: [...], caller: [...] }); see lib/pageAccess.ts. */
    pageAccess: { type: Schema.Types.Mixed, default: () => ({}) },
    /** Lock for the interview reminder sweep (see lib/interviews.ts runInterviewSweep). */
    interviewSweepAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type SettingsFields = InferSchemaType<typeof SettingsSchema>;
export const Settings: Model<SettingsFields> = defineModel("Settings", SettingsSchema);

export async function getSettings() {
  return (
    (await Settings.findOne({ key: "global" })) ??
    (await Settings.create({ key: "global" }))
  );
}
