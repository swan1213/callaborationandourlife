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
    id: "2026-10-26-5",
    date: "2026-10-26",
    title: "Typing bubble and forwarding in chat",
    changes: [
      {
        text: "See when someone is writing to you: a bubble with moving dots and their picture appears at the bottom of the chat, and \"typing…\" shows under their name and in the chat list.",
      },
      {
        text: "Forward any chat message (text, images or a report) to Team chat or to one or more people: hover it and pick ⋯ → Forward. The copy shows who wrote the original.",
        roles: ["admin"],
      },
    ],
    steps: [{ text: "Hover a message, open ⋯ and choose Forward, tick the chats, then click Forward.", roles: ["admin"] }],
  },
  {
    id: "2026-10-26-4",
    date: "2026-10-26",
    title: "Daily reports in Chat",
    changes: [
      {
        text: "New Daily reports chat for admins: every evening each member's day is posted automatically (work time, applications generated and submitted per profile, interviews, job links copied, chat messages).",
        roles: ["admin"],
      },
      { text: "Post now in Daily reports posts every member's report right away. Settings has a switch to turn them off.", roles: ["admin"] },
      { text: "Admins now get an automatic daily summary of your work in TailorBid (work time, applications, interviews), so there's no report to write.", roles: ["user", "bidder", "caller"] },
    ],
    steps: [{ text: "Open Chat → Daily reports; the first reports arrive this evening.", roles: ["admin"] }],
  },
  {
    id: "2026-10-26-3",
    date: "2026-10-26",
    title: "Chat: mentions, screenshots, replies and more",
    changes: [
      { text: "@mention someone in Team chat (or @admins): they get a notification in the bell and a desktop alert." },
      { text: "Paste screenshots with Ctrl+V, drag images in, or use the image button. Click an image to see it full size." },
      { text: "Reply to a message with a quote, edit your messages for 15 minutes, and delete them." },
      { text: "Admins can pin important messages (rules, prices) to the top of Team chat.", roles: ["admin"] },
      { text: "Pinned messages show at the top of Team chat; click to jump to one." },
      { text: "Direct messages send a desktop alert, and there's a sound for new messages (the bell next to New message turns it off)." },
      { text: "See when someone is typing, and search a conversation with the magnifier." },
      { text: "Job links in chat show a card with a Generate button that opens Generate with the link filled in.", roles: ["admin", "user", "bidder"] },
    ],
    steps: [{ text: "Hover a message to reply, react or open ⋯ for more." }],
  },
  {
    id: "2026-10-26-2",
    date: "2026-10-26",
    title: "See who read your messages",
    changes: [
      {
        text: "In direct chats and the team chat, each person's small avatar sits under the last message they've read; hover it to see who and when.",
      },
    ],
  },
  {
    id: "2026-10-26",
    date: "2026-10-26",
    title: "Better titles, more natural resumes and fixes",
    changes: [
      {
        text: "Job titles are read from the posting page and cleaned up (no more \"Job available - immediate employment - …\" or the company name in the title).",
        roles: APPS,
      },
      {
        text: "The line under the candidate's name is now a headline written for them (their level and field, aimed at the job), not a copy of the job title.",
        roles: APPS,
      },
      {
        text: "Resumes no longer match every keyword of a posting, which looked written by AI: a few nice-to-have keywords are left out, required ones never.",
        roles: APPS,
      },
      { text: "Interview practice (Chat tab) answers are shorter and sound more like someone talking.", roles: APPS },
      {
        text: "Fixed: the 30-day same-company rule could block a job by itself (\"already applied to …\" with nothing in the history). Failed attempts no longer count.",
        roles: APPS,
      },
      {
        text: "Generate remembers the profile you picked last, lists it first, and the profile list now scrolls beside the form at the same height.",
        roles: APPS,
      },
      {
        text: "Import CSV: the waiting-for-paste limit updates without reloading, and reaching it no longer says \"Monthly quota reached\".",
        roles: APPS,
      },
      { text: "The Unpaid Counter desktop app can connect (API Access key).", roles: ["admin"] },
    ],
    steps: [{ text: "Reload any open TailorBid tabs so new resumes use these changes." }],
  },
  {
    id: "2026-10-25-9",
    date: "2026-10-25",
    title: "Clear copied on Job links",
    changes: [
      {
        text: "Job links has a Clear copied button: tick links to mark just those as not copied for the profile, or click it with nothing ticked to clear the profile's whole copy history. It asks first; other profiles are not affected.",
        roles: ["admin", "user"],
      },
    ],
  },
  {
    id: "2026-10-25-8",
    date: "2026-10-25",
    title: "Save to folder, profile search and a cleaner interview chat",
    changes: [
      {
        text: "On an application, Save to folder (Chrome / Edge) puts the files straight into a folder on your computer as Date / Profile / Job title_Company, with nothing to unzip. Download ZIP on that page uses the same folders.",
        roles: APPS,
      },
      { text: "Generate has a Search profiles box: type a name, title or location to find the profile.", roles: APPS },
      { text: "The interview practice Chat tab now starts empty; Tell me about yourself is the first suggested question.", roles: APPS },
    ],
    steps: [
      {
        text: "The first time you click Save to folder, pick or create a folder (for example Applications inside Downloads). It is remembered; the folder button next to it changes it.",
        roles: APPS,
      },
    ],
  },
  {
    id: "2026-10-25-7",
    date: "2026-10-25",
    title: "Emoji in chat",
    changes: [
      { text: "Chat has an emoji button next to Send: pick from categories, search by name, and your recent ones come first." },
      { text: "React to any message: hover it (or tap the smiley on a phone) and pick an emoji. Click a reaction to add yours or take it back; hover it to see who reacted." },
      { text: "A message of just one to three emoji shows large." },
    ],
  },
  {
    id: "2026-10-25-6",
    date: "2026-10-25",
    title: "Resumes use gpt-4.1-mini",
    changes: [
      { text: "Resumes and cover letters are now generated with gpt-4.1-mini.", roles: ["admin"] },
      {
        text: "New API keys start with gpt-4.1-mini and its prices ($0.40 in / $1.60 out per 1M tokens), so spend estimates match.",
        roles: ["admin"],
      },
    ],
  },
  {
    id: "2026-10-25-5",
    date: "2026-10-25",
    title: "Job links fits the screen",
    changes: [
      {
        text: "The Job links table no longer scrolls sideways: company and role share a column, Generated by shows the bidders (×2 when a link was generated twice), and long links end with … (hover to see the whole link).",
        roles: ["admin", "user"],
      },
      { text: "On laptop screens the profile cards sit above the table; on wide screens they stay on the left.", roles: ["admin", "user"] },
    ],
  },
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
