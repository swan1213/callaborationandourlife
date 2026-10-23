import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { handler, HttpError, profileScope, requireStaff } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { adminApplicationFilter } from "@/lib/adminFilter";
import { paging } from "@/lib/query";
import { urlKey } from "@/lib/links";
import { JobLinkExport, markExported, type JobLinkExportFields } from "@/lib/models/JobLinkExport";

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
  /** Last TXT/CSV download that included this link (null: never downloaded). */
  exportedAt: Date | null;
  exportedBy: string;
  exportCount: number;
};

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Every job link bidders generated from, once each: links that only differ by tracking parameters, #fragment,
 * trailing slash or host case (lib/links.ts urlKey) count as one. Newest first. `?format=csv|txt` downloads the list and marks it exported.
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
      link = { url, company: a.company || "", jobTitle: a.jobTitle || "", count: 0, bidders: [], firstAt: a.createdAt, lastAt: a.createdAt, applicationId: String(a._id), key, exportedAt: null, exportedBy: "", exportCount: 0 };
      links.set(key, link);
    }
    link.count++;
    link.firstAt = a.createdAt;
    if (!link.company && a.company) link.company = a.company;
    if (!link.jobTitle && a.jobTitle) link.jobTitle = a.jobTitle;
    const uid = String(a.user ?? "");
    if (uid && !link.bidders.some((b) => b._id === uid)) link.bidders.push({ _id: uid, name: names.get(uid) ?? "Deleted account" });
  }

  const exports = await JobLinkExport.find({ urlKey: { $in: [...links.keys()] } }).lean<JobLinkExportFields[]>();
  const exporterIds = [...new Set(exports.map((e) => String(e.exportedBy ?? "")).filter((id) => id && !names.has(id)))];
  if (exporterIds.length)
    for (const u of await User.find({ _id: { $in: exporterIds } }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>()) names.set(String(u._id), u.name);
  for (const e of exports) {
    const link = links.get(e.urlKey);
    if (!link) continue;
    link.exportedAt = e.exportedAt;
    link.exportedBy = e.exportedBy ? names.get(String(e.exportedBy)) ?? "Deleted account" : "";
    link.exportCount = e.count;
  }

  // ?exported=yes|no narrows to links already downloaded / never downloaded.
  const exported = sp.get("exported");
  const unfiltered = [...links.values()];
  const all = exported === "yes" ? unfiltered.filter((l) => l.exportedAt) : exported === "no" ? unfiltered.filter((l) => !l.exportedAt) : unfiltered;

  const format = sp.get("format");
  const day = new Date().toISOString().slice(0, 10);
  // Downloads mark their links as exported; ?copy=1 (Copy all links) only reads them.
  if ((format === "txt" || format === "csv") && sp.get("copy") !== "1") await markExported(all.map((l) => ({ url: l.url, urlKey: l.key })), staff._id);
  if (format === "txt") return download(all.map((l) => l.url).join("\r\n"), `job_links_${day}.txt`, "text/plain");
  if (format === "csv") {
    const rows = [["Job URL", "Company", "Job Title", "Applications", "Bidders", "First Generated", "Last Generated", "Last Exported"]];
    for (const l of all)
      rows.push([l.url, l.company, l.jobTitle, String(l.count), l.bidders.map((b) => b.name).join("; "), l.firstAt.toISOString(), l.lastAt.toISOString(), l.exportedAt?.toISOString() ?? ""]);
    return download("﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), `job_links_${day}.csv`, "text/csv");
  }

  const { page, limit, skip } = paging(sp, 50);
  return NextResponse.json({
    items: all.slice(skip, skip + limit),
    total: all.length,
    applications: apps.length,
    duplicates: apps.length - unfiltered.length,
    exported: unfiltered.filter((l) => l.exportedAt).length,
    page,
    limit,
  });
});

/** Downloads the ticked job links (`{ urls }`) as TXT, one per line, and marks them as exported. */
export const POST = handler(async (req: Request) => {
  const staff = await requireStaff();
  const body = await req.json().catch(() => null);
  const urls = Array.isArray(body?.urls) ? [...new Set((body.urls as unknown[]).filter((u): u is string => typeof u === "string").map((u) => u.trim()).filter(Boolean))] : [];
  if (!urls.length) throw new HttpError(400, "No job links selected");
  if (urls.length > MAX_SCAN) throw new HttpError(400, `Select ${MAX_SCAN} job links or fewer`);
  await markExported(urls.map((url) => ({ url, urlKey: urlKey(url) })), staff._id);
  const day = new Date().toISOString().slice(0, 10);
  return download(urls.join("\r\n"), `job_links_selected_${day}.txt`, "text/plain");
});

function download(body: string, filename: string, type: string) {
  return new Response(body, {
    headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
