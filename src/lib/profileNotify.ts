// Tells the people who use a profile (assigned bidders and callers, managing users) that it was edited:
// a notification, and the "Profile updated → Reload" prompt on pages they have open (components/UpdatePrompt.tsx).
import type { Types } from "mongoose";
import { Notice } from "./models/Notice";
import { Profile } from "./models/Profile";
import { User } from "./models/User";
import { PROFILE_GROUPS } from "./profileFields";
import { sendPush } from "./push";

/** Edits by the same person within this window count as one change (one notification, sections merged). */
const MERGE_MS = 10 * 60_000;

const SECTION: Record<string, string> = {
  ...Object.fromEntries(PROFILE_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, g.title]))),
  label: "Profile name",
  fullName: "Personal",
  location: "Address",
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  certifications: "Certifications",
  about: "About this developer",
  resumeReference: "Imported resume",
  resumeReferenceName: "Imported resume",
  resumeDesign: "Resume design",
  coverLetterDesign: "Cover letter design",
  companyCooldownDays: "Company cooldown",
  active: "Active status",
};
SECTION.salaryCurrency = SECTION.salaryPeriod = SECTION.salary ?? "Work & eligibility";
// apiKey, openaiModel and monthlyQuota are admin settings: nothing the people using the profile see.

/** Same value, ignoring what the form doesn't send (sub-document ids, unset vs empty, false vs missing). */
function same(before: unknown, after: unknown): boolean {
  if (Array.isArray(after)) return Array.isArray(before) && before.length === after.length && after.every((v, i) => same(before[i], v));
  if (after && typeof after === "object")
    return Object.entries(after).every(([k, v]) => same((before as Record<string, unknown> | null | undefined)?.[k], v));
  const scalar = (v: unknown) => (v == null || v === false ? "" : String(v));
  return scalar(before) === scalar(after);
}

/** Section names whose fields differ between the stored profile and the saved update. */
export function changedSections(before: Record<string, unknown>, update: Record<string, unknown>) {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(update)) if (SECTION[k] && !same(before[k], v)) out.add(SECTION[k]);
  return [...out];
}

/** Records the change on the profile and notifies its people (never the editor). Never throws. */
export async function recordProfileChange(
  profileId: Types.ObjectId,
  before: Record<string, unknown>,
  update: Record<string, unknown>,
  actor: { _id: Types.ObjectId; name: string }
) {
  try {
    const sections = changedSections(before, update);
    if (!sections.length) return;
    const now = new Date();
    const prevAt = before.contentUpdatedAt ? new Date(before.contentUpdatedAt as Date).getTime() : 0;
    const merging = now.getTime() - prevAt < MERGE_MS && String(before.contentUpdatedBy) === String(actor._id);
    const all = merging ? [...new Set([...((before.contentChanges as string[]) ?? []), ...sections])] : sections;
    await Profile.updateOne(
      { _id: profileId },
      { $set: { contentUpdatedAt: now, contentUpdatedBy: actor._id, contentUpdatedByName: actor.name, contentChanges: all } },
      { timestamps: false }
    );

    const label = String(update.label || before.label || "A profile");
    const people = await User.find({
      _id: { $ne: actor._id },
      status: "approved",
      role: { $in: ["user", "bidder", "caller"] },
      $or: [{ assignedProfiles: profileId }, { managedProfiles: profileId }],
    })
      .select("_id role")
      .lean();
    if (!people.length) return;

    const title = `Profile updated: ${label}`.slice(0, 200);
    const body = `${actor.name} changed ${all.join(", ")}. Reload TailorBid before generating to use the latest version.`;
    const urlFor = (role: string) => (role === "user" ? `/admin/profiles/${profileId}/view` : `/profiles?id=${profileId}`);
    // Still unread from the last few minutes: update it rather than stacking another one.
    const recent = await Notice.find({
      user: { $in: people.map((p) => p._id) },
      kind: "profile-update",
      url: { $in: [urlFor("user"), urlFor("bidder")] },
      readAt: null,
      createdAt: { $gte: new Date(now.getTime() - MERGE_MS) },
    })
      .select("user")
      .lean();
    const updated = new Set(recent.map((n) => String(n.user)));
    if (recent.length) await Notice.updateMany({ _id: { $in: recent.map((n) => n._id) } }, { $set: { title, body } });
    const fresh = people.filter((p) => !updated.has(String(p._id)));
    if (!fresh.length) return;
    await Notice.insertMany(fresh.map((p) => ({ user: p._id, kind: "profile-update", tone: "info", title, body, url: urlFor(p.role) })));
    const managers = fresh.filter((p) => p.role === "user").map((p) => String(p._id));
    const others = fresh.filter((p) => p.role !== "user").map((p) => String(p._id));
    const tag = `profile-update-${profileId}`;
    await Promise.all([
      sendPush(managers, { title, body, url: urlFor("user"), tag }),
      sendPush(others, { title, body, url: urlFor("bidder"), tag }),
    ]);
  } catch (e) {
    console.error("profile change notification failed", e);
  }
}
