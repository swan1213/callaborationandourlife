import type { Types } from "mongoose";
import { Application } from "./models/Application";

/** Default number of job postings a bidder may leave waiting for a manual paste before automatic generation stops. */
export const DEFAULT_MANUAL_LIMIT = 100;

/**
 * Job postings waiting for the bidder to paste the description by hand ("not generated": the page couldn't be read).
 * When `pending` reaches the bidder's limit, generating from job URLs is paused until they handle some of them.
 * A limit of 0 means no limit.
 */
export async function manualQueue(user: { _id: Types.ObjectId | string; role?: string; manualLimit?: number | null }) {
  const limit = user.role === "bidder" ? (user.manualLimit ?? DEFAULT_MANUAL_LIMIT) : 0;
  const pending = await Application.countDocuments({ user: user._id, status: "not_generated", deletedByUser: false });
  return { pending, limit, blocked: limit > 0 && pending >= limit };
}

export const manualLimitMessage = (pending: number, limit: number) =>
  `${pending} job posting${pending === 1 ? " is" : "s are"} waiting for you to paste the job description (limit ${limit}). ` +
  `Automatic generation from job URLs is paused: open View Generated Resumes, filter by "Not generated" and paste the descriptions to continue.`;
