import type { Types } from "mongoose";
import { AppView } from "./models/AppView";

type Id = Types.ObjectId | string;

export async function markViewed(userId: Id, applicationId: Id) {
  await AppView.updateOne({ user: userId, application: applicationId }, { $set: { viewedAt: new Date() } }, { upsert: true });
}

export async function markUnviewed(userId: Id, applicationId: Id) {
  await AppView.deleteOne({ user: userId, application: applicationId });
}

/** Adds `viewed` (has the current viewer opened it?) to each application row. */
export async function withViewFlags<T extends { _id: unknown }>(userId: Id, items: T[]) {
  if (!items.length) return items.map((i) => ({ ...i, viewed: false }));
  const rows = await AppView.find({ user: userId, application: { $in: items.map((i) => i._id) } } as Record<string, unknown>)
    .select("application")
    .lean();
  const seen = new Set(rows.map((r) => String(r.application)));
  return items.map((i) => ({ ...i, viewed: seen.has(String(i._id)) }));
}

/** How many of the matching applications this viewer has not opened yet. */
export async function unviewedCount(userId: Id, applicationIds: Id[]) {
  if (!applicationIds.length) return 0;
  const viewed = await AppView.countDocuments({ user: userId, application: { $in: applicationIds } });
  return applicationIds.length - viewed;
}
