import { handler, HttpError } from "@/lib/auth";
import { apiJson, interviewOut, requireAccessKey } from "@/lib/apiAccess";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import "@/lib/models/Profile";
import "@/lib/models/User";
import { oid } from "@/lib/query";

/** GET /api/v1/interviews/:id — one interview (links to its profile, resume and job description). */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAccessKey(req);
  const i = await InterviewRequest.findOne({ _id: oid((await params).id, "interview"), deletedAt: null })
    .populate("profile", "label fullName")
    .populate("caller", "name email")
    .populate("requestedBy", "name")
    .lean();
  if (!i) throw new HttpError(404, "Interview not found");
  return apiJson({ interview: interviewOut(i as never) });
});
