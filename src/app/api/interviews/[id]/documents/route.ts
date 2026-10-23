import { canRequestInterviews, handler, HttpError, requireUser } from "@/lib/auth";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { Application } from "@/lib/models/Application";
import { interviewVisibility } from "@/lib/interviews";
import { applicationZip, jobDescriptionDocx, resumeDocx, resumePdf, zipFileName, zipResponse, type AppDocSource } from "@/lib/documents";
import { oid } from "@/lib/query";
import { applicationFileBases, applicationFolders } from "@/lib/zipLayout";

export const maxDuration = 60;

const TYPES = {
  "resume-pdf": { ext: "pdf", mime: "application/pdf", suffix: "Resume" },
  "resume-docx": { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", suffix: "Resume" },
  jd: { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", suffix: "Job_Description" },
} as const;

/**
 * GET ?type=zip|resume-pdf|resume-docx|jd — the resume and job description of the application an interview is for.
 * Anyone who can see the interview (its caller, open-request callers, the requester, staff) can download them.
 */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  if (user.role === "bidder" && !canRequestInterviews(user)) throw new HttpError(403, "Interview requests are not enabled for your account");
  const iv = await InterviewRequest.findOne({ $and: [{ _id: oid((await params).id) }, interviewVisibility(user)] })
    .select("application")
    .lean();
  if (!iv) throw new HttpError(404, "Interview request not found");
  if (!iv.application) throw new HttpError(404, "No application is linked to this interview");
  const app = await Application.findById(iv.application).lean<AppDocSource>();
  if (!app?.resume) throw new HttpError(404, "The linked application has no documents");

  const type = new URL(req.url).searchParams.get("type") ?? "zip";
  if (type === "zip") return zipResponse(await applicationZip(app, (await applicationFolders([app])).get(String(app._id))!), zipFileName(app));
  const t = TYPES[type as keyof typeof TYPES];
  if (!t) throw new HttpError(400, "Unknown document type");
  const data = type === "resume-pdf" ? await resumePdf(app.resume, app.resumeDesign) : type === "resume-docx" ? await resumeDocx(app.resume, app.resumeDesign) : await jobDescriptionDocx(app);
  const name = `${(await applicationFileBases([app])).get(String(app._id))}_${t.suffix}.${t.ext}`;
  return new Response(data as unknown as BodyInit, {
    headers: {
      "Content-Type": t.mime,
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
});
