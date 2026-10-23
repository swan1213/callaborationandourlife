import type { Types } from "mongoose";
import { Profile } from "./models/Profile";
import { User } from "./models/User";
import { appUrl, sendEmail } from "./email";
import { notifyEach } from "./inbox";
import { assignmentEmail } from "./emailTemplates";

export type AccountSnapshot = {
  _id: Types.ObjectId | string;
  name: string;
  email: string;
  role: string;
  status: string;
  assignedProfiles?: unknown[];
  managedProfiles?: unknown[];
};

const FIELDS = "name email role status assignedProfiles managedProfiles";

/** Current assignment state of the given accounts (call before and after a change). */
export async function snapshotAccounts(ids: (string | Types.ObjectId)[]): Promise<AccountSnapshot[]> {
  if (!ids.length) return [];
  return User.find({ _id: { $in: ids } }).select(FIELDS).lean<AccountSnapshot[]>();
}

const idSet = (v?: unknown[]) => new Set((v ?? []).map(String));
const minus = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));

/**
 * Emails every active account whose profile assignments changed between `before` and `after`.
 * Bidders are told about profiles they can (no longer) generate with; users/admins about profiles they (no longer) manage.
 * The person who made the change is not notified. Never throws.
 */
export async function notifyAssignmentChanges(before: AccountSnapshot[], after: AccountSnapshot[], actor: { id: string; name: string }) {
  try {
    const prev = new Map(before.map((a) => [String(a._id), a]));
    const changes = after
      .filter((a) => String(a._id) !== actor.id && a.status === "approved")
      .map((a) => {
        const b = prev.get(String(a._id));
        const [ga, gb] = [idSet(a.assignedProfiles), idSet(b?.assignedProfiles)];
        const [ma, mb] = [idSet(a.managedProfiles), idSet(b?.managedProfiles)];
        return {
          account: a,
          generate: { added: minus(ga, gb), removed: minus(gb, ga) },
          manage: { added: minus(ma, mb), removed: minus(mb, ma) },
        };
      })
      .filter((c) => c.generate.added.length + c.generate.removed.length + c.manage.added.length + c.manage.removed.length > 0);
    if (!changes.length) return;

    const profileIds = [...new Set(changes.flatMap((c) => [...c.generate.added, ...c.generate.removed, ...c.manage.added, ...c.manage.removed]))];
    const profiles = await Profile.find({ _id: { $in: profileIds } }).select("label").lean();
    const label = new Map(profiles.map((p) => [String(p._id), p.label]));
    const names = (ids: string[]) => ids.map((id) => label.get(id) ?? "A deleted profile");
    const url = appUrl();

    const list = (ids: string[]) => names(ids).join(", ");
    await notifyEach(
      changes.map((c) => ({
        to: [c.account._id],
        n: {
          kind: "assignment" as const,
          title: "Your profiles changed",
          body: [
            c.generate.added.length && `You can now use: ${list(c.generate.added)}.`,
            c.generate.removed.length && `No longer: ${list(c.generate.removed)}.`,
            c.manage.added.length && `You now manage: ${list(c.manage.added)}.`,
            c.manage.removed.length && `You no longer manage: ${list(c.manage.removed)}.`,
            `Changed by ${actor.name}.`,
          ]
            .filter(Boolean)
            .join(" "),
          url: c.account.role === "bidder" ? "/dashboard/import" : c.account.role === "caller" ? "/profiles" : "/admin/profiles",
        },
      }))
    );
    await Promise.all(
      changes.map((c) =>
        sendEmail(
          c.account.email,
          assignmentEmail({
            name: c.account.name,
            role: c.account.role,
            generate: { added: names(c.generate.added), removed: names(c.generate.removed) },
            manage: { added: names(c.manage.added), removed: names(c.manage.removed) },
            changedBy: actor.name,
            url,
          })
        )
      )
    );
  } catch (e) {
    console.error("assignment notifications failed", e);
  }
}
