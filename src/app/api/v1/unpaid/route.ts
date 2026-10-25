import { quietHandler } from "@/lib/auth";
import { apiJson, requireAccessKey } from "@/lib/apiAccess";
import { connectDB } from "@/lib/db";
import { Application } from "@/lib/models/Application";
import { Profile } from "@/lib/models/Profile";
import { User } from "@/lib/models/User";
import { oid } from "@/lib/query";

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/v1/unpaid — submitted applications not yet marked paid (fee-0 ones included), for the Unpaid Counter
 * desktop app. ?bidder=<user id> & ?profile=<profile id> narrow it. `total` uses both filters; `bidders` is filtered
 * by profile only and `profiles` by bidder only, so each dropdown shows counts within the other's choice.
 * Quiet: the app polls it every few seconds.
 */
export const GET = quietHandler(async (req: Request) => {
  await connectDB();
  await requireAccessKey(req);
  const sp = new URL(req.url).searchParams;
  const bidder = sp.get("bidder") ? oid(sp.get("bidder"), "bidder") : null;
  const profile = sp.get("profile") ? oid(sp.get("profile"), "profile") : null;

  const unpaid = { status: "submitted", paid: { $ne: true } };
  const byBidder = bidder ? { user: bidder } : {};
  const byProfile = profile ? { profile } : {};
  const sums = { count: { $sum: 1 }, amount: { $sum: "$fee" } };

  const [[total], bidderRows, profileRows] = await Promise.all([
    Application.aggregate<{ count: number; amount: number }>([{ $match: { ...unpaid, ...byBidder, ...byProfile } }, { $group: { _id: null, ...sums } }]),
    Application.aggregate<{ _id: unknown; count: number; amount: number; last: Date | null }>([
      { $match: { ...unpaid, ...byProfile } },
      { $group: { _id: "$user", ...sums, last: { $max: "$submittedAt" } } },
    ]),
    Application.aggregate<{ _id: unknown; count: number; amount: number; label: string }>([
      { $match: { ...unpaid, ...byBidder } },
      { $group: { _id: "$profile", ...sums, label: { $last: "$profileLabel" } } },
    ]),
  ]);

  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: bidderRows.map((r) => r._id) } }).select("name email role").lean(),
    Profile.find({ _id: { $in: profileRows.map((r) => r._id) } }).select("label").lean(),
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const labelById = new Map(profiles.map((p) => [String(p._id), p.label]));
  const byCount = (a: { count: number; name: string }, b: { count: number; name: string }) => b.count - a.count || a.name.localeCompare(b.name);

  return apiJson({
    updatedAt: new Date().toISOString(),
    total: { count: total?.count ?? 0, amount: money(total?.amount ?? 0) },
    bidders: bidderRows
      .map((r) => {
        const u = userById.get(String(r._id));
        return { id: String(r._id), name: u?.name ?? "(deleted account)", email: u?.email ?? "", role: u?.role ?? "", count: r.count, amount: money(r.amount), lastSubmittedAt: r.last ?? null };
      })
      .sort(byCount),
    profiles: profileRows
      .map((r) => ({ id: String(r._id), name: labelById.get(String(r._id)) ?? (r.label || "(deleted profile)"), count: r.count, amount: money(r.amount) }))
      .sort(byCount),
  });
});
