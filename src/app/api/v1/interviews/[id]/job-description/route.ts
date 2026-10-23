import { handler, HttpError } from "@/lib/auth";
import { apiJson, requireAccessKey } from "@/lib/apiAccess";
import { documentFile, loadApplicationDocs } from "@/lib/apiFiles";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { oid } from "@/lib/query";
import type { AppDocSource } from "@/lib/documents";

export const maxDuration = 60;

/** GET /api/v1/interviews/:id/job-description — the job posting the interview is for. ?format=json (default) | docx */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAccessKey(req);
  const i = await InterviewRequest.findOne({ _id: oid((await params).id, "interview"), deletedAt: null }).select("application company jobTitle").lean();
  if (!i) throw new HttpError(404, "Interview not found");
  const app = await loadApplicationDocs(i.application);
  const format = new URL(req.url).searchParams.get("format");
  if (format === "docx") return (await documentFile(app as unknown as AppDocSource, "jd-docx"))!;
  if (format && format !== "json") throw new HttpError(400, "format must be json or docx");
  return apiJson({
    jobDescription: { company: app.company, jobTitle: app.jobTitle, jobLocation: app.jobLocation ?? "", jobUrl: app.jobUrl ?? "", text: app.jobDescription ?? "" },
  });
});
