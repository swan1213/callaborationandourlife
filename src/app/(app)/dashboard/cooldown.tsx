"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { fmtDate } from "@/components/ui";

/** The profile's earlier application that the same-company rule counts (lib/cooldown.ts describeHit). */
export type CooldownInfo = {
  company: string;
  jobTitle: string;
  lastAppliedAt: string;
  eligibleAt: string;
  days: number;
  scope: "company" | "role";
  sameRoleOnly: boolean;
  byName: string;
  /** null when this person may not open it (another bidder's application). */
  appId: string | null;
};
/** Another profile of this person and when it can apply to the company (null = now). */
export type CooldownAlternative = { id: string; label: string; eligibleAt: string | null };

/** GET /api/applications/check */
export type PreCheck = {
  duplicate: { id: string; status: string; company: string; jobTitle: string; createdAt: string } | null;
  cooldown: CooldownInfo | null;
  alternatives: CooldownAlternative[];
};

/** "Sam · Senior Engineer · 2026-10-27": who applied, for what, when. */
export function cooldownWho(c: CooldownInfo) {
  return [c.byName === "you" ? "by you" : `by ${c.byName}`, c.jobTitle, fmtDate(c.lastAppliedAt)].filter(Boolean).join(" · ");
}

/**
 * Under a cooldown warning or refusal: open the earlier application, and the person's other profiles that can apply
 * now (click to switch) or later (with the date).
 */
export function CooldownActions({ cooldown, alternatives, onPick }: { cooldown: CooldownInfo; alternatives: CooldownAlternative[]; onPick?: (id: string) => void }) {
  const free = alternatives.filter((a) => !a.eligibleAt);
  const later = alternatives.filter((a) => a.eligibleAt);
  return (
    <div className="mt-2 space-y-2">
      <div className="text-xs opacity-90">
        Earlier application: {cooldown.company} · {cooldownWho(cooldown)}
        {cooldown.appId && (
          <>
            {" "}
            <Link href={`/applications/${cooldown.appId}`} className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2">
              View it
              <ArrowRight className="size-3" />
            </Link>
          </>
        )}
      </div>
      {free.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span>Try another profile, free for {cooldown.company} now:</span>
          {free.slice(0, 8).map((a) =>
            onPick ? (
              <button key={a.id} type="button" className="btn btn-secondary btn-sm h-7 px-2 text-xs" onClick={() => onPick(a.id)}>
                {a.label}
              </button>
            ) : (
              <span key={a.id} className="chip">
                {a.label}
              </span>
            )
          )}
          {free.length > 8 && <span>+{free.length - 8} more</span>}
        </div>
      ) : (
        alternatives.length > 0 && <div className="text-xs">None of your other profiles can apply to {cooldown.company} right now.</div>
      )}
      {later.length > 0 && free.length < 8 && (
        <div className="text-xs opacity-80">
          Later: {later.slice(0, 5).map((a) => `${a.label} (${fmtDate(a.eligibleAt)})`).join(", ")}
          {later.length > 5 && `, +${later.length - 5} more`}
        </div>
      )}
    </div>
  );
}
