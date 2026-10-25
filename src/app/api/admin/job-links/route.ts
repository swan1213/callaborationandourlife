import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { canManageProfile, handler, HttpError, profileScope, requireStaff } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { dateRange, oid, paging, textSearch } from "@/lib/query";
import { urlKey } from "@/lib/links";
import { JobLinkCopy, markCopied, type JobLinkCopyFields } from "@/lib/models/JobLinkCopy";

/** Most applications read per request; the page asks to narrow the filters beyond this. */
const MAX_SCAN = 50000;

type Source = { _id: Types.ObjectId; user?: Types.ObjectId | null; jobUrl: string; company?: string; jobTitle?: string; createdAt: Date };
type JobLink = {
  url: string;
  company: string;
  jobTitle: string;
  /** Applications generated from this link (every profile and bidder). */
  count: number;
  bidders: { _id: string; name: string }[];
  firstAt: Date;
  lastAt: Date;
  /** Latest application from this link, to open it. */
  applicationId: string;
  key: string;
  /** Last time this link was copied for the selected profile (null: never). */
  copiedAt: Date | null;
  copiedBy: string;
  copyCount: number;
};

/** The profile the page works for (`?profile=` / `{ profile }`), which the staff member must manage. */
function profileParam(staff: Awaited<ReturnType<typeof requireStaff>>, v: unknown) {
  if (!v) throw new HttpError(400, "Choose a profile first");
  const pid = oid(String(v), "profile");
  if (!canManageProfile(staff, pid)) throw new HttpError(403, "You do not manage this profile");
  return pid;
}

/**
 * Job links the selected profile has not applied to yet: every job link generated for any profile (within the
 * staff member's profiles), once each, minus the links that profile already has an application for, whatever its
 * status. Links that only differ by tracking parameters, "www.", letter case or an /apply page count as one
 * (lib/links.ts urlKey). Newest first. `?from` / `?to` / `?q` narrow the links; `?copied=yes|no` filters by this
 * profile's copies. `?copy=1` returns every matching URL (Copy all links) and marks them copied for the profile.
 */
export const GET = handler(async (req: Request) => {
  const staff = await requireStaff();
  const sp = new URL(req.url).searchParams;
  const profile = profileParam(staff, sp.get("profile"));
  const scope = profileScope(staff);

  const filter = {
    ...dateRange(sp),
    ...textSearch(sp.get("q"), ["company", "jobTitle", "jobUrl"]),
    ...(scope ? { profile: { $in: scope } } : {}),
    jobUrl: { $nin: ["", null] },
  };
  const [apps, applied] = await Promise.all([
    Application.find(filter).select("user jobUrl company jobTitle createdAt").sort({ createdAt: -1 }).limit(MAX_SCAN + 1).lean<Source[]>(),
    // Everything this profile ever applied to, regardless of the date and search filters.
    Application.find({ profile, jobUrl: { $nin: ["", null] } }).select("jobUrl").lean<{ jobUrl: string }[]>(),
  ]);
  if (apps.length > MAX_SCAN) throw new HttpError(400, `More than ${MAX_SCAN} applications match: narrow the filters`);
  const appliedKeys = new Set(applied.map((a) => urlKey(a.jobUrl)));

  const userIds = [...new Set(apps.map((a) => String(a.user ?? "")).filter(Boolean))];
  const names = new Map(
    (await User.find({ _id: { $in: userIds } }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>()).map((u) => [String(u._id), u.name])
  );

  // Newest first, so the first application seen for a link names it.
  const links = new Map<string, JobLink>();
  for (const a of apps) {
    const url = a.jobUrl.trim();
    const key = urlKey(url);
    let link = links.get(key);
    if (!link) {
      link = { url, company: a.company || "", jobTitle: a.jobTitle || "", count: 0, bidders: [], firstAt: a.createdAt, lastAt: a.createdAt, applicationId: String(a._id), key, copiedAt: null, copiedBy: "", copyCount: 0 };
      links.set(key, link);
    }
    link.count++;
    link.firstAt = a.createdAt;
    if (!link.company && a.company) link.company = a.company;
    if (!link.jobTitle && a.jobTitle) link.jobTitle = a.jobTitle;
    const uid = String(a.user ?? "");
    if (uid && !link.bidders.some((b) => b._id === uid)) link.bidders.push({ _id: uid, name: names.get(uid) ?? "Deleted account" });
  }
  const notApplied = [...links.values()].filter((l) => !appliedKeys.has(l.key));

  // Copies for this profile, matched by re-keying their URL so they follow urlKey changes; several copies that now
  // fall on one link are combined (latest copy, total count).
  const copies = await JobLinkCopy.find({ profile }).select("url urlKey copiedAt copiedBy count").lean<JobLinkCopyFields[]>();
  const copierIds = [...new Set(copies.map((c) => String(c.copiedBy ?? "")).filter((id) => id && !names.has(id)))];
  if (copierIds.length)
    for (const u of await User.find({ _id: { $in: copierIds } }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>()) names.set(String(u._id), u.name);
  for (const c of copies) {
    const link = links.get(urlKey(c.url || c.urlKey));
    if (!link) continue;
    link.copyCount += c.count;
    if (link.copiedAt && link.copiedAt >= c.copiedAt) continue;
    link.copiedAt = c.copiedAt;
    link.copiedBy = c.copiedBy ? (names.get(String(c.copiedBy)) ?? "Deleted account") : "";
  }

  const copied = sp.get("copied");
  const list = copied === "yes" ? notApplied.filter((l) => l.copiedAt) : copied === "no" ? notApplied.filter((l) => !l.copiedAt) : notApplied;

  if (sp.get("copy") === "1") {
    await markCopied(profile, list.map((l) => ({ url: l.url, urlKey: l.key })), staff._id);
    return NextResponse.json({ urls: list.map((l) => l.url) }, { headers: { "Cache-Control": "no-store" } });
  }

  const { page, limit, skip } = paging(sp, 50);
  return NextResponse.json({
    items: list.slice(skip, skip + limit),
    total: list.length,
    unique: links.size,
    applied: links.size - notApplied.length,
    notApplied: notApplied.length,
    copied: notApplied.filter((l) => l.copiedAt).length,
    page,
    limit,
  });
});

/** `{ profile, urls }` — marks job links the page copied to the clipboard (Copy selected, a row's copy icon) as copied for the profile. */
export const POST = handler(async (req: Request) => {
  const staff = await requireStaff();
  const body = await req.json().catch(() => null);
  const profile = profileParam(staff, body?.profile);
  const urls = Array.isArray(body?.urls) ? [...new Set((body.urls as unknown[]).filter((u): u is string => typeof u === "string").map((u) => u.trim()).filter(Boolean))] : [];
  if (!urls.length) throw new HttpError(400, "No job links selected");
  if (urls.length > MAX_SCAN) throw new HttpError(400, `Select ${MAX_SCAN} job links or fewer`);
  await markCopied(profile, urls.map((url) => ({ url, urlKey: urlKey(url) })), staff._id);
  return NextResponse.json({ ok: true, count: urls.length });
});
