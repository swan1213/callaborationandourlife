import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { handler, HttpError, profileScope, requireStaff } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { adminApplicationFilter } from "@/lib/adminFilter";
import { paging } from "@/lib/query";
import { urlKey } from "@/lib/links";
import { JobLinkExport, markCopied, type JobLinkExportFields } from "@/lib/models/JobLinkExport";

/** Most applications read per request; the page asks to narrow the filters beyond this. */
const MAX_SCAN = 50000;

type Source = { _id: Types.ObjectId; user?: Types.ObjectId | null; jobUrl: string; company?: string; jobTitle?: string; status: string; createdAt: Date };
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
  /** Last time this link was copied (null: never). */
  copiedAt: Date | null;
  copiedBy: string;
  copyCount: number;
};

/**
 * Every job link bidders generated from, once each: links that only differ by tracking parameters, #fragment,
 * "www.", letter case or an /apply page (lib/links.ts urlKey) count as one. Newest first.
 * `?copy=1` returns every matching URL (Copy all links) and marks them as copied.
 */
export const GET = handler(async (req: Request) => {
  const staff = await requireStaff();
  const sp = new URL(req.url).searchParams;
  const filter = { ...adminApplicationFilter(sp, profileScope(staff)), jobUrl: { $nin: ["", null] } };

  const apps = await Application.find(filter)
    .select("user jobUrl company jobTitle status createdAt")
    .sort({ createdAt: -1 })
    .limit(MAX_SCAN + 1)
    .lean<Source[]>();
  if (apps.length > MAX_SCAN) throw new HttpError(400, `More than ${MAX_SCAN} applications match: narrow the filters`);

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

  // Copy marks are matched by re-keying their URL, so marks saved under an older urlKey still count; several marks
  // that now fall on one link are combined (latest copy, total count).
  const marks = await JobLinkExport.find().select("url urlKey exportedAt exportedBy count").lean<JobLinkExportFields[]>();
  const copierIds = [...new Set(marks.map((e) => String(e.exportedBy ?? "")).filter((id) => id && !names.has(id)))];
  if (copierIds.length)
    for (const u of await User.find({ _id: { $in: copierIds } }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>()) names.set(String(u._id), u.name);
  for (const e of marks) {
    const link = links.get(urlKey(e.url || e.urlKey));
    if (!link) continue;
    link.copyCount += e.count;
    if (link.copiedAt && link.copiedAt >= e.exportedAt) continue;
    link.copiedAt = e.exportedAt;
    link.copiedBy = e.exportedBy ? names.get(String(e.exportedBy)) ?? "Deleted account" : "";
  }

  // ?copied=yes|no narrows to links already copied / never copied.
  const copied = sp.get("copied");
  const unfiltered = [...links.values()];
  const all = copied === "yes" ? unfiltered.filter((l) => l.copiedAt) : copied === "no" ? unfiltered.filter((l) => !l.copiedAt) : unfiltered;

  if (sp.get("copy") === "1") {
    await markCopied(all.map((l) => ({ url: l.url, urlKey: l.key })), staff._id);
    return NextResponse.json({ urls: all.map((l) => l.url) }, { headers: { "Cache-Control": "no-store" } });
  }

  const { page, limit, skip } = paging(sp, 50);
  return NextResponse.json({
    items: all.slice(skip, skip + limit),
    total: all.length,
    applications: apps.length,
    duplicates: apps.length - unfiltered.length,
    copied: unfiltered.filter((l) => l.copiedAt).length,
    page,
    limit,
  });
});

/** `{ urls }` — marks job links the page copied to the clipboard (Copy selected, a row's copy icon) as copied. */
export const POST = handler(async (req: Request) => {
  const staff = await requireStaff();
  const body = await req.json().catch(() => null);
  const urls = Array.isArray(body?.urls) ? [...new Set((body.urls as unknown[]).filter((u): u is string => typeof u === "string").map((u) => u.trim()).filter(Boolean))] : [];
  if (!urls.length) throw new HttpError(400, "No job links selected");
  if (urls.length > MAX_SCAN) throw new HttpError(400, `Select ${MAX_SCAN} job links or fewer`);
  await markCopied(urls.map((url) => ({ url, urlKey: urlKey(url) })), staff._id);
  return NextResponse.json({ ok: true, count: urls.length });
});
