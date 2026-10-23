import JSZip from "jszip";
import { handler, HttpError, profileScope, requireStaff } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import "@/lib/models/Profile";
import "@/lib/models/User";
import { adminApplicationFilter } from "@/lib/adminFilter";
import { addApplicationToZip, zipResponse, type AppDocSource } from "@/lib/documents";
import { applicationFolders } from "@/lib/zipLayout";

export const maxDuration = 60;

const MAX_EXPORT = 300;

type Row = AppDocSource & {
  user?: { name?: string; email?: string } | null;
  profile?: { label?: string } | null;
  status: string;
  submittedAt?: Date;
  fee?: number;
  paid?: boolean;
  screenshots?: { url: string }[];
};

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Bulk ZIP download of generated documents ([Date]/[Profile]/[Index]_[Job Title]_[Company]/… plus summary.csv), filtered by user / profile / date range. */
export const GET = handler(async (req: Request) => {
  const staff = await requireStaff();
  const sp = new URL(req.url).searchParams;
  const filter = adminApplicationFilter(sp, profileScope(staff));
  const resumeOnly = sp.get("content") === "resume";
  // Only applications with documents can be exported.
  if (filter.status === "not_generated") throw new HttpError(404, "Not generated applications have no documents to export");
  if (!filter.status) filter.status = { $ne: "not_generated" };

  const count = await Application.countDocuments(filter);
  if (!count) throw new HttpError(404, "No applications match these filters");
  if (count > MAX_EXPORT) throw new HttpError(400, `${count} applications match — narrow the filters to ${MAX_EXPORT} or fewer`);

  const apps = await Application.find(filter)
    .populate("user", "name email")
    .populate("profile", "label")
    .sort({ createdAt: 1 })
    .lean<Row[]>();

  const zip = new JSZip();
  const csv = [["Date", "User", "Email", "Profile", "Company", "Job Title", "Location", "Status", "Submitted At", "Fee", "Paid", "Job URL", "Screenshots"]];
  const folders = await applicationFolders(apps);

  for (const app of apps) {
    const day = new Date(app.createdAt!).toISOString().slice(0, 10);
    await addApplicationToZip(zip, app, folders.get(String(app._id))!, resumeOnly);
    csv.push([
      day,
      app.user?.name ?? "",
      app.user?.email ?? "",
      app.profile?.label ?? "",
      app.company ?? "",
      app.jobTitle ?? "",
      app.jobLocation ?? "",
      app.status,
      app.submittedAt ? new Date(app.submittedAt).toISOString() : "",
      String(app.fee ?? 0),
      app.status === "submitted" ? (app.paid ? "Paid" : "Not paid") : "",
      app.jobUrl ?? "",
      (app.screenshots ?? []).map((s) => s.url).join(" "),
    ]);
  }
  zip.file("summary.csv", "﻿" + csv.map((r) => r.map(csvCell).join(",")).join("\r\n"));

  const data = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return zipResponse(data, `tailorbid_export_${new Date().toISOString().slice(0, 10)}.zip`);
});
