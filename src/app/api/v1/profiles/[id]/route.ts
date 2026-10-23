import { handler, HttpError } from "@/lib/auth";
import { apiJson, profileOut, requireAccessKey } from "@/lib/apiAccess";
import { Profile } from "@/lib/models/Profile";
import { oid } from "@/lib/query";

/** GET /api/v1/profiles/:id — full profile details (contact, work history, education, application answers…). */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAccessKey(req);
  const p = await Profile.findById(oid((await params).id, "profile")).select("-apiKey -openaiModel -monthlyQuota -__v").lean();
  if (!p) throw new HttpError(404, "Profile not found");
  return apiJson({ profile: profileOut(p as never) });
});
