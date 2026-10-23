import { NextResponse } from "next/server";
import { canRequestInterviews, quietHandler, requireUser } from "@/lib/auth";
import { Profile } from "@/lib/models/Profile";
import { getDisabledPages } from "@/lib/pageAccessStore";
import type { EditableRole } from "@/lib/pageAccess";
import { LATEST_RELEASE, RELEASE_NOTES } from "@/lib/releaseNotes";

/**
 * GET ?since=<ISO time from the first answer> — what changed for this account while a page is open
 * (components/UpdatePrompt.tsx): profiles it uses that someone else edited since then, plus a snapshot of its access
 * (role, profiles, interview access, pages turned off) that the page compares with the one it loaded with, and the
 * newest release note this deployment has (lib/releaseNotes.ts): a page built with an older one is out of date.
 * Polled, so not in the activity log. A signed-out or deactivated account gets 401.
 */
export const GET = quietHandler(async (req: Request) => {
  const user = await requireUser();
  const raw = new URL(req.url).searchParams.get("since");
  const since = raw ? new Date(raw) : null;

  const assigned = (user.assignedProfiles ?? []).map(String);
  const managed = (user.managedProfiles ?? []).map(String);
  const ids = [...new Set([...assigned, ...managed])];
  const [profiles, disabled] = await Promise.all([
    ids.length ? Profile.find({ _id: { $in: ids } }).select("label contentUpdatedAt contentUpdatedBy contentUpdatedByName contentChanges").lean() : [],
    user.role === "admin" ? {} : getDisabledPages(),
  ]);
  const label = Object.fromEntries(profiles.map((p) => [String(p._id), p.label]));

  const edited =
    since && !isNaN(since.getTime())
      ? profiles.filter((p) => p.contentUpdatedAt && p.contentUpdatedAt > since && String(p.contentUpdatedBy) !== String(user._id))
      : [];
  return NextResponse.json({
    now: new Date(),
    release: { id: LATEST_RELEASE, title: RELEASE_NOTES[0]?.title ?? "" },
    profiles: edited.map((p) => ({ id: String(p._id), label: p.label, at: p.contentUpdatedAt, by: p.contentUpdatedByName, sections: p.contentChanges })),
    account: {
      role: user.role,
      interviewAccess: canRequestInterviews(user),
      profiles: Object.fromEntries(assigned.filter((id) => label[id]).map((id) => [id, label[id]])),
      managed: Object.fromEntries(managed.filter((id) => label[id]).map((id) => [id, label[id]])),
      pages: [...((disabled as Record<string, string[]>)[user.role as EditableRole] ?? [])].sort(),
    },
  });
});
