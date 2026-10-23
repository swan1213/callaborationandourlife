// @ts-nocheck -- dev-only capture script.
// Captures the Help screenshots (public/help/<id>-<n>.webp) from a dev server running on the demo database.
// Usage: see scripts/help/README.md. Optional args: page ids or file names to capture only those, e.g. `admin-users my-page-2`.
import { chromium, type Locator, type Page } from "playwright";
import { mkdirSync } from "fs";
import mongoose from "mongoose";

const BASE = process.env.HELP_BASE_URL || "http://localhost:3100";
const PASSWORD = "Demo-pass-2026!";
const OUT = process.env.HELP_OUT || "public/help";
const RAW = process.env.HELP_RAW || `${OUT}/.raw`;
const ONLY = process.argv.slice(2);

const EMAIL = { admin: "alex@demo.tailorbid.test", user: "jordan@demo.tailorbid.test", bidder: "casey@demo.tailorbid.test", caller: "morgan@demo.tailorbid.test" } as const;
type Role = keyof typeof EMAIL;

/** One screenshot: open `path` as `role`, run `prepare`, frame and outline `target`. */
type Shot = {
  file: string;
  role: Role;
  path: string;
  prepare?: (p: Page) => Promise<unknown>;
  target?: (p: Page) => Locator | Locator[] | null;
  /** Scroll so the target sits this far from the top (default: keep the page at the top when it already fits). */
  scroll?: "top" | "none";
};

/* ------------------------------------------------------------ locator helpers */
const ancestor = (loc: Locator, cls: string) => loc.locator(`xpath=ancestor-or-self::*[contains(concat(" ", normalize-space(@class), " "), " ${cls} ")][1]`);
const card = (loc: Locator) => ancestor(loc, "card");
const main = (p: Page) => p.locator("main");
const text = (p: Page, t: string | RegExp) => main(p).getByText(t, { exact: typeof t === "string" }).filter({ visible: true }).first();
const btn = (p: Page | Locator, name: string | RegExp) => p.getByRole("button", { name, exact: typeof name === "string" }).filter({ visible: true }).first();
const tab = (p: Page, name: string) => p.getByRole("tab", { name, exact: true }).filter({ visible: true }).first();
const link = (p: Page, name: string | RegExp) => p.getByRole("link", { name }).first();
const field = (p: Page | Locator, label: string | RegExp) => p.locator("label", { hasText: label }).first().locator("xpath=..");
const dialog = (p: Page) => p.getByRole("dialog").last();
const stat = (p: Page, label: string) => card(main(p).locator(".card .text-\\[13px\\]", { hasText: label }).first());
const row = (p: Page, t: string) => p.locator("tr", { hasText: t }).filter({ visible: true }).first();
const menu = (p: Page) => p.getByRole("menu").last();
const tzPicker = (p: Page) => main(p).locator("button, [role=combobox], select").filter({ hasText: /GMT[+-]\d/ }).first();
const wait = (p: Page, ms = 600) => p.waitForTimeout(ms);
const click = async (l: Locator, ms = 700) => {
  await l.click();
  await l.page().waitForTimeout(ms);
};
/** Opens the ⋯ menu of the table row containing `t`. */
// The menu closes on any scroll, so scroll the trigger into view first and let that settle before clicking.
const rowMenu = async (p: Page, t: string) => {
  const trigger = row(p, t).locator("[aria-haspopup=menu]").first();
  await trigger.scrollIntoViewIfNeeded();
  await wait(p, 500);
  await click(trigger);
};

/** Stubbed /api/applications/generate answers for the Generate Resume batch (no OpenAI calls in the demo). */
const IMPORT_URLS = [
  "https://boards.greenhouse.io/acme/jobs/4815162342",
  "https://jobs.lever.co/globex/7d1c2b9e",
  "https://careers.initech.com/jobs/senior-backend-engineer",
  "https://boards.greenhouse.io/shopify/jobs/4100000",
  "https://jobs.ashbyhq.com/umbrella/platform-engineer",
  "https://careers.hooli.com/jobs/staff-software-engineer",
];
async function runImport(p: Page) {
  let n = 0;
  await p.route("**/api/applications/generate", async (route) => {
    const i = n++;
    const json = (status: number, body: object) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (i === 2) return json(200, { id: ids.notGenerated, status: "not_generated", company: "Initech", jobTitle: "" });
    if (i === 3) return json(409, { error: "Already generated with this profile", duplicateId: ids.generated });
    if (i === 4) return json(409, { error: "Daniel Park applied to Umbrella on 2026-10-02. Same company allowed again from 2026-11-01." });
    const jobs = [["Acme", "Senior Software Engineer, Payments"], ["Globex", "Backend Engineer, Platform"], [], [], [], ["Hooli", "Staff Software Engineer"]];
    return json(200, { id: ids.generated, status: "generated", company: jobs[i][0], jobTitle: jobs[i][1] });
  });
  await p.locator("textarea").first().fill(IMPORT_URLS.join("\n"));
  await click(btn(p, /^Generate \d+ resumes?|^Generate resumes/), 2500);
  // Close the "N applications generated" toast so it doesn't cover the results.
  await p.getByRole("button", { name: "Dismiss" }).last().click().catch(() => {});
  await wait(p, 500);
}

let ids: Record<string, string> = {};

/* ------------------------------------------------------------ the shots */
const SHOTS: Shot[] = [
  /* overview (user) */
  { file: "overview-1", role: "user", path: "/overview", target: (p) => [card(text(p, "This week")), card(text(p, "This month"))] },
  { file: "overview-2", role: "user", path: "/overview", target: (p) => btn(p, "Monthly").locator("xpath=..") },
  { file: "overview-3", role: "user", path: "/overview", prepare: async (p) => { await card(text(p, "Activity")).scrollIntoViewIfNeeded(); await p.locator(".viz rect, svg rect").filter({ visible: true }).last().hover().catch(() => {}); }, target: (p) => card(text(p, "Activity")) },
  { file: "overview-4", role: "user", path: "/overview", target: (p) => card(text(p, "Weekly breakdown")) },

  /* generate (user) */
  { file: "generate-1", role: "user", path: "/dashboard", target: (p) => text(p, "Choose a profile").locator("xpath=../..") },
  { file: "generate-2", role: "user", path: "/dashboard", prepare: (p) => p.getByPlaceholder(/https?:/).first().fill("https://boards.greenhouse.io/acme/jobs/4815162342"), target: (p) => [p.getByPlaceholder(/https?:/).first(), btn(p, /Generate resume, cover letter/)] },
  { file: "generate-3", role: "user", path: "/dashboard", prepare: (p) => click(text(p, /Paste the job description manually/)), target: (p) => text(p, /Paste the job description manually/).locator("xpath=..") },
  { file: "generate-4", role: "user", path: () => `/applications/${ids.generated}`, target: (p) => btn(p, /Download ZIP/) },

  /* import (bidder) */
  { file: "import-1", role: "bidder", path: "/dashboard/import", target: (p) => main(p).locator("select").first().locator("xpath=../..") },
  { file: "import-2", role: "bidder", path: "/dashboard/import", prepare: (p) => p.locator("textarea").first().fill(["https://boards.greenhouse.io/acme/jobs/4815162342", "https://jobs.lever.co/globex/7d1c2b9e", "https://careers.initech.com/jobs/senior-backend-engineer"].join("\n")), target: (p) => p.locator("textarea").first().locator("xpath=..") },
  { file: "import-3", role: "bidder", path: "/dashboard/import", prepare: (p) => p.locator("textarea").first().fill(["https://boards.greenhouse.io/acme/jobs/4815162342", "https://jobs.lever.co/globex/7d1c2b9e", "https://careers.initech.com/jobs/senior-backend-engineer"].join("\n")), target: (p) => btn(p, /Generate \d* ?resumes?/) },
  { file: "import-4", role: "bidder", path: "/dashboard/import", prepare: (p) => runImport(p), target: (p) => card(text(p, "Results")) },
  { file: "import-5", role: "bidder", path: "/dashboard/import", prepare: (p) => runImport(p), target: (p) => btn(p, /^Retry/) },
  { file: "import-6", role: "bidder", path: "/applications", target: (p) => p.locator("table").last() },

  /* my-applications (bidder) */
  { file: "my-applications-1", role: "bidder", path: "/applications", target: (p) => [field(p, "From"), field(p, "Search")] },
  { file: "my-applications-2", role: "bidder", path: "/applications", target: (p) => btn(p, /^Upload/) },
  { file: "my-applications-3", role: "bidder", path: "/applications", target: (p) => btn(p, /^Submit$/) },
  { file: "my-applications-4", role: "bidder", path: "/applications", target: (p) => text(p, /Unknown company/).locator("xpath=..") },
  { file: "my-applications-5", role: "bidder", path: "/applications", target: (p) => btn(p, "Download ZIP: resume, cover letter & JD").locator("xpath=..") },
  { file: "my-applications-6", role: "bidder", path: "/applications", target: (p) => btn(p, /^Columns/) },
  { file: "my-applications-7", role: "bidder", path: "/applications", target: (p) => p.locator("th", { hasText: /^Fee$/i }).first() },

  /* application-detail (bidder) */
  { file: "application-detail-1", role: "bidder", path: () => `/applications/${ids.generated}`, target: (p) => p.getByRole("tablist").first() },
  { file: "application-detail-2", role: "bidder", path: () => `/applications/${ids.generated}`, target: (p) => link(p, /Open job posting/) },
  { file: "application-detail-3", role: "bidder", path: () => `/applications/${ids.generated}`, target: (p) => card(text(p, "Submission")) },
  { file: "application-detail-4", role: "bidder", path: () => `/applications/${ids.generated}`, target: (p) => btn(p, /Submit application/) },
  { file: "application-detail-5", role: "bidder", path: () => `/applications/${ids.notGenerated}`, target: (p) => card(main(p).locator("textarea").first()) },

  /* interview-requests (bidder) */
  { file: "interview-requests-1", role: "bidder", path: "/interviews", target: (p) => btn(p, /New interview request/) },
  { file: "interview-requests-2", role: "bidder", path: "/interviews", prepare: (p) => openRequestForm(p), target: (p) => [field(dialog(p), /^Profile/), field(dialog(p), /^Submitted application/)] },
  { file: "interview-requests-3", role: "bidder", path: "/interviews", prepare: (p) => openRequestForm(p), target: (p) => dialog(p).getByText(/^Interview step/).first().locator("xpath=../..") },
  { file: "interview-requests-4", role: "bidder", path: "/interviews", prepare: (p) => openRequestForm(p), target: (p) => field(dialog(p), /^Caller/) },
  { file: "interview-requests-5", role: "bidder", path: "/interviews", prepare: (p) => openRequestForm(p), target: (p) => field(dialog(p), /^When/) },
  { file: "interview-requests-6", role: "bidder", path: "/interviews", prepare: (p) => openRequestForm(p), target: (p) => field(dialog(p), /Interview email screenshot/) },
  { file: "interview-requests-7", role: "bidder", path: "/interviews", target: (p) => btn(p, /^Active/).locator("xpath=..") },

  /* caller-requests (caller) */
  { file: "caller-requests-1", role: "caller", path: "/caller/requests", target: (p) => [btn(p, /^Assigned to me/), card(btn(p, /^Accept & schedule/))] },
  { file: "caller-requests-2", role: "caller", path: "/caller/requests", target: (p) => btn(p, /Resume PDF/).locator("xpath=..") },
  { file: "caller-requests-3", role: "caller", path: "/caller/requests", prepare: (p) => click(btn(p, /^Accept & schedule/), 1200), target: (p) => dialog(p) },
  { file: "caller-requests-4", role: "caller", path: "/caller/requests", target: (p) => btn(p, /Can.t do it/) },
  { file: "caller-requests-5", role: "caller", path: "/caller/requests", prepare: (p) => click(btn(p, /^Shared requests/)), target: (p) => [btn(p, /^Shared requests/), card(btn(p, /^Accept/))] },
  { file: "caller-requests-6", role: "caller", path: "/caller/requests", prepare: (p) => click(btn(p, /^Scheduled/)), target: (p) => [btn(p, /^Scheduled/), btn(p, /^Reschedule/)] },
  { file: "caller-requests-7", role: "caller", path: "/caller/requests", prepare: async (p) => { await click(btn(p, /^Report due/)); await click(btn(p, /^Report result/), 1200); }, target: (p) => dialog(p) },
  { file: "caller-requests-8", role: "caller", path: "/caller/requests", prepare: (p) => openDoneInterview(p), target: (p) => btn(dialog(p), /feedback/i) },

  /* caller-schedule (caller) */
  { file: "caller-schedule-1", role: "caller", path: "/caller/schedule", target: (p) => tab(p, "Month").locator("xpath=..") },
  { file: "caller-schedule-2", role: "caller", path: "/caller/schedule", target: (p) => btn(p, /All my profiles/).locator("xpath=..") },
  { file: "caller-schedule-3", role: "caller", path: "/caller/schedule", target: (p) => [tzPicker(p), text(p, "Show unscheduled requests")] },
  { file: "caller-schedule-4", role: "caller", path: "/caller/schedule", prepare: (p) => click(tab(p, "List")), target: (p) => main(p).locator("table").first() },
  { file: "caller-schedule-5", role: "caller", path: "/caller/schedule", prepare: (p) => click(tab(p, "Board")), target: (p) => main(p).locator("[draggable=true]").first() },
  { file: "caller-schedule-6", role: "caller", path: "/caller/schedule", prepare: async (p) => { await click(tab(p, "List")); await click(main(p).locator("tbody tr", { hasText: "Shopify" }).first(), 1500); }, target: (p) => dialog(p) },

  /* interview-history (admin) */
  { file: "interview-history-1", role: "admin", path: "/interview-history", target: (p) => p.locator("label", { hasText: "Search" }).first().locator("xpath=../..") },
  { file: "interview-history-2", role: "admin", path: () => `/interview-history/${ids.session}`, target: (p) => stat(p, "Length").locator("xpath=..") },
  { file: "interview-history-3", role: "admin", path: () => `/interview-history/${ids.session}`, target: (p) => card(btn(p, /Write again|Review this interview/)) },
  { file: "interview-history-4", role: "admin", path: () => `/interview-history/${ids.session}`, target: (p) => [btn(p, "Export"), btn(p, "Delete")] },

  /* my-profiles (bidder) */
  { file: "my-profiles-1", role: "bidder", path: "/profiles", target: (p) => btn(p, "Sophia Nguyen").locator("xpath=..") },
  { file: "my-profiles-2", role: "bidder", path: "/profiles", prepare: (p) => text(p, "daniel.park@example.com").hover(), target: (p) => card(text(p, "Contact & links")) },

  /* notifications (bidder) */
  { file: "notifications-1", role: "bidder", path: "/applications", target: (p) => p.getByRole("button", { name: /notification/i }).first() },
  { file: "notifications-2", role: "bidder", path: "/applications", prepare: (p) => click(p.getByRole("button", { name: /notification/i }).first()), target: (p) => p.locator(".popover").last() },
  { file: "notifications-3", role: "bidder", path: "/notifications", target: (p) => [btn(p, /^Unread/).locator("xpath=.."), main(p).locator("select").first(), btn(p, /Mark all read/)] },

  /* feedback (caller) */
  { file: "feedback-1", role: "caller", path: "/feedback", target: (p) => btn(p, /Send feedback/) },
  { file: "feedback-2", role: "caller", path: "/feedback", prepare: (p) => click(btn(p, /Send feedback/), 1000), target: (p) => dialog(p) },
  { file: "feedback-3", role: "caller", path: "/feedback", prepare: (p) => click(btn(p, /Send feedback/), 1000), target: (p) => dialog(p).getByText(/screenshot/i).first().locator("xpath=..") },
  { file: "feedback-4", role: "caller", path: "/feedback", target: (p) => card(text(p, /Calendar shows the wrong week/)) },

  /* my-page (caller: it has every section) */
  { file: "my-page-1", role: "caller", path: "/me", target: (p) => main(p).getByRole("button").first() },
  { file: "my-page-2", role: "caller", path: "/me", target: (p) => card(text(p, "Account")) },
  { file: "my-page-3", role: "caller", path: "/me", target: (p) => card(text(p, "Time zone")) },
  { file: "my-page-4", role: "caller", path: "/me", target: (p) => card(text(p, "Interview reminders")) },
  { file: "my-page-5", role: "caller", path: "/me", target: (p) => card(text(p, /Change password/i)) },

  /* help (bidder) */
  { file: "help-1", role: "admin", path: "/help", target: (p) => text(p, "Bidder").locator("xpath=..") },
  { file: "help-2", role: "admin", path: "/help", prepare: (p) => p.getByRole("searchbox").or(p.getByPlaceholder(/search/i)).first().fill("screenshot"), target: (p) => p.getByRole("searchbox").or(p.getByPlaceholder(/search/i)).first() },
  { file: "help-3", role: "admin", path: "/admin/applications", target: (p) => p.getByRole("button", { name: /help/i }).first() },

  /* admin-overview (admin) */
  { file: "admin-overview-1", role: "admin", path: "/admin", target: (p) => card(text(p, /^Pending sign-ups/)) },
  { file: "admin-overview-2", role: "admin", path: "/admin", target: (p) => stat(p, "Generated this month").locator("xpath=..") },
  { file: "admin-overview-3", role: "admin", path: "/admin", target: (p) => card(text(p, "Profile quota usage")) },

  /* admin-analytics */
  { file: "admin-analytics-1", role: "admin", path: "/admin/analytics", target: (p) => btn(p, "Last 30 days").locator("xpath=..") },
  { file: "admin-analytics-2", role: "admin", path: "/admin/analytics", target: (p) => stat(p, "Generated").locator("xpath=..") },
  { file: "admin-analytics-3", role: "admin", path: "/admin/analytics", target: (p) => card(text(p, "From application to interview")).locator("xpath=..") },
  { file: "admin-analytics-4", role: "admin", path: "/admin/analytics", target: (p) => card(text(p, "By profile")) },

  /* admin-work-time */
  { file: "admin-work-time-1", role: "admin", path: "/admin/work-time", target: (p) => stat(p, "Online now").locator("xpath=..") },
  { file: "admin-work-time-2", role: "admin", path: "/admin/work-time", target: (p) => btn(p, "This week").locator("xpath=../..") },
  { file: "admin-work-time-3", role: "admin", path: "/admin/work-time", target: (p) => p.locator("table").first() },

  /* admin-users */
  { file: "admin-users-1", role: "admin", path: "/admin/users", target: (p) => [btn(p, /^Bidders/).locator("xpath=.."), main(p).locator("select").first()] },
  { file: "admin-users-2", role: "admin", path: "/admin/users", prepare: (p) => click(btn(p, "Add account"), 1000), target: (p) => dialog(p) },
  { file: "admin-users-3", role: "admin", path: "/admin/users", prepare: async (p) => { await rowMenu(p, "Casey Brooks"); await click(p.getByRole("menuitem", { name: /^Edit/ }), 1000); }, target: (p) => dialog(p) },
  { file: "admin-users-4", role: "admin", path: "/admin/users", prepare: (p) => rowMenu(p, "Casey Brooks"), target: (p) => menu(p) },
  { file: "admin-users-5", role: "admin", path: () => `/admin/users/${ids.casey}` },

  /* admin-profiles */
  { file: "admin-profiles-1", role: "admin", path: "/admin/profiles", target: (p) => link(p, /New profile/).or(btn(p, /New profile/)).first() },
  { file: "admin-profiles-2", role: "admin", path: () => `/admin/profiles/${ids.daniel}`, target: (p) => text(p, /^Import an existing resume/).locator("xpath=../..") },
  { file: "admin-profiles-3", role: "admin", path: () => `/admin/profiles/${ids.daniel}`, target: (p) => [field(p, /API key/i), field(p, /quota/i)] },
  { file: "admin-profiles-4", role: "admin", path: () => `/admin/profiles/${ids.daniel}`, target: (p) => field(p, /cooldown/i) },
  { file: "admin-profiles-5", role: "admin", path: "/admin/profiles", prepare: (p) => rowMenu(p, "Daniel Park"), target: (p) => menu(p) },

  /* admin-assignments */
  { file: "admin-assignments-1", role: "admin", path: "/admin/assignments", target: (p) => btn(p, /Save assignments/) },
  { file: "admin-assignments-2", role: "admin", path: "/admin/assignments", prepare: (p) => click(btn(p, "Matrix")), target: (p) => p.locator("table").first() },
  { file: "admin-assignments-3", role: "admin", path: "/admin/assignments", target: (p) => btn(p, /Save assignments/) },

  /* admin-applications */
  { file: "admin-applications-1", role: "admin", path: "/admin/applications", target: (p) => [field(p, "From"), field(p, "Search")] },
  { file: "admin-applications-2", role: "admin", path: "/admin/applications", prepare: async (p) => { for (let i = 1; i <= 4; i++) await p.locator("tbody tr input[type=checkbox]").nth(i + 2).check(); await wait(p); }, target: (p) => p.locator(".popover.sticky").first() },
  { file: "admin-applications-3", role: "admin", path: "/admin/applications", target: (p) => [btn(p, "Download ZIP: resume, cover letter & JD").locator("xpath=.."), btn(p, "Download resumes").locator("xpath=..")] },
  { file: "admin-applications-4", role: "admin", path: "/admin/applications", prepare: async (p) => { for (let i = 1; i <= 3; i++) await p.locator("tbody tr input[type=checkbox]").nth(i + 2).check(); await wait(p); }, target: (p) => [btn(p, "Mark as paid"), btn(p, "Mark as not paid")] },
  { file: "admin-applications-5", role: "admin", path: "/admin/applications", prepare: (p) => rowMenu(p, "Stripe"), target: (p) => menu(p) },
  { file: "admin-applications-6", role: "admin", path: "/admin/applications", prepare: (p) => click(btn(p, /^Columns/)), target: (p) => p.locator(".popover").last() },

  /* admin-interviews */
  { file: "admin-interviews-1", role: "admin", path: "/admin/interviews", target: (p) => stat(p, "Today").locator("xpath=..") },
  { file: "admin-interviews-2", role: "admin", path: "/admin/interviews", target: (p) => card(tab(p, "Month")) },
  { file: "admin-interviews-3", role: "admin", path: "/admin/interviews", target: (p) => tzPicker(p) },
  { file: "admin-interviews-4", role: "admin", path: "/admin/interviews", target: (p) => text(p, "Profiles").locator("xpath=..") },
  { file: "admin-interviews-5", role: "admin", path: "/admin/interviews", prepare: (p) => text(p, /October|November|December|January/).scrollIntoViewIfNeeded(), target: (p) => p.locator("[draggable=true]").first() },
  { file: "admin-interviews-6", role: "admin", path: "/admin/interviews", prepare: (p) => p.locator("[draggable=true]").first().scrollIntoViewIfNeeded(), target: (p) => p.locator("[draggable=true]").first() },
  { file: "admin-interviews-7", role: "admin", path: "/admin/interviews", prepare: (p) => openInterview(p), target: (p) => btn(dialog(p), /Edit schedule/) },
  { file: "admin-interviews-8", role: "admin", path: "/admin/interviews", prepare: (p) => click(btn(p, "Send message"), 3000), target: (p) => dialog(p) },
  { file: "admin-interviews-9", role: "admin", path: "/admin/interviews", prepare: (p) => click(tab(p, "Month")), target: (p) => card(text(p, "Waiting for a caller")) },
  { file: "admin-interviews-10", role: "admin", path: "/admin/interviews", prepare: (p) => openInterview(p), target: (p) => dialog(p) },
  { file: "admin-interviews-11", role: "admin", path: "/admin/interviews", target: (p) => btn(p, "Interview Assistant") },

  /* admin-notifications */
  { file: "admin-notifications-1", role: "admin", path: "/admin/notifications", target: (p) => btn(p, /New notification/) },
  { file: "admin-notifications-2", role: "admin", path: "/admin/notifications", prepare: (p) => click(btn(p, /New notification/), 1000), target: (p) => dialog(p).getByText(/Recipients|Send to/i).first().locator("xpath=..") },
  { file: "admin-notifications-3", role: "admin", path: "/admin/notifications", prepare: (p) => click(btn(p, /New notification/), 1000), target: (p) => [field(dialog(p), /^Title/), field(dialog(p), /^Message/)] },
  { file: "admin-notifications-4", role: "admin", path: "/admin/notifications", prepare: (p) => click(btn(p, /New notification/), 1000), target: (p) => dialog(p).getByText("Delivery", { exact: true }).locator("xpath=..") },
  { file: "admin-notifications-5", role: "admin", path: "/admin/notifications", target: (p) => p.locator("table, .card").nth(0) },

  /* admin-feedback */
  { file: "admin-feedback-1", role: "admin", path: "/admin/feedback", target: (p) => p.locator("select").first().locator("xpath=../..") },
  { file: "admin-feedback-2", role: "admin", path: "/admin/feedback", prepare: (p) => click(text(p, /Calendar shows the wrong week/), 1000), target: (p) => dialog(p) },
  { file: "admin-feedback-3", role: "admin", path: "/admin/feedback", prepare: (p) => click(text(p, /Calendar shows the wrong week/), 1000), target: (p) => dialog(p).locator("textarea").first().locator("xpath=..") },

  /* admin-logs */
  { file: "admin-logs-1", role: "admin", path: "/admin/logs", target: (p) => field(p, "From").locator("xpath=..") },
  { file: "admin-logs-2", role: "admin", path: "/admin/logs", target: (p) => btn(p, /errors? in the last 24h/) },
  { file: "admin-logs-3", role: "admin", path: "/admin/logs", prepare: (p) => click(p.locator("tbody tr").first(), 1000), target: (p) => dialog(p) },
  { file: "admin-logs-4", role: "admin", path: "/admin/logs", target: (p) => btn(p, /Export CSV/) },

  /* admin-keys */
  { file: "admin-keys-1", role: "admin", path: "/admin/keys", prepare: (p) => click(btn(p, "Add key"), 1000), target: (p) => dialog(p) },
  { file: "admin-keys-2", role: "admin", path: "/admin/keys", target: (p) => btn(p, /^Test/) },
  { file: "admin-keys-3", role: "admin", path: "/admin/keys", prepare: (p) => rowMenu(p, "Backup key"), target: (p) => menu(p) },
  { file: "admin-keys-4", role: "admin", path: "/admin/keys", target: (p) => p.locator("table").first() },

  /* admin-prompt-test */
  { file: "admin-prompt-test-1", role: "admin", path: "/admin/prompt-test", target: (p) => card(text(p, "Profile and job")) },
  { file: "admin-prompt-test-2", role: "admin", path: "/admin/prompt-test", target: (p) => card(text(p, "3. Prompt")) },
  { file: "admin-prompt-test-3", role: "admin", path: "/admin/prompt-test", prepare: (p) => main(p).getByPlaceholder(/greenhouse/).fill("https://boards.greenhouse.io/acme/jobs/4815162342"), target: (p) => btn(p, /Generate test resume/) },
  { file: "admin-prompt-test-4", role: "admin", path: "/admin/prompt-test", target: (p) => [btn(p, /Save prompt to Settings/), btn(p, /Reset to Settings/)] },

  /* admin-api-access */
  { file: "admin-api-access-1", role: "admin", path: "/admin/api-access", prepare: (p) => click(btn(p, /Create API key/), 1000), target: (p) => dialog(p) },
  { file: "admin-api-access-2", role: "admin", path: "/admin/api-access", prepare: async (p) => { await click(btn(p, /Create API key/), 1000); await dialog(p).locator("input").first().fill("Calendar sync"); await click(btn(dialog(p), "Create key"), 1500); }, target: (p) => dialog(p) },
  { file: "admin-api-access-3", role: "admin", path: "/admin/api-access", prepare: (p) => text(p, /Authorization/).scrollIntoViewIfNeeded(), target: (p) => card(text(p, /Authorization/)) },
  { file: "admin-api-access-4", role: "admin", path: "/admin/api-access", target: (p) => p.locator("table").first() },

  /* admin-settings */
  { file: "admin-settings-1", role: "admin", path: "/admin/settings", target: (p) => card(text(p, "General")) },
  { file: "admin-settings-2", role: "admin", path: "/admin/settings", prepare: (p) => text(p, "My Page announcement").scrollIntoViewIfNeeded(), target: (p) => card(text(p, "My Page announcement")) },
  { file: "admin-settings-3", role: "admin", path: "/admin/settings", prepare: (p) => text(p, "Resume & cover letter prompt").scrollIntoViewIfNeeded(), target: (p) => card(text(p, "Resume & cover letter prompt")) },
  { file: "admin-settings-4", role: "admin", path: "/admin/settings", prepare: (p) => text(p, "Extra generation instructions").scrollIntoViewIfNeeded(), target: (p) => card(text(p, "Extra generation instructions")) },
  { file: "admin-settings-5", role: "admin", path: "/admin/settings", prepare: (p) => text(p, "Notifications & daily report").scrollIntoViewIfNeeded(), target: (p) => card(text(p, "Notifications & daily report")) },
];

async function openRequestForm(p: Page) {
  await click(btn(p, /New interview request/), 1200);
  // The profile's first submitted application, so the step and caller fields fill in.
  await dialog(p).locator("select").nth(1).selectOption({ index: 1 }).catch(() => {});
  await wait(p, 1500);
}
async function openInterview(p: Page) {
  await click(tab(p, "List"));
  await click(main(p).locator("tbody tr", { hasText: "Shopify" }).filter({ hasText: "Scheduled" }).first(), 1500);
}
/** Opens the first History interview whose details offer Add / Edit feedback. */
async function openDoneInterview(p: Page) {
  await click(btn(p, /^History/));
  const details = main(p).getByRole("button", { name: "Details", exact: true });
  for (let i = 0; i < (await details.count()); i++) {
    await click(details.nth(i), 1000);
    if (await btn(dialog(p), /feedback/i).isVisible().catch(() => false)) return;
    await p.keyboard.press("Escape");
    await wait(p, 400);
  }
}

/* ------------------------------------------------------------ highlight & capture */
async function bounds(targets: Locator[]) {
  const boxes = [];
  for (const t of targets) {
    await t.waitFor({ state: "visible", timeout: 8000 });
    boxes.push(await t.boundingBox());
  }
  return boxes.filter(Boolean).reduce((u, x) => ({ x1: Math.min(u.x1, x.x), y1: Math.min(u.y1, x.y), x2: Math.max(u.x2, x.x + x.width), y2: Math.max(u.y2, x.y + x.height) }), { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 });
}

/** Scrolls the targets into view (just under the top bar when they don't fit as they are) and draws the outline around them. */
async function outline(p: Page, targets: Locator[]) {
  const vp = p.viewportSize()!;
  let b = await bounds(targets);
  const fits = () => b.y2 <= vp.height - 24 && b.y1 >= 60;
  if (!fits()) {
    // Page scroll first (one clamped call, so the top bar doesn't cover the target)…
    await p.evaluate((dy) => window.scrollTo({ top: window.scrollY + dy, behavior: "instant" }), b.y1 - 96);
    await wait(p, 400);
    b = await bounds(targets);
  }
  if (!fits()) {
    // …then inner scroll areas, such as a long dialog.
    await targets[0].evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    await wait(p, 400);
    b = await bounds(targets);
  }
  const pad = 6;
  await p.evaluate(
    ({ x, y, w, h }) => {
      const d = document.createElement("div");
      Object.assign(d.style, { position: "fixed", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, border: "3px solid #e11d48", borderRadius: "12px", boxShadow: "0 0 0 4px rgba(225,29,72,.18)", zIndex: "2147483647", pointerEvents: "none" });
      document.body.appendChild(d);
    },
    { x: Math.max(2, b.x1 - pad), y: Math.max(2, b.y1 - pad), w: Math.min(vp.width - 4 - Math.max(2, b.x1 - pad), b.x2 - b.x1 + 2 * pad), h: Math.min(vp.height - 4 - Math.max(2, b.y1 - pad), b.y2 - b.y1 + 2 * pad) }
  );
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017", { dbName: process.env.MONGODB_DB || "tailorbid_help_demo" });
  const db = mongoose.connection.db!;
  const one = async (col: string, q: object) => String((await db.collection(col).findOne(q, { sort: { createdAt: -1 } }))?._id ?? "");
  ids = {
    generated: await one("applications", { status: "generated", company: "Shopify" }),
    notGenerated: await one("applications", { status: "not_generated", company: "Coinbase" }),
    session: await one("interviewsessions", { company: "Shopify" }),
    casey: await one("users", { email: EMAIL.bidder }),
    daniel: await one("profiles", { label: "Daniel Park" }),
  };
  await mongoose.disconnect();

  mkdirSync(RAW, { recursive: true });
  const browser = await chromium.launch();
  const failed: string[] = [];
  for (const role of Object.keys(EMAIL) as Role[]) {
    const shots = SHOTS.filter((s) => s.role === role && (!ONLY.length || ONLY.some((o) => s.file === o || s.file.startsWith(o + "-"))));
    if (!shots.length) continue;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: "light", timezoneId: "America/New_York", locale: "en-US" });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("tb-theme", "light");
      } catch {}
    });
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: EMAIL[role], password: PASSWORD } });
    if (!r.ok()) throw new Error(`login ${role}: ${r.status()}`);
    for (const s of shots) {
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + (typeof s.path === "function" ? s.path() : s.path), { waitUntil: "networkidle", timeout: 120_000 });
        await page.addStyleTag({ content: "nextjs-portal{display:none!important} html,*{scroll-behavior:auto!important} *{caret-color:transparent!important} .animate-pop-in,.animate-fade-in{animation:none!important}" });
        await wait(page, 900);
        if (await page.getByText(/You have \d+ unread notification/).isVisible()) {
          await page.keyboard.press("Escape");
          await wait(page, 400);
        }
        if (s.prepare) await s.prepare(page);
        await wait(page, 400);
        const t = s.target?.(page);
        if (t) await outline(page, Array.isArray(t) ? t : [t]);
        await page.screenshot({ path: `${RAW}/${s.file}.png` });
        console.log("ok  ", s.file);
      } catch (e) {
        failed.push(s.file);
        console.log("FAIL", s.file, String((e as Error).message).split("\n")[0]);
        await page.screenshot({ path: `${RAW}/${s.file}.png` }).catch(() => {});
      }
      await page.close().catch(() => {});
    }
    await ctx.close();
  }
  await browser.close();
  console.log(failed.length ? `\n${failed.length} failed: ${failed.join(" ")}` : "\nall captured");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
