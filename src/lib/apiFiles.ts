// File downloads for the external API: resume (PDF / DOCX) and job description (DOCX) of an application.
import { HttpError } from "./auth";
import { Application } from "./models/Application";
import { baseFileName, jobDescriptionDocx, resumeDocx, resumePdf, type AppDocSource } from "./documents";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function file(data: Uint8Array | Buffer, name: string, mime: string) {
  return new Response(data as unknown as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function loadApplicationDocs(applicationId: unknown) {
  if (!applicationId) throw new HttpError(404, "No application is linked to this interview");
  const app = await Application.findById(applicationId).populate("profile", "label").lean();
  if (!app || app.status === "not_generated" || !app.resume) throw new HttpError(404, "The application has no generated documents");
  return app;
}

/** ?format=pdf | docx (resume) or jd-docx (job description) → a file; anything else → null (send JSON). */
export async function documentFile(app: AppDocSource, format: string | null) {
  if (format === "pdf") return file(await resumePdf(app.resume, app.resumeDesign), `${baseFileName(app)}_Resume.pdf`, "application/pdf");
  if (format === "docx") return file(await resumeDocx(app.resume, app.resumeDesign), `${baseFileName(app)}_Resume.docx`, DOCX);
  if (format === "jd-docx") return file(await jobDescriptionDocx(app), `${baseFileName(app)}_Job_Description.docx`, DOCX);
  if (format && format !== "json") throw new HttpError(400, "format must be json, pdf, docx or jd-docx");
  return null;
}
