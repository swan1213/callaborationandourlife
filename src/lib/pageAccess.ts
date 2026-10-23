/**
 * Page access per role (Admin → Page Access). Admins can turn pages off for a role, and back on, but never beyond
 * what the role can use by design (`roles` below): the APIs behind each page still enforce that.
 * Admins always have every page. Client-safe: no database code (the stored settings live in pageAccessStore.ts).
 */

export type AccessRole = "admin" | "user" | "bidder" | "caller";
/** Roles an admin can configure (the admin row is always all on). */
export const EDITABLE_ROLES = ["user", "bidder", "caller"] as const;
export type EditableRole = (typeof EDITABLE_ROLES)[number];
/** Page keys turned off, per role. Missing or empty = every page the role can have. */
export type DisabledPages = Partial<Record<EditableRole, string[]>>;

export type PageDef = {
  key: string;
  label: string;
  group: "Workspace" | "Admin" | "Caller";
  /** URL the page lives at; sub-paths belong to it too unless `exact`. */
  href: string;
  exact?: boolean;
  /** Roles that can have this page at all (today's design). */
  roles: AccessRole[];
  /** Always on (switching it off would leave the account without a working page). */
  locked?: boolean;
  note?: string;
};

const ALL: AccessRole[] = ["admin", "user", "bidder", "caller"];
const STAFF: AccessRole[] = ["admin", "user"];

export const PAGES: PageDef[] = [
  { key: "overview", label: "Overview", group: "Workspace", href: "/overview", roles: STAFF },
  { key: "generate", label: "Generate", group: "Workspace", href: "/dashboard", exact: true, roles: ["admin", "user", "bidder"] },
  { key: "import", label: "Generate Resume", group: "Workspace", href: "/dashboard/import", roles: ["admin", "user", "bidder"] },
  { key: "applications", label: "View Generated Resumes", group: "Workspace", href: "/applications", roles: ["admin", "user", "bidder"] },
  {
    key: "interviews",
    label: "Interview Requests",
    group: "Workspace",
    href: "/interviews",
    roles: ["admin", "user", "bidder"],
    note: "Bidders also need it switched on in their account (Users & Bidders).",
  },
  { key: "profiles", label: "My Profiles", group: "Workspace", href: "/profiles", roles: ALL },
  { key: "notifications", label: "Notifications", group: "Workspace", href: "/notifications", roles: ALL },
  { key: "feedback", label: "Feedback", group: "Workspace", href: "/feedback", roles: ["admin", "user", "caller"] },
  { key: "help", label: "Help", group: "Workspace", href: "/help", roles: ALL },
  { key: "me", label: "My Page", group: "Workspace", href: "/me", roles: ALL, locked: true, note: "Always on: password and account settings." },

  { key: "caller-requests", label: "Interview Requests (caller)", group: "Caller", href: "/caller/requests", roles: ["caller"] },
  { key: "caller-schedule", label: "My Schedule", group: "Caller", href: "/caller/schedule", roles: ["caller"] },
  { key: "interview-history", label: "Interview History", group: "Caller", href: "/interview-history", roles: ["admin", "user", "caller"] },

  { key: "admin-overview", label: "Admin Overview", group: "Admin", href: "/admin", exact: true, roles: STAFF },
  { key: "admin-analytics", label: "Analytics", group: "Admin", href: "/admin/analytics", roles: STAFF },
  { key: "admin-users", label: "Users & Bidders", group: "Admin", href: "/admin/users", roles: STAFF },
  { key: "admin-profiles", label: "Profiles", group: "Admin", href: "/admin/profiles", roles: STAFF },
  { key: "admin-assignments", label: "Assignments", group: "Admin", href: "/admin/assignments", roles: STAFF },
  { key: "admin-applications", label: "Application History", group: "Admin", href: "/admin/applications", roles: STAFF },
  { key: "admin-job-links", label: "Job Links", group: "Admin", href: "/admin/job-links", roles: STAFF },
  { key: "admin-interviews", label: "Interviews (Schedule)", group: "Admin", href: "/admin/interviews", roles: STAFF },
  { key: "admin-work-time", label: "Work Time", group: "Admin", href: "/admin/work-time", roles: ["admin"] },
  { key: "admin-notifications", label: "Notifications (send)", group: "Admin", href: "/admin/notifications", roles: ["admin"] },
  { key: "admin-feedback", label: "Feedback (inbox)", group: "Admin", href: "/admin/feedback", roles: ["admin"] },
  { key: "admin-logs", label: "Logs", group: "Admin", href: "/admin/logs", roles: ["admin"] },
  { key: "admin-keys", label: "API Keys", group: "Admin", href: "/admin/keys", roles: ["admin"] },
  { key: "admin-api-access", label: "API Access", group: "Admin", href: "/admin/api-access", roles: ["admin"] },
  { key: "admin-prompt-test", label: "Test Generate Resume", group: "Admin", href: "/admin/prompt-test", roles: ["admin"] },
  { key: "admin-settings", label: "Settings", group: "Admin", href: "/admin/settings", roles: ["admin"] },
  { key: "admin-page-access", label: "Page Access", group: "Admin", href: "/admin/page-access", roles: ["admin"] },
];

const BY_KEY = new Map(PAGES.map((p) => [p.key, p]));

const under = (path: string, href: string, exact?: boolean) => path === href || (!exact && path.startsWith(href + "/"));

/** The page a URL belongs to (most specific match), or null for URLs outside the list. */
export function pageFor(pathname: string): PageDef | null {
  let best: PageDef | null = null;
  for (const p of PAGES) if (under(pathname, p.href, p.exact) && (!best || p.href.length > best.href.length)) best = p;
  return best;
}

/** Whether the role can open the page: in its design, and not turned off by an admin. */
export function canOpen(role: string, key: string, disabled: DisabledPages) {
  const page = BY_KEY.get(key);
  if (!page || !page.roles.includes(role as AccessRole)) return false;
  if (role === "admin" || page.locked) return true;
  return !(disabled[role as EditableRole] ?? []).includes(key);
}

/**
 * APIs that belong to pages: blocked for a role when every page using them (that the role can have by design)
 * is turned off. Most specific prefix wins; `[]` keeps an API open (shared widgets); unlisted APIs are always open.
 * `write` rules only apply to non-GET requests (lists that other pages read stay open).
 */
const API_RULES: { prefix: string; pages: string[]; write?: boolean }[] = [
  { prefix: "/api/me/stats", pages: ["overview"] },
  { prefix: "/api/applications", pages: ["applications", "generate", "import", "interviews", "admin-applications"] },
  { prefix: "/api/applications/generate", pages: ["generate", "import", "applications"] },
  { prefix: "/api/interviews", pages: ["interviews", "admin-interviews", "caller-requests", "caller-schedule"] },
  { prefix: "/api/interviews/upcoming", pages: [] },
  { prefix: "/api/interview-history", pages: ["interview-history"] },
  { prefix: "/api/feedback", pages: ["feedback", "admin-feedback"] },
  { prefix: "/api/admin/stats", pages: ["admin-overview"] },
  { prefix: "/api/admin/analytics", pages: ["admin-analytics"] },
  { prefix: "/api/admin/assignments", pages: ["admin-assignments"] },
  { prefix: "/api/admin/applications", pages: ["admin-applications", "interviews"] },
  { prefix: "/api/admin/job-links", pages: ["admin-job-links"] },
  { prefix: "/api/admin/profiles", pages: ["admin-profiles"], write: true },
  { prefix: "/api/admin/users", pages: ["admin-users", "admin-overview"], write: true },
];

function apiRule(pathname: string, method: string) {
  const write = method !== "GET" && method !== "HEAD";
  let rule: (typeof API_RULES)[number] | null = null;
  for (const r of API_RULES) if ((!r.write || write) && under(pathname, r.prefix) && (!rule || r.prefix.length > rule.prefix.length)) rule = r;
  return rule?.pages.length ? rule : null;
}

/** Whether page access can affect this API at all (cheap check before loading the user). */
export const governsApi = (pathname: string, method: string) => !!apiRule(pathname, method);

/** Whether the role may call this API under the current page access. */
export function canCallApi(role: string, pathname: string, method: string, disabled: DisabledPages) {
  if (role === "admin") return true;
  const rule = apiRule(pathname, method);
  if (!rule) return true;
  // Pages this role never has don't count: the API's own role checks already cover them.
  const own = rule.pages.filter((k) => BY_KEY.get(k)?.roles.includes(role as AccessRole));
  return !own.length || own.some((k) => canOpen(role, k, disabled));
}

/** Where a role lands (sign-in, "/", blocked pages): its usual start page, or the first page it can still open. */
export function homeFor(role: string, disabled: DisabledPages) {
  const preferred = role === "bidder" ? ["import", "applications"] : role === "caller" ? ["caller-requests", "caller-schedule"] : ["admin-overview", "overview"];
  const key = [...preferred, ...PAGES.map((p) => p.key)].find((k) => canOpen(role, k, disabled));
  return BY_KEY.get(key ?? "me")!.href;
}

/** Validates a saved table: only known, editable pages each role can have. */
export function cleanDisabled(input: unknown): DisabledPages {
  const out: DisabledPages = {};
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const role of EDITABLE_ROLES) {
    const list = Array.isArray(src[role]) ? (src[role] as unknown[]).map(String) : [];
    out[role] = [...new Set(list)].filter((k) => {
      const p = BY_KEY.get(k);
      return !!p && !p.locked && p.roles.includes(role);
    });
  }
  return out;
}
