import { handler, HttpError } from "@/lib/auth";
import { apiJson, applicationOut, requireAccessKey } from "@/lib/apiAccess";
import { documentFile, loadApplicationDocs } from "@/lib/apiFiles";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { oid } from "@/lib/query";
import type { AppDocSource } from "@/lib/documents";

export const maxDuration = 60;

/**
 * GET /api/v1/interviews/:id/resume — the generated resume the interview is for (with cover letter and job description).
 * ?format=json (default) | pdf | docx | jd-docx
 */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAccessKey(req);
  const i = await InterviewRequest.findOne({ _id: oid((await params).id, "interview"), deletedAt: null }).select("application").lean();
  if (!i) throw new HttpError(404, "Interview not found");
  const app = await loadApplicationDocs(i.application);
  const f = await documentFile(app as unknown as AppDocSource, new URL(req.url).searchParams.get("format"));
  return f ?? apiJson({ application: applicationOut(app as never) });
});
