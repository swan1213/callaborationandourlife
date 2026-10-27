import type { Types } from "mongoose";
import { canManageProfile, HttpError } from "./auth";
import { companyMatchKey, roleKey } from "./company";
import { Application } from "./models/Application";
import { Profile } from "./models/Profile";
import { User, type UserDoc } from "./models/User";

/** How the same-company cooldown applies to one profile (site settings + the profile's own day count). */
export type CooldownRule = {
  days: number;
  /** "company": any job at the company is blocked; "role": only the same job title there. */
  scope: "company" | "role";
  /** companyMatchKey of companies the rule never applies to. */
  exempt: string[];
};

type RuleSettings = { companyCooldownDays?: number | null; cooldownScope?: string | null; cooldownExemptCompanies?: string[] | null };

export function cooldownRule(settings: RuleSettings, profile: { companyCooldownDays?: number | null }): CooldownRule {
  return {
    days: profile.companyCooldownDays ?? settings.companyCooldownDays ?? 0,
    scope: settings.cooldownScope === "role" ? "role" : "company",
    exempt: (settings.cooldownExemptCompanies ?? []).map(companyMatchKey).filter(Boolean),
  };
}

export type CooldownHit = {
  days: number;
  scope: "company" | "role";
  lastAppliedAt: Date;
  eligibleAt: Date;
  company: string;
  jobTitle: string;
  appId: string;
  userId: string;
  /** Role scope, but the new job's title isn't known yet: it is blocked only if it turns out to be the same role. */
  sameRoleOnly: boolean;
};

type RecentApp = { _id: Types.ObjectId; profile: Types.ObjectId; user: Types.ObjectId; company: string; jobTitle: string; createdAt: Date };

/** Applications that count for the cooldown (generated or submitted, not deleted by the bidder), newest first. */
function recentApps(profileIds: (Types.ObjectId | string)[], days: number) {
  return Application.find({
    profile: { $in: profileIds },
    deletedByUser: false,
    // "Not generated" rows were never applications: a failed attempt, or the placeholder the generate request saves
    // for itself before scraping (company guessed from the URL), which used to block that same request.
    status: { $ne: "not_generated" },
    createdAt: { $gte: new Date(Date.now() - days * 86400000) },
  })
    .sort({ createdAt: -1 })
    .select("profile user company jobTitle createdAt")
    .lean<RecentApp[]>();
}

function matchHit(apps: RecentApp[], profileId: Types.ObjectId | string, company: string, jobTitle: string, rule: CooldownRule): CooldownHit | null {
  const key = companyMatchKey(company);
  if (!key || rule.days <= 0 || rule.exempt.includes(key)) return null;
  const since = Date.now() - rule.days * 86400000;
  const role = rule.scope === "role" ? roleKey(jobTitle) : "";
  for (const a of apps) {
    if (String(a.profile) !== String(profileId) || a.createdAt.getTime() < since) continue;
    if (companyMatchKey(a.company) !== key) continue;
    if (role && roleKey(a.jobTitle) !== role) continue;
    return {
      days: rule.days,
      scope: rule.scope,
      lastAppliedAt: a.createdAt,
      eligibleAt: new Date(a.createdAt.getTime() + rule.days * 86400000),
      company: a.company || company,
      jobTitle: a.jobTitle || "",
      appId: String(a._id),
      userId: String(a.user),
      sameRoleOnly: rule.scope === "role" && !role,
    };
  }
  return null;
}

/** Has this profile applied to the same company (or, with the role scope, the same role there) within the cooldown? */
export async function findCooldownHit(profileId: Types.ObjectId | string, company: string, rule: CooldownRule, jobTitle = ""): Promise<CooldownHit | null> {
  if (!companyMatchKey(company) || rule.days <= 0) return null;
  return matchHit(await recentApps([profileId], rule.days), profileId, company, jobTitle, rule);
}

/** Profiles this person may generate with (as /api/profiles lists them). */
function profileFilter(user: UserDoc) {
  const ids = [...user.assignedProfiles, ...(user.role === "user" ? (user.managedProfiles ?? []) : [])];
  return user.role === "admin" ? { active: true } : { _id: { $in: ids }, active: true };
}

export type CooldownAlternative = { id: string; label: string; eligibleAt: Date | null };

/** The person's other profiles, each with when it can apply to this company (null = now); free ones first. */
export async function cooldownAlternatives(user: UserDoc, settings: RuleSettings, company: string, jobTitle: string, excludeProfile?: Types.ObjectId | string): Promise<CooldownAlternative[]> {
  if (!companyMatchKey(company)) return [];
  const filter = profileFilter(user);
  const profiles = await Profile.find(excludeProfile ? { $and: [filter, { _id: { $ne: excludeProfile } }] } : filter)
    .select("label companyCooldownDays")
    .sort({ label: 1 })
    .limit(100)
    .lean<{ _id: Types.ObjectId; label: string; companyCooldownDays?: number | null }[]>();
  const rules = new Map(profiles.map((p) => [String(p._id), cooldownRule(settings, p)]));
  const maxDays = Math.max(0, ...[...rules.values()].map((r) => r.days));
  const apps = maxDays > 0 ? await recentApps(profiles.map((p) => p._id), maxDays) : [];
  return profiles
    .map((p) => {
      const hit = matchHit(apps, p._id, company, jobTitle, rules.get(String(p._id))!);
      return { id: String(p._id), label: p.label, eligibleAt: hit && !hit.sameRoleOnly ? hit.eligibleAt : null };
    })
    .sort((a, b) => (a.eligibleAt?.getTime() ?? 0) - (b.eligibleAt?.getTime() ?? 0));
}

/** What the page shows about a hit: who applied, and a link to it when this person may open it. */
export async function describeHit(hit: CooldownHit, user: UserDoc, profileId: Types.ObjectId | string) {
  const mine = hit.userId === String(user._id);
  const canOpen = mine || user.role === "admin" || (user.role === "user" && canManageProfile(user, profileId));
  const by = mine ? null : await User.findById(hit.userId).select("name").lean<{ name: string }>();
  return {
    company: hit.company,
    jobTitle: hit.jobTitle,
    lastAppliedAt: hit.lastAppliedAt,
    eligibleAt: hit.eligibleAt,
    days: hit.days,
    scope: hit.scope,
    sameRoleOnly: hit.sameRoleOnly,
    byName: mine ? "you" : (by?.name ?? "another bidder"),
    appId: canOpen ? hit.appId : null,
  };
}

const fmt = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/**
 * Throws a 409 explaining when the profile can apply to this company again. The body also carries `cooldown`
 * (the earlier application) and `alternatives` (the person's other profiles and when each can apply).
 */
export async function rejectForCooldown(o: { hit: CooldownHit; user: UserDoc; settings: RuleSettings; profile: { _id: Types.ObjectId; label: string }; company: string; role: string }): Promise<never> {
  const { hit } = o;
  const what = hit.scope === "role" ? `${hit.company || o.company} for ${hit.jobTitle || o.role || "this role"}` : hit.company || o.company;
  const rule = hit.scope === "role" ? `The ${hit.days}-day rule blocks the same role there` : `The ${hit.days}-day company rule blocks another application`;
  throw new HttpError(409, `${o.profile.label} already applied to ${what} on ${fmt(hit.lastAppliedAt)}. ${rule} until ${fmt(hit.eligibleAt)}. No fee was charged.`, {
    reason: "cooldown",
    cooldown: await describeHit(hit, o.user, o.profile._id),
    alternatives: await cooldownAlternatives(o.user, o.settings, hit.company || o.company, o.role, o.profile._id),
  });
}
