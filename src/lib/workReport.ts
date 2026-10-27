// A member's automatic daily report (lib/memberReports.ts builds it; the chat shows it as a card in Daily reports).
// Client-safe: no server imports.

export type WorkReport = {
  /** The report day ("YYYY-MM-DD" in Settings.reportTimezone). */
  day: string;
  /** What it covers: from the previous report to when this one was made (ISO). */
  from: string;
  to: string;
  role: string;
  /** Time with TailorBid or the Interview Assistant open and in use (WorkSession), and the first / last moment. */
  work: { minutes: number; first: string | null; last: string | null };
  apps: {
    generated: number;
    submitted: number;
    /** Job description couldn't be read (status not_generated). */
    failed: number;
    byProfile: { label: string; generated: number; submitted: number }[];
  };
  interviews: {
    /** Interview requests this member made. */
    requested: number;
    /** Interviews this member (as caller) had scheduled in the period. */
    held: number;
    /** Results this member reported, by outcome. */
    reported: number;
    outcomes: { passed: number; failed: number; waiting: number; no_show: number };
  };
  /** Links copied on Job links. */
  linksCopied: number;
  chatMessages: number;
};

export const OUTCOME_LABEL: Record<keyof WorkReport["interviews"]["outcomes"], string> = {
  passed: "passed",
  failed: "failed",
  waiting: "waiting",
  no_show: "no show",
};

export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Nothing at all happened in the period. */
export function isEmptyReport(r: WorkReport) {
  return (
    !r.work.minutes &&
    !r.apps.generated &&
    !r.apps.submitted &&
    !r.apps.failed &&
    !r.interviews.requested &&
    !r.interviews.held &&
    !r.interviews.reported &&
    !r.linksCopied &&
    !r.chatMessages
  );
}

/** The report as plain text: the message body, so previews and chat search work. */
export function reportText(r: WorkReport) {
  if (isEmptyReport(r)) return `Daily report ${r.day}: no activity`;
  const lines = [`Daily report ${r.day}`];
  if (r.work.minutes) lines.push(`Work time ${fmtMinutes(r.work.minutes)}`);
  if (r.apps.generated || r.apps.submitted || r.apps.failed)
    lines.push(`Applications: ${r.apps.generated} generated, ${r.apps.submitted} submitted${r.apps.failed ? `, ${r.apps.failed} not generated` : ""}`);
  for (const p of r.apps.byProfile) lines.push(`· ${p.label}: ${p.generated} generated, ${p.submitted} submitted`);
  const iv = r.interviews;
  if (iv.requested) lines.push(`Interviews requested: ${iv.requested}`);
  if (iv.held) lines.push(`Interviews held: ${iv.held}`);
  if (iv.reported) {
    const out = (Object.keys(OUTCOME_LABEL) as (keyof typeof OUTCOME_LABEL)[]).filter((k) => iv.outcomes[k]).map((k) => `${iv.outcomes[k]} ${OUTCOME_LABEL[k]}`);
    lines.push(`Results reported: ${iv.reported}${out.length ? ` (${out.join(", ")})` : ""}`);
  }
  if (r.linksCopied) lines.push(`Job links copied: ${r.linksCopied}`);
  if (r.chatMessages) lines.push(`Chat messages: ${r.chatMessages}`);
  return lines.join("\n");
}
