import type { Types } from "mongoose";
import { Application } from "./models/Application";
import { Profile } from "./models/Profile";
import { getSettings } from "./models/Settings";
import { safeName, type AppDocSource } from "./documents";
import { dayKey, dayRange } from "./tz";

type Source = AppDocSource & { profile?: unknown; profileLabel?: string | null };

const idOf = (p: unknown) => String(p && typeof p === "object" && "_id" in p ? (p as { _id: unknown })._id : (p ?? ""));

/**
 * ZIP folder per application: "[Date]/[Profile Name]/[Index]_[Job Title]_[Company Name]", e.g. "2026-10-21/Jane_Doe/03_Backend_Engineer_Acme_Corp".
 * Date is the generation day in the report time zone (Settings); Index is the application's place among everything that
 * profile generated that day (01 = first), so it is the same in every download.
 */
export async function applicationFolders(apps: Source[]): Promise<Map<string, string>> {
  const tz = (await getSettings()).reportTimezone || "America/New_York";
  const profileIds = [...new Set(apps.map((a) => idOf(a.profile)).filter(Boolean))];
  const labels = new Map(
    (await Profile.find({ _id: { $in: profileIds } }).select("label").lean<{ _id: Types.ObjectId; label: string }[]>()).map((p) => [String(p._id), p.label])
  );

  // One query per profile and day: that day's generated applications in order.
  const groups = new Map<string, { profile: string; day: string }>();
  for (const a of apps) {
    const g = { profile: idOf(a.profile), day: dayKey(new Date(a.createdAt ?? Date.now()), tz) };
    groups.set(`${g.profile}|${g.day}`, g);
  }
  const rank = new Map<string, number>();
  await Promise.all(
    [...groups.values()].map(async ({ profile, day }) => {
      if (!profile) return;
      const { start, end } = dayRange(day, tz);
      const sameDay = await Application.find({ profile, status: { $ne: "not_generated" }, createdAt: { $gte: start, $lt: end } })
        .sort({ createdAt: 1, _id: 1 })
        .select("_id")
        .lean<{ _id: Types.ObjectId }[]>();
      sameDay.forEach((a, i) => rank.set(String(a._id), i + 1));
    })
  );

  const folders = new Map<string, string>();
  const used = new Set<string>();
  for (const a of apps) {
    const id = String(a._id);
    const day = dayKey(new Date(a.createdAt ?? Date.now()), tz);
    const profile = safeName(labels.get(idOf(a.profile)) || a.profileLabel || "Profile");
    const title = safeName(a.jobTitle || "Role");
    const company = safeName(a.company || "Company");
    const base = `${day}/${profile}/${String(rank.get(id) ?? 0).padStart(2, "0")}_${title}_${company}`;
    let folder = base;
    for (let n = 2; used.has(folder); n++) folder = `${base}_${n}`;
    used.add(folder);
    folders.set(id, folder);
  }
  return folders;
}

/** File name base for a single file outside a ZIP: the folder flattened, e.g. "2026-10-21_Jane_Doe_03_Backend_Engineer_Acme_Corp". */
export async function applicationFileBases(apps: Source[]): Promise<Map<string, string>> {
  const folders = await applicationFolders(apps);
  return new Map([...folders].map(([id, folder]) => [id, folder.replace(/\//g, "_")]));
}
