import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { handler, HttpError, profileScope, requireStaff } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { User } from "@/lib/models/User";
import { adminApplicationFilter } from "@/lib/adminFilter";
import { paging } from "@/lib/query";
import { urlKey } from "@/lib/links";

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
};

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Every job link bidders generated from, once each: links that only differ by tracking parameters, #fragment,
 * trailing slash or host case (lib/links.ts urlKey) count as one. Newest first. `?format=csv|txt` downloads the list.
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
      link = { url, company: a.company || "", jobTitle: a.jobTitle || "", count: 0, bidders: [], firstAt: a.createdAt, lastAt: a.createdAt, applicationId: String(a._id) };
      links.set(key, link);
    }
    link.count++;
    link.firstAt = a.createdAt;
    if (!link.company && a.company) link.company = a.company;
    if (!link.jobTitle && a.jobTitle) link.jobTitle = a.jobTitle;
    const uid = String(a.user ?? "");
    if (uid && !link.bidders.some((b) => b._id === uid)) link.bidders.push({ _id: uid, name: names.get(uid) ?? "Deleted account" });
  }
  const all = [...links.values()];

  const format = sp.get("format");
  const day = new Date().toISOString().slice(0, 10);
  if (format === "txt") return download(all.map((l) => l.url).join("\r\n"), `job_links_${day}.txt`, "text/plain");
  if (format === "csv") {
    const rows = [["Job URL", "Company", "Job Title", "Applications", "Bidders", "First Generated", "Last Generated"]];
    for (const l of all)
      rows.push([l.url, l.company, l.jobTitle, String(l.count), l.bidders.map((b) => b.name).join("; "), l.firstAt.toISOString(), l.lastAt.toISOString()]);
    return download("﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), `job_links_${day}.csv`, "text/csv");
  }

  const { page, limit, skip } = paging(sp, 50);
  return NextResponse.json({ items: all.slice(skip, skip + limit), total: all.length, applications: apps.length, duplicates: apps.length - all.length, page, limit });
});

function download(body: string, filename: string, type: string) {
  return new Response(body, {
    headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
