import { NextResponse } from "next/server";
import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { Profile } from "@/lib/models/Profile";
import { getSettings } from "@/lib/models/Settings";
import { companyFromUrl } from "@/lib/company";
import { cooldownAlternatives, cooldownRule, describeHit, findCooldownHit } from "@/lib/cooldown";
import { findDuplicate } from "@/lib/duplicates";
import { urlKey } from "@/lib/links";
import { oid } from "@/lib/query";

/**
 * GET ?profileId&url — what Generate would refuse, checked as the link is pasted (nothing is scraped or charged):
 * - duplicate: this person's application for the same posting with this profile;
 * - cooldown: the profile's earlier application to the company, when the company is known from an earlier application
 *   for this posting or from the job board's link (jobs.lever.co/teamsnap/…);
 * - alternatives: the person's other profiles and when each can apply there.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  if (user.role === "caller") throw new HttpError(403, "Callers cannot generate applications");
  const sp = new URL(req.url).searchParams;
  const profileId = oid(sp.get("profileId"), "profile");
  const url = (sp.get("url") || "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) throw new HttpError(400, "Enter a job URL");
  const assigned = user.assignedProfiles.some((p) => String(p) === String(profileId)) || (user.role !== "bidder" && canManageProfile(user, profileId));
  if (!assigned) throw new HttpError(403, "This profile is not assigned to you");
  const profile = await Profile.findById(profileId).select("label companyCooldownDays").lean<{ label: string; companyCooldownDays?: number | null }>();
  if (!profile) throw new HttpError(404, "Profile not found");

  const dup = await findDuplicate(user._id, profileId, url);
  const known = await Application.findOne({ jobUrlKey: urlKey(url), status: { $ne: "not_generated" }, company: { $nin: ["", null] } })
    .sort({ createdAt: -1 })
    .select("company jobTitle")
    .lean<{ company: string; jobTitle: string }>();
  const company = known?.company || companyFromUrl(url);
  const settings = await getSettings();
  const hit = company ? await findCooldownHit(profileId, company, cooldownRule(settings, profile), known?.jobTitle ?? "") : null;

  return NextResponse.json({
    duplicate: dup && dup.status !== "not_generated" ? { id: String(dup._id), status: dup.status, company: dup.company, jobTitle: dup.jobTitle, createdAt: dup.createdAt } : null,
    cooldown: hit ? await describeHit(hit, user, profileId) : null,
    alternatives: hit && !hit.sameRoleOnly ? await cooldownAlternatives(user, settings, hit.company, known?.jobTitle ?? "", profileId) : [],
  });
});
