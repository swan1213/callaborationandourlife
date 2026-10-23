import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { applicationZip, coverLetterPdf, resumePdf, zipFileName, zipResponse, type AppDocSource } from "@/lib/documents";
import { oid } from "@/lib/query";
import { applicationFileBases, applicationFolders } from "@/lib/zipLayout";

/** ZIP of all documents ([Date]/[Profile]/[Index]_[Job Title]_[Company]/…, see zipLayout.ts), or `?format=resume-pdf` / `?format=cover-pdf` for just the resume or cover letter PDF, named [Date]_[Profile]_[Index]_[Job Title]_[Company]_Resume.pdf. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const app = await Application.findById(oid((await params).id)).lean<
    AppDocSource & { user: unknown; profile: unknown; deletedByUser: boolean }
  >();
  const isOwner = app && String(app.user) === String(user._id) && !app.deletedByUser;
  const isRep = app && user.role === "user" && canManageProfile(user, app.profile);
  if (!app || (!isOwner && !isRep && user.role !== "admin")) throw new HttpError(404, "Application not found");
  if (!app.resume) throw new HttpError(400, "This application has not been generated yet. Add the job description first.");

  const format = new URL(req.url).searchParams.get("format");
  if (format === "resume-pdf" || format === "cover-pdf") {
    const base = (await applicationFileBases([app])).get(String(app._id))!;
    const name = `${base}_${format === "resume-pdf" ? "Resume" : "Cover_Letter"}.pdf`;
    const pdf = format === "resume-pdf" ? await resumePdf(app.resume, app.resumeDesign) : await coverLetterPdf(app);
    return new Response(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  }
  const folder = (await applicationFolders([app])).get(String(app._id))!;
  return zipResponse(await applicationZip(app, folder), zipFileName(app));
});
