import type { Types } from "mongoose";
import { HttpError } from "./auth";
import { companyKey } from "./company";
import { Application } from "./models/Application";

export type CooldownHit = { days: number; lastAppliedAt: Date; eligibleAt: Date; company: string };

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Has this profile applied to the same company within the cooldown window?
 * Counts every bid on the profile (any bidder) except ones the bidder deleted.
 */
export async function findCooldownHit(profileId: Types.ObjectId, company: string, days: number): Promise<CooldownHit | null> {
  const key = companyKey(company);
  if (!key || days <= 0) return null;
  const since = new Date(Date.now() - days * 86400000);
  const last = await Application.findOne({
    profile: profileId,
    deletedByUser: false,
    createdAt: { $gte: since },
    // companyKey for new records; exact-name fallback for records created before the key existed
    $or: [{ companyKey: key }, { companyKey: "", company: new RegExp(`^\\s*${escapeRegex(company.trim())}\\s*$`, "i") }],
  })
    .sort({ createdAt: -1 })
    .select("createdAt company")
    .lean<{ createdAt: Date; company: string }>();
  if (!last) return null;
  return { days, lastAppliedAt: last.createdAt, eligibleAt: new Date(last.createdAt.getTime() + days * 86400000), company: last.company || company };
}

const fmt = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/** Throws a 409 explaining when the profile can apply to this company again (no email: the refusal is shown on screen). */
export async function rejectForCooldown(o: {
  hit: CooldownHit;
  bidder: { name: string; email: string };
  profileLabel: string;
  company: string;
  role: string;
  jobUrl?: string;
}): Promise<never> {
  const { hit } = o;
  throw new HttpError(
    409,
    `${o.profileLabel} already applied to ${hit.company || o.company} on ${fmt(hit.lastAppliedAt)}. ` +
      `The ${hit.days}-day company rule blocks another application until ${fmt(hit.eligibleAt)}. No fee was charged.`
  );
}
