// "What's new" after a redeploy (components/WhatsNew.tsx). Add a note at the TOP of RELEASE_NOTES with every deploy
// people should hear about: it ships with the code, so the server always knows the newest one. Open tabs running an
// older version are asked to reload (components/UpdatePrompt.tsx), and everyone sees the notes they haven't read yet
// once, after their next page load (seen is stored per account: User.seenRelease).
// Client-safe: no server imports.

export type ReleaseRole = "admin" | "user" | "bidder" | "caller";
/** One line; `roles` limits it to those roles (left out = everyone). */
export type ReleaseLine = { text: string; roles?: ReleaseRole[] };
export type ReleaseNote = {
  /** Unique and never reused, e.g. "2026-10-23" (add "-2" for a second deploy that day). */
  id: string;
  /** YYYY-MM-DD shown with the note. */
  date: string;
  title: string;
  /** What changed. */
  changes: ReleaseLine[];
  /** What people should do now (reload, try a feature, change a setting…). */
  steps?: ReleaseLine[];
};

const ALL: ReleaseRole[] = ["admin", "user", "bidder", "caller"];
const APPS: ReleaseRole[] = ["admin", "user", "bidder"];

/** Newest first. */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: "2026-10-23",
    date: "2026-10-23",
    title: "Higher ATS scores and a new AI review",
    changes: [
      {
        text: "New resumes and cover letters are now optimized for ATS keyword filters: the posting's missing skills are worked into the skills section and bullets, so Job match scores come out higher.",
        roles: APPS,
      },
      {
        text: "New AI review on every application: in the Job match panel, the AI review tab scores the resume the way an ATS and a recruiter would (required skills, experience, title, results, readability) and lists what's missing and how to fix it.",
        roles: APPS,
      },
      { text: "Settings has a new ATS optimization section: resumes scoring below the target score (default 85) get one AI revision. 0 turns it off.", roles: ["admin"] },
      { text: "Test Generate Resume shows the ATS score before and after the revision, and has the AI review tab too.", roles: ["admin"] },
      { text: "Reasoning models (gpt-5.x, gpt-6 luna / sol) now work for generation, the interview chat and the AI review.", roles: ["admin"] },
    ],
    steps: [
      { text: "Reload any TailorBid tab that was open before this update.", roles: ALL },
      { text: "Generate as usual. Applications created before today keep their old resumes; only new ones are optimized.", roles: APPS },
      { text: "To check a resume, open the application and click Job match → AI review → Run AI review. It takes a few seconds and uses the profile's OpenAI key.", roles: APPS },
      { text: "Recommended: set the Default key's model to gpt-4.1-mini (prices 0.40 / 1.60) on API Keys. It writes nearly as well as gpt-4.1 at about a fifth of the cost.", roles: ["admin"] },
    ],
  },
];

export const LATEST_RELEASE = RELEASE_NOTES[0]?.id ?? "";

/** A note with only the lines this role sees; null when no change applies to it (steps alone aren't news). */
export function noteFor(note: ReleaseNote, role: string): ReleaseNote | null {
  const mine = (l: ReleaseLine) => !l.roles || l.roles.includes(role as ReleaseRole);
  const changes = note.changes.filter(mine);
  return changes.length ? { ...note, changes, steps: (note.steps ?? []).filter(mine) } : null;
}

/**
 * Notes this role hasn't seen: everything newer than `seen`. An account that has never seen one (or whose id is no
 * longer listed) gets only the newest note, not the whole history.
 */
export function unseenNotes(role: string, seen: string | null | undefined): ReleaseNote[] {
  const at = seen ? RELEASE_NOTES.findIndex((n) => n.id === seen) : -1;
  const newer = at < 0 ? RELEASE_NOTES.slice(0, 1) : RELEASE_NOTES.slice(0, at);
  return newer.map((n) => noteFor(n, role)).filter((n): n is ReleaseNote => !!n);
}
