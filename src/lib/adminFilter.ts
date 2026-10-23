import type { Types } from "mongoose";
import { HttpError } from "./auth";
import { dateRange, oid, textSearch } from "./query";

/** Shared filter for the admin application history and bulk export. `scope` = managed profiles (null = all). */
export function adminApplicationFilter(sp: URLSearchParams, scope: Types.ObjectId[] | null = null) {
  const filter: Record<string, unknown> = {
    ...dateRange(sp),
    ...textSearch(sp.get("q"), ["company", "jobTitle", "jobUrl"]),
  };
  if (sp.get("user")) filter.user = oid(sp.get("user"), "user");
  if (sp.get("status")) filter.status = sp.get("status");
  // Paid applies to submitted applications (only those carry a fee).
  if (sp.get("paid") === "paid") Object.assign(filter, { status: "submitted", paid: true });
  else if (sp.get("paid") === "unpaid") Object.assign(filter, { status: "submitted", paid: { $ne: true } });
  if (sp.get("profile")) {
    const pid = oid(sp.get("profile"), "profile");
    if (scope && !scope.some((p) => String(p) === String(pid))) throw new HttpError(403, "You do not manage this profile");
    filter.profile = pid;
  } else if (scope) filter.profile = { $in: scope };
  return filter;
}
