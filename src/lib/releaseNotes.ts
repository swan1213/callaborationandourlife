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
    id: "2026-10-25-4",
    date: "2026-10-25",
    title: "New dropdowns everywhere",
    changes: [
      { text: "Every dropdown now opens the same list: long ones (profiles, accounts, callers…) have a find box, so you can type a name instead of scrolling.", roles: ALL },
      { text: "Tables open with 25 rows again. Each table remembers 25, 50 or 100 on its own; All only lasts until you leave the page.", roles: ALL },
    ],
    steps: [{ text: "Click a dropdown and start typing to find an option; use the arrow keys and Enter to pick.", roles: ALL }],
  },
  {
    id: "2026-10-25-3",
    date: "2026-10-25",
    title: "Rows per page on every table",
    changes: [
      { text: "Overview's breakdown and the Interviews (Schedule) month agenda now have Rows per page (25, 50, 100 or All) and page buttons, like the other tables.", roles: ["admin", "user"] },
      { text: "So do the API Access keys and the Read by list of a sent notification.", roles: ["admin"] },
    ],
    steps: [{ text: "Pick Rows per page under a table; each table remembers its own choice in this browser.", roles: ["admin", "user"] }],
  },
  {
    id: "2026-10-25-2",
    date: "2026-10-25",
    title: "Easier profile picking on Job links",
    changes: [
      {
        text: "Job links now shows profiles as cards on the left, like Generate, with a Search profiles box to find one by name or title. The list stays in view while you scroll the job links.",
        roles: ["admin", "user"],
      },
    ],
    steps: [{ text: "Open Manage → Job Links, type a name in Search profiles and click the profile.", roles: ["admin", "user"] }],
  },
  {
    id: "2026-10-25",
    date: "2026-10-25",
    title: "Team chat and a new Job links page",
    changes: [
      { text: "New Chat: talk with the whole team in Team chat, or privately with one person. The chat icon in the top bar shows how many messages are unread.", roles: ALL },
      {
        text: "Job links now works per profile: choose a profile and the page lists every job link found for other profiles that this profile hasn't applied to yet, each listed once.",
        roles: ["admin", "user"],
      },
      {
        text: "Copy selected, Copy all links and each row's copy icon mark links as Copied for that profile, so you can see what you've already taken. Downloading TXT / CSV was removed.",
        roles: ["admin", "user"],
      },
      { text: "The same job pasted with different tracking (jr_id, utm_…, embed or search settings, www., capital letters) now counts as one link everywhere, including Generate Resume.", roles: APPS },
    ],
    steps: [
      { text: "Reload any TailorBid tab that was open before this update.", roles: ALL },
      { text: "Open Chat from the top bar or the menu, or click the chat icon next to someone in Who is online.", roles: ALL },
      { text: "Open Manage → Job Links, choose a profile, then tick links and click Copy selected to paste them into Generate Resume.", roles: ["admin", "user"] },
    ],
  },
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
