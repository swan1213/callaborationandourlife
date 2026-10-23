import type { Types } from "mongoose";
import { PostingRead } from "./models/PostingRead";

const TRACKING = /^(utm_[a-z]+|gh_src|gh_jid|source|src|ref|refid|trk|trackingId|lever-source|lever-origin|fbclid|gclid|mc_[a-z]+)$/i;

/** Same posting → same key: lowercase host, no www/hash/trailing slash, tracking params removed. */
export function postingKey(raw: string) {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const q = u.searchParams.toString();
    return `${host}${path}${q ? `?${q}` : ""}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

export async function markPostingRead(userId: Types.ObjectId | string, url: string) {
  if (!url) return;
  await PostingRead.updateOne(
    { user: userId, urlKey: postingKey(url) },
    { $set: { url, readAt: new Date() } },
    { upsert: true }
  );
}

/** Which of these URLs has the user already opened? */
export async function readUrlKeys(userId: Types.ObjectId | string, urls: (string | null | undefined)[]) {
  const keys = [...new Set(urls.filter((u): u is string => !!u).map(postingKey))];
  if (!keys.length) return new Set<string>();
  const rows = await PostingRead.find({ user: userId, urlKey: { $in: keys } }).select("urlKey").lean();
  return new Set(rows.map((r) => r.urlKey));
}

/** Adds `jobUrlRead` to each item for the current viewer. */
export async function withReadFlags<T extends { jobUrl?: string | null }>(userId: Types.ObjectId | string, items: T[]) {
  const read = await readUrlKeys(userId, items.map((i) => i.jobUrl));
  return items.map((i) => ({ ...i, jobUrlRead: !!i.jobUrl && read.has(postingKey(i.jobUrl)) }));
}
