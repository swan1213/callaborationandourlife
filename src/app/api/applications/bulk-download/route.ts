import JSZip from "jszip";
import { handler, HttpError, profileScope, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { addApplicationToZip, coverLetterPdf, resumePdf, zipResponse, type AppDocSource } from "@/lib/documents";
import { oid } from "@/lib/query";
import { applicationFolders } from "@/lib/zipLayout";

export const maxDuration = 60;

const MAX_SELECTED = 100;

/**
 * POST { ids: string[], content?: "all" | "resume" | "resume-pdf" | "cover-pdf" } → one ZIP.
 * "all" (default): a folder per application, [Date]/[Profile]/[Index]_[Job Title]_[Company] (zipLayout.ts), with resume PDF + DOCX,
 * cover letter PDF + DOCX and job description DOCX; "resume": resumes only (PDF + DOCX, same folders); "resume-pdf" / "cover-pdf": just those PDFs,
 * in the same folders.
 * Bidders get their own applications; users (managers) those of their profiles; admins any.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await req.json();
  const ids = [...new Set(((body.ids as string[]) ?? []).map((id) => String(oid(id, "application"))))];
  if (!ids.length) throw new HttpError(400, "Select at least one application");
  if (ids.length > MAX_SELECTED) throw new HttpError(400, `Select ${MAX_SELECTED} applications or fewer per download`);
  const content = ["resume", "resume-pdf", "cover-pdf"].includes(body.content) ? (body.content as string) : "all";
  const resumeOnly = content === "resume";

  const access: Record<string, unknown> =
    user.role === "admin"
      ? {}
      : user.role === "user"
        ? { $or: [{ user: user._id, deletedByUser: false }, { profile: { $in: profileScope(user) ?? [] } }] }
        : { user: user._id, deletedByUser: false };
  const apps = await Application.find({ _id: { $in: ids }, status: { $ne: "not_generated" }, resume: { $ne: null }, ...access })
    .sort({ createdAt: -1 })
    .lean<AppDocSource[]>();
  if (!apps.length) throw new HttpError(404, "None of the selected applications have generated documents");

  const zip = new JSZip();
  if (content === "resume-pdf" || content === "cover-pdf") {
    const withResume = content !== "cover-pdf";
    const withCover = content !== "resume-pdf";
    const [folders, pdfs] = await Promise.all([
      applicationFolders(apps),
      Promise.all(apps.map((app) => Promise.all([withResume ? resumePdf(app.resume, app.resumeDesign) : null, withCover ? coverLetterPdf(app) : null]))),
    ]);
    apps.forEach((app, i) => {
      const folder = folders.get(String(app._id))!;
      const [resume, cover] = pdfs[i];
      if (resume) zip.file(`${folder}/Resume.pdf`, resume);
      if (cover) zip.file(`${folder}/Cover_Letter.pdf`, cover);
    });
  } else {
    const folders = await applicationFolders(apps);
    for (const app of apps) await addApplicationToZip(zip, app, folders.get(String(app._id))!, resumeOnly);
  }
  const data = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const stamp = new Date().toISOString().slice(0, 10);
  const kind = { all: "applications", resume: "resumes", "resume-pdf": "resume-pdfs", "cover-pdf": "cover-letter-pdfs" }[content];
  return zipResponse(data, `${stamp}-${kind}-${apps.length}.zip`);
});
