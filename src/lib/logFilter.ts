import { oid, textSearch } from "./query";

/** Filter for the activity log: ?category=&level=&actor=&q=&from=&to= */
export function logFilter(sp: URLSearchParams) {
  const f: Record<string, unknown> = { ...textSearch(sp.get("q"), ["summary", "path", "actorName", "actorEmail", "action"]) };
  if (sp.get("category")) f.category = { $in: sp.get("category")!.split(",") };
  if (sp.get("level")) f.level = { $in: sp.get("level")!.split(",") };
  if (sp.get("actor")) f.actor = oid(sp.get("actor"), "user");
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;
  if (from || to) f.createdAt = { ...(from && !isNaN(+from) ? { $gte: from } : {}), ...(to && !isNaN(+to) ? { $lte: to } : {}) };
  return f;
}
