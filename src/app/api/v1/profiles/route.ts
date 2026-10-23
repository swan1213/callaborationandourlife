import { handler } from "@/lib/auth";
import { apiJson, requireAccessKey } from "@/lib/apiAccess";
import { Profile } from "@/lib/models/Profile";

/** GET /api/v1/profiles — candidate profiles (summary). ?active=false includes inactive ones. */
export const GET = handler(async (req: Request) => {
  await requireAccessKey(req);
  const all = new URL(req.url).searchParams.get("active") === "false";
  const profiles = await Profile.find(all ? {} : { active: true }).select("label fullName email phone location active").sort({ label: 1 }).lean();
  return apiJson({
    items: profiles.map((p) => ({
      id: String(p._id),
      label: p.label,
      fullName: p.fullName,
      email: p.email ?? "",
      phone: p.phone ?? "",
      location: p.location ?? "",
      active: p.active,
      links: { self: `/api/v1/profiles/${p._id}` },
    })),
  });
});
