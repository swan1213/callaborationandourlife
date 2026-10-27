import type { Types } from "mongoose";
import { urlKey } from "./links";
import { Application } from "./models/Application";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type DuplicateApp = { _id: Types.ObjectId; status: string; company: string; jobTitle: string; createdAt: Date };

/**
 * This person's application for the same posting with this profile, matched by lib/links.ts urlKey, so the link with
 * tracking parameters, "www.", /apply and so on still matches. A generated or submitted one wins over a not-generated one.
 */
export async function findDuplicate(userId: Types.ObjectId | string, profileId: Types.ObjectId | string, jobUrl: string): Promise<DuplicateApp | null> {
  const key = urlKey(jobUrl);
  if (!key) return null;
  const host = key.split(/[/?]/)[0];
  const rows = await Application.find({
    user: userId,
    profile: profileId,
    deletedByUser: false,
    // Older records have no jobUrlKey: narrowed to the same site here and keyed below.
    $or: [{ jobUrlKey: key }, { jobUrlKey: { $in: ["", null] }, jobUrl: { $regex: escapeRegex(host), $options: "i" } }],
  })
    .sort({ createdAt: -1 })
    .select("status company jobTitle createdAt jobUrl jobUrlKey")
    .lean<(DuplicateApp & { jobUrl: string; jobUrlKey?: string })[]>();
  const same = rows.filter((r) => r.jobUrlKey === key || (!r.jobUrlKey && urlKey(r.jobUrl) === key));
  return same.find((r) => r.status !== "not_generated") ?? same[0] ?? null;
}
