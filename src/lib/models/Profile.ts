import { Schema, type InferSchemaType, type Model, Types } from "mongoose";
import { defineModel } from "./define";
import { DEFAULT_DESIGN, DESIGN_IDS } from "../designs";

const ExperienceSchema = new Schema(
  {
    company: { type: String, required: true },
    title: { type: String, default: "" },
    location: { type: String, default: "" },
    startDate: { type: String, default: "" }, // "YYYY-MM"
    endDate: { type: String, default: "" }, // "YYYY-MM" or "" when current
    current: { type: Boolean, default: false },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const EducationSchema = new Schema(
  {
    university: { type: String, required: true },
    degree: { type: String, default: "" },
    field: { type: String, default: "" },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
  },
  { _id: false }
);

const ProfileSchema = new Schema(
  {
    label: { type: String, required: true, trim: true }, // internal name shown to users
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    fullName: { type: String, required: true, trim: true }, // name printed on documents
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    github: { type: String, default: "" },
    website: { type: String, default: "" }, // personal website
    portfolio: { type: String, default: "" },
    location: { type: String, default: "" }, // shown on the resume, e.g. "Austin, TX"
    street: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zipcode: { type: String, default: "" },
    currentCompany: { type: String, default: "" },
    // Application-form answers (read-only for assigned users)
    dateOfBirth: { type: String, default: "" }, // "YYYY-MM-DD"
    gender: { type: String, default: "" },
    race: { type: String, default: "" },
    asianSubgroup: { type: String, default: "" }, // East / South / Southeast Asian
    ethnicity: { type: String, default: "" }, // origin or ethnicity
    visaStatus: { type: String, default: "" },
    veteranStatus: { type: String, default: "" },
    disabilityStatus: { type: String, default: "" },
    salary: { type: String, default: "" }, // desired salary amount
    salaryCurrency: { type: String, default: "USD" },
    salaryPeriod: { type: String, default: "year" },
    availability: { type: String, default: "" }, // notice period / earliest start
    // Added with the redesigned profile form (lib/profileFields.ts)
    middleName: { type: String, default: "" },
    preferredName: { type: String, default: "" },
    pronouns: { type: String, default: "" },
    professionalTitle: { type: String, default: "" },
    otherLink: { type: String, default: "" },
    street2: { type: String, default: "" },
    country: { type: String, default: "" },
    timezone: { type: String, default: "" },
    yearsExperience: { type: String, default: "" },
    englishLevel: { type: String, default: "" },
    workAuthorizedUS: { type: String, default: "" }, // "Yes" | "No" | ""
    needsSponsorship: { type: String, default: "" },
    sponsorshipFreeRegions: { type: String, default: "" },
    workSetup: { type: [String], default: [] }, // Remote / Hybrid / On-site
    willingToRelocate: { type: String, default: "" },
    securityClearance: { type: String, default: "" },
    /** Free-text background written by the admin/manager; sent to the AI with the structured resume data. */
    about: { type: String, default: "" },
    /** Text of an imported resume, used as a reference (facts, order, emphasis) for every generation. */
    resumeReference: { type: String, default: "" },
    resumeReferenceName: { type: String, default: "" },
    summary: { type: String, default: "" },
    skills: { type: [String], default: [] },
    experience: { type: [ExperienceSchema], default: [] },
    education: { type: [EducationSchema], default: [] },
    certifications: { type: [String], default: [] },
    /** OpenAI key from the API Keys pool; null = use the default key. */
    apiKey: { type: Types.ObjectId, ref: "ApiKey", default: null },
    /** Model override; "" = the key's default model. */
    openaiModel: { type: String, default: "" },
    /** Max generations per calendar month (0 = unlimited). */
    monthlyQuota: { type: Number, default: 0, min: 0 },
    /** Days before this profile may apply to the same company again; null = the global setting. */
    companyCooldownDays: { type: Number, default: null, min: 0 },
    /** Document designs used for new generations (lib/designs.ts). */
    resumeDesign: { type: String, enum: DESIGN_IDS, default: DEFAULT_DESIGN },
    coverLetterDesign: { type: String, enum: DESIGN_IDS, default: DEFAULT_DESIGN },
    active: { type: Boolean, default: true },
    /** Last edit that people using the profile are told about (lib/profileNotify.ts): when, by whom, which sections. */
    contentUpdatedAt: { type: Date, default: null },
    contentUpdatedBy: { type: Types.ObjectId, ref: "User", default: null },
    contentUpdatedByName: { type: String, default: "" },
    contentChanges: { type: [String], default: [] },
  },
  { timestamps: true }
);

export type ProfileFields = InferSchemaType<typeof ProfileSchema>;
export const Profile: Model<ProfileFields> = defineModel("Profile", ProfileSchema);
