import { Types } from "mongoose";
import { HttpError } from "./auth";

export function oid(id: string | null | undefined, name = "id") {
  if (!id || !Types.ObjectId.isValid(id)) throw new HttpError(400, `Invalid ${name}`);
  return new Types.ObjectId(id);
}

/** `from` / `to` are ISO timestamps (the client converts local day boundaries). */
export function dateRange(sp: URLSearchParams, field = "createdAt") {
  const range: Record<string, Date> = {};
  const from = sp.get("from");
  const to = sp.get("to");
  if (from && !isNaN(Date.parse(from))) range.$gte = new Date(from);
  if (to && !isNaN(Date.parse(to))) range.$lte = new Date(to);
  return Object.keys(range).length ? { [field]: range } : {};
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function textSearch(q: string | null, fields: string[]) {
  if (!q?.trim()) return {};
  const re = new RegExp(escapeRegex(q.trim()), "i");
  return { $or: fields.map((f) => ({ [f]: re })) };
}

export function monthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Hard ceiling for "All" so one request can't pull an unbounded collection. */
export const MAX_PAGE_ROWS = 5000;

/** ?page=&limit= where limit is 25 | 50 | 100 | "all" (any 1–MAX number is accepted). */
export function paging(sp: URLSearchParams, def = 25) {
  const raw = sp.get("limit");
  if (raw === "all") return { page: 1, limit: MAX_PAGE_ROWS, skip: 0 };
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const limit = Math.min(MAX_PAGE_ROWS, Math.max(1, parseInt(raw || String(def), 10) || def));
  return { page, limit, skip: (page - 1) * limit };
}
