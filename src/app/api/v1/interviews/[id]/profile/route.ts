import { handler, HttpError } from "@/lib/auth";
import { apiJson, profileOut, requireAccessKey } from "@/lib/apiAccess";
import { InterviewRequest } from "@/lib/models/InterviewRequest";
import { Profile } from "@/lib/models/Profile";
import { oid } from "@/lib/query";

/** GET /api/v1/interviews/:id/profile — full details of the interview's candidate profile. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAccessKey(req);
  const i = await InterviewRequest.findOne({ _id: oid((await params).id, "interview"), deletedAt: null }).select("profile").lean();
  if (!i) throw new HttpError(404, "Interview not found");
  const p = await Profile.findById(i.profile).select("-apiKey -openaiModel -monthlyQuota -__v").lean();
  if (!p) throw new HttpError(404, "Profile not found");
  return apiJson({ profile: profileOut(p as never) });
});
