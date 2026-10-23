import { handler, requireUser } from "@/lib/auth";
import { ActivityLog } from "@/lib/models/ActivityLog";
import { logFilter } from "@/lib/logFilter";

const MAX = 20000;
const cell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const stamp = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

/** CSV of the filtered activity log (admin), up to 20,000 rows. */
export const GET = handler(async (req: Request) => {
  await requireUser("admin");
  const rows = await ActivityLog.find(logFilter(new URL(req.url).searchParams)).sort({ createdAt: -1 }).limit(MAX).lean();
  const head = ["Time (UTC)", "Level", "Category", "Summary", "Actor", "Email", "Role", "Method", "Path", "Status", "Duration ms", "IP", "User agent", "Details"];
  const lines = rows.map((r) =>
    [stamp(new Date(r.createdAt!)), r.level, r.category, r.summary, r.actorName, r.actorEmail, r.actorRole, r.method, r.path, r.status, r.durationMs, r.ip, r.userAgent, r.meta].map(cell).join(",")
  );
  const name = `tailorbid-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + [head.join(","), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
});
