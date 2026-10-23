// Fully styled, email-client-safe HTML (tables + inline CSS, 600px column).

export const C = {
  brand: "#4f46e5",
  brandDark: "#3730a3",
  ink: "#0f172a",
  muted: "#64748b",
  line: "#e2e8f0",
  bg: "#f1f5f9",
  card: "#ffffff",
  soft: "#eef2ff",
  green: "#059669",
  greenSoft: "#d1fae5",
  sky: "#0369a1",
  skySoft: "#e0f2fe",
};
export const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type Email = { subject: string; html: string; text: string };

function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px"><tr>
<td style="border-radius:8px;background:${C.brand}"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a></td>
</tr></table>`;
}

export function layout(opts: { preheader: string; eyebrow: string; title: string; body: string; cta?: { label: string; href: string } }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td style="padding:0 4px 16px;font-family:${FONT};font-size:20px;font-weight:800;color:${C.brand};letter-spacing:-0.3px">TailorBid</td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:14px;overflow:hidden">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:4px;background:${C.brand};line-height:4px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:28px 32px 32px;font-family:${FONT};color:${C.ink}">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${C.brand}">${esc(opts.eyebrow)}</div>
          <h1 style="margin:6px 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:${C.ink}">${esc(opts.title)}</h1>
          ${opts.body}
          ${opts.cta ? button(opts.cta.label, opts.cta.href) : ""}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:18px 8px;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};text-align:center">
      You are receiving this because of your role on TailorBid.<br>This is an automated message; please do not reply.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.ink}">${html}</p>`;

function statTiles(stats: { label: string; value: string | number; tone?: "brand" | "green" | "sky" }[]) {
  const tone = { brand: [C.soft, C.brandDark], green: [C.greenSoft, C.green], sky: [C.skySoft, C.sky] };
  const w = Math.floor(100 / stats.length);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px"><tr>
${stats
  .map(({ label, value, tone: t = "brand" }, i) => {
    const [bg, fg] = tone[t];
    return `<td width="${w}%" style="padding:${i ? "0 0 0 8px" : "0"}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${bg};border-radius:10px;padding:14px 16px;font-family:${FONT}">
<div style="font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${fg}">${esc(label)}</div>
<div style="margin-top:4px;font-size:26px;font-weight:800;color:${C.ink}">${esc(value)}</div></td></tr></table></td>`;
  })
  .join("")}
</tr></table>`;
}

function badge(text: string, kind: "green" | "sky") {
  const [bg, fg] = kind === "green" ? [C.greenSoft, C.green] : [C.skySoft, C.sky];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${bg};color:${fg};font-size:11px;font-weight:700;text-transform:capitalize">${esc(text)}</span>`;
}

function bidTable(rows: BidRow[]) {
  if (!rows.length)
    return `<div style="padding:14px 16px;border:1px dashed ${C.line};border-radius:10px;font-size:13px;color:${C.muted};text-align:center">No bids placed.</div>`;
  const th = (t: string, align = "left") =>
    `<th align="${align}" style="padding:8px 10px;border-bottom:1px solid ${C.line};background:#f8fafc;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${C.muted}">${t}</th>`;
  const td = (h: string, extra = "") => `<td style="padding:9px 10px;border-bottom:1px solid ${C.line};font-size:13px;line-height:1.4;color:${C.ink};vertical-align:top;${extra}">${h}</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden">
<tr>${th("Time")}${th("Company")}${th("Role")}${th("Bidder")}${th("Status", "right")}</tr>
${rows
  .map(
    (r) => `<tr>${td(esc(r.time), "white-space:nowrap;color:" + C.muted)}${td(`<strong>${esc(r.company || "Unknown")}</strong>`)}${td(
      r.jobUrl ? `<a href="${esc(r.jobUrl)}" style="color:${C.brand};text-decoration:none">${esc(r.role || "Untitled role")}</a>` : esc(r.role || "Untitled role")
    )}${td(esc(r.bidder))}${td(badge(r.status, r.status === "submitted" ? "green" : "sky"), "text-align:right")}</tr>`
  )
  .join("")}
</table>`;
}

/* ----------------------------------------------------------- templates */

export type BidRow = { time: string; company: string; role: string; bidder: string; status: string; jobUrl?: string };
export type ProfileReport = { label: string; fullName: string; count: number; submitted: number; bids: BidRow[] };

export function dailyReportEmail(o: {
  recipientName: string;
  scope: "all" | "managed";
  dayLabel: string;
  timezone: string;
  profiles: ProfileReport[];
  url?: string;
}): Email {
  const total = o.profiles.reduce((a, x) => a + x.count, 0);
  const submitted = o.profiles.reduce((a, x) => a + x.submitted, 0);
  const active = o.profiles.filter((x) => x.count > 0).length;
  const sorted = [...o.profiles].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const summaryRows = sorted
    .map(
      (x) => `<tr>
<td style="padding:9px 12px;border-bottom:1px solid ${C.line};font-size:14px"><strong>${esc(x.label)}</strong><div style="font-size:12px;color:${C.muted}">${esc(x.fullName)}</div></td>
<td align="right" style="padding:9px 12px;border-bottom:1px solid ${C.line};font-size:16px;font-weight:800;color:${x.count ? C.ink : C.muted}">${x.count}</td>
<td align="right" style="padding:9px 12px;border-bottom:1px solid ${C.line};font-size:13px;color:${C.green}">${x.submitted} submitted</td></tr>`
    )
    .join("");

  const sections = sorted
    .filter((x) => x.count > 0)
    .map(
      (x) => `<tr><td style="padding:22px 0 8px;font-family:${FONT}">
<div style="font-size:15px;font-weight:700;color:${C.ink}">${esc(x.label)} <span style="font-weight:400;color:${C.muted}">&middot; ${x.count} bid${x.count === 1 ? "" : "s"}</span></div>
</td></tr><tr><td>${bidTable(x.bids)}</td></tr>`
    )
    .join("");

  const body = `
${p(`Hi ${esc(o.recipientName)}, here is the bid report for <strong>${esc(o.dayLabel)}</strong> (${esc(o.timezone)})${o.scope === "managed" ? " for the profiles you manage" : ""}.`)}
${statTiles([
  { label: "Total bids", value: total },
  { label: "Submitted", value: submitted, tone: "green" },
  { label: "Active profiles", value: `${active}/${o.profiles.length}`, tone: "sky" },
])}
<div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted}">Bids per profile</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden">${
    summaryRows || `<tr><td style="padding:14px;font-size:13px;color:${C.muted}">No profiles.</td></tr>`
  }</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${sections}</table>`;

  const text = [
    `Bid report for ${o.dayLabel} (${o.timezone})`,
    `Total bids: ${total} | Submitted: ${submitted}`,
    "",
    ...sorted.flatMap((x) => [
      `${x.label}: ${x.count} bids`,
      ...x.bids.map((b) => `  ${b.time}  ${b.company} | ${b.role} | ${b.bidder} | ${b.status}`),
    ]),
  ].join("\n");

  return {
    subject: `Daily bid report · ${o.dayLabel} · ${total} bid${total === 1 ? "" : "s"}`,
    html: layout({
      preheader: `${total} bids across ${active} profiles on ${o.dayLabel}.`,
      eyebrow: "Daily report",
      title: `${total} bid${total === 1 ? "" : "s"} on ${o.dayLabel}`,
      body,
      cta: o.url ? { label: "Open application history", href: `${o.url}/admin/applications` } : undefined,
    }),
    text,
  };
}

function milestoneHeadline(n: number, period: "daily" | "lifetime") {
  if (n === 1) return period === "daily" ? "First submitted application today" : "First submitted application";
  return `${n} submitted applications${period === "daily" ? " today" : ""}`;
}

export function profileMilestoneEmail(o: {
  recipientName: string;
  profileLabel: string;
  milestone: number;
  count: number;
  period: "daily" | "lifetime";
  latest: BidRow;
  url?: string;
}): Email {
  const head = milestoneHeadline(o.milestone, o.period);
  const body = `
${p(`Hi ${esc(o.recipientName)},`)}
${p(
  o.milestone === 1
    ? `The first application with the profile <strong>${esc(o.profileLabel)}</strong> was submitted${o.period === "daily" ? " today" : ""}.`
    : `The profile <strong>${esc(o.profileLabel)}</strong> has reached <strong>${o.milestone} submitted applications</strong>${o.period === "daily" ? " today" : ""}.`
)}
${statTiles([
  { label: "Milestone", value: o.milestone === 1 ? "1st submitted" : o.milestone },
  { label: o.period === "daily" ? "Submitted today" : "Total submitted", value: o.count, tone: "sky" },
])}
<div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted}">Latest submitted application</div>
${bidTable([o.latest])}`;
  return {
    subject: `${o.profileLabel}: ${head}`,
    html: layout({
      preheader: `${o.profileLabel} ${o.milestone === 1 ? "has its first submitted application" : `reached ${o.milestone} submitted applications`}.`,
      eyebrow: "Profile milestone",
      title: `${o.profileLabel}: ${head}`,
      body,
      cta: o.url ? { label: "View application history", href: `${o.url}/admin/applications` } : undefined,
    }),
    text: `${o.profileLabel}: ${head}. Count: ${o.count}. Latest: ${o.latest.company} | ${o.latest.role} | ${o.latest.bidder} at ${o.latest.time}`,
  };
}

export function userMilestoneEmail(o: {
  recipientName: string;
  milestone: number;
  count: number;
  period: "daily" | "lifetime";
  latest: BidRow;
  url?: string;
}): Email {
  const head =
    o.milestone === 1
      ? o.period === "daily"
        ? "Your first submitted application today"
        : "Your first submitted application"
      : `You submitted ${o.milestone} applications${o.period === "daily" ? " today" : ""}`;
  const cheer =
    o.milestone === 1
      ? "Great start. Keep uploading a confirmation screenshot for every application you submit."
      : o.milestone >= 100
        ? "Outstanding work. That is a huge amount of effort, well done."
        : "Excellent momentum. Keep it going.";
  const body = `
${p(`Hi ${esc(o.recipientName)},`)}
${p(
  o.milestone === 1
    ? `Your first application${o.period === "daily" ? " of the day" : ""} has been submitted. ${cheer}`
    : `You have submitted <strong>${o.milestone} applications</strong>${o.period === "daily" ? " today" : ""}. ${cheer}`
)}
${statTiles([
  { label: "Milestone", value: o.milestone === 1 ? "1st submitted" : o.milestone },
  { label: o.period === "daily" ? "Submitted today" : "Total submitted", value: o.count, tone: "green" },
])}
<div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted}">Latest submitted application</div>
${bidTable([o.latest])}`;
  return {
    subject: head,
    html: layout({ preheader: head, eyebrow: "Milestone", title: head, body, cta: o.url ? { label: "Open my applications", href: `${o.url}/applications` } : undefined }),
    text: `${head}. Count: ${o.count}. Latest: ${o.latest.company} | ${o.latest.role} at ${o.latest.time}`,
  };
}

export function signupEmail(o: { name: string; email: string; url?: string }): Email {
  const body = `${p(`<strong>${esc(o.name)}</strong> (${esc(o.email)}) has requested access to TailorBid.`)}${p("Review the request and approve or reject it from the Users page.")}`;
  return {
    subject: `New sign-up request: ${o.name}`,
    html: layout({ preheader: `${o.name} requested access.`, eyebrow: "Sign-up request", title: "New account awaiting approval", body, cta: o.url ? { label: "Review request", href: `${o.url}/admin/users?status=pending` } : undefined }),
    text: `${o.name} (${o.email}) has requested access to TailorBid.`,
  };
}

export function statusEmail(o: { name: string; status: string; url?: string }): Email {
  const approved = o.status === "approved";
  const title = approved ? "Your account is approved" : o.status === "suspended" ? "Your account was deactivated" : "Your sign-up request was not approved";
  const body = approved
    ? `${p(`Hi ${esc(o.name)},`)}${p("Your TailorBid account has been approved. You can now sign in and start generating tailored applications.")}`
    : `${p(`Hi ${esc(o.name)},`)}${p(`Your TailorBid account has been ${o.status === "suspended" ? "deactivated" : "declined"}. If you think this is a mistake, please contact an administrator.`)}`;
  return {
    subject: title,
    html: layout({ preheader: title, eyebrow: "Account", title, body, cta: approved && o.url ? { label: "Sign in", href: `${o.url}/login` } : undefined }),
    text: `${title}.`,
  };
}

/* --------------------------------------------------------------- invite */

const ROLE_INFO: Record<string, { label: string; tagline: string; can: string[] }> = {
  admin: {
    label: "Admin",
    tagline: "Full administrative access to TailorBid.",
    can: [
      "Manage users, bidders, profiles and OpenAI keys",
      "Review every application and export documents",
      "Configure fees, notifications and the daily report",
    ],
  },
  user: {
    label: "User",
    tagline: "You manage the candidate profiles assigned to you.",
    can: [
      "Keep your assigned profiles up to date",
      "Assign your profiles to bidders and follow their progress",
      "Receive the midnight report and submission milestones for your profiles",
    ],
  },
  caller: {
    label: "Caller",
    tagline: "You schedule and conduct interviews for the candidate profiles assigned to you.",
    can: [
      "Receive interview requests from bidders by email and on the website",
      "Schedule each interview at an available time, or transfer it with a reason",
      "Track everything on your My Schedule calendar, with next-day and pre-interview reminders",
    ],
  },
  bidder: {
    label: "Bidder",
    tagline: "You create tailored applications for full-time roles.",
    can: [
      "Paste a job URL to get a tailored resume, cover letter and job description",
      "Download everything as a ZIP (PDF + DOCX)",
      "Upload a confirmation screenshot to log each submitted application",
    ],
  },
};

export function inviteEmail(o: {
  name: string;
  email: string;
  password: string;
  role: string;
  invitedBy: string;
  url?: string;
  reset?: boolean;
}): Email {
  const info = ROLE_INFO[o.role] ?? ROLE_INFO.bidder;
  const loginUrl = o.url ? `${o.url}/login` : "";
  const title = o.reset ? "Your new TailorBid sign-in details" : `Welcome to TailorBid, ${o.name.split(" ")[0]}`;
  const mono = "SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

  const credRow = (label: string, value: string, isMono = false, last = false) => `<tr>
<td style="padding:12px 16px;${last ? "" : `border-bottom:1px solid ${C.line};`}font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted};width:110px;vertical-align:middle">${label}</td>
<td style="padding:12px 16px;${last ? "" : `border-bottom:1px solid ${C.line};`}font-family:${isMono ? mono : FONT};font-size:15px;font-weight:600;color:${C.ink};word-break:break-all">${value}</td></tr>`;

  const roleBadge = `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${C.brand};color:#ffffff;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.3px">${esc(info.label)}</span>`;

  const credentials = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;border:1px solid ${C.line};border-radius:12px;border-collapse:separate;background:#f8fafc">
${credRow("Sign-in URL", loginUrl ? `<a href="${esc(loginUrl)}" style="color:${C.brand};text-decoration:none">${esc(loginUrl.replace(/^https?:\/\//, ""))}</a>` : "Ask your administrator")}
${credRow("Email", esc(o.email), true)}
${credRow("Password", `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background:#ffffff;border:1px dashed ${C.brand};letter-spacing:1px">${esc(o.password)}</span>`, true)}
${credRow("Role", roleBadge, false, true)}
</table>`;

  const steps = [
    "Sign in with the email and temporary password above.",
    "Open <strong>My Page</strong> and set a new password of your own.",
    o.role === "bidder" ? "Go to <strong>Generate</strong> and paste your first job URL." : o.role === "caller" ? "Open <strong>Interview Requests</strong> to see requests waiting for you, and set your reminder time on <strong>My Page</strong>." : o.role === "user" ? "Open <strong>Profiles</strong> to review the profiles you manage." : "Open the <strong>Admin overview</strong> to get started.",
  ];
  const stepList = steps
    .map(
      (s, i) => `<tr>
<td width="30" style="padding:0 0 12px;vertical-align:top"><div style="width:24px;height:24px;border-radius:999px;background:${C.soft};color:${C.brandDark};font-family:${FONT};font-size:12px;font-weight:800;line-height:24px;text-align:center">${i + 1}</div></td>
<td style="padding:2px 0 12px 10px;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.ink}">${s}</td></tr>`
    )
    .join("");

  const canList = info.can
    .map((c) => `<tr><td width="18" style="padding:0 0 8px;vertical-align:top;font-family:${FONT};font-size:14px;color:${C.green};font-weight:800">&#10003;</td><td style="padding:0 0 8px 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.ink}">${esc(c)}</td></tr>`)
    .join("");

  const body = `
${p(`Hi ${esc(o.name)},`)}
${p(
  o.reset
    ? `${esc(o.invitedBy)} has issued you a new temporary password for TailorBid. Your previous password no longer works.`
    : `${esc(o.invitedBy)} has created a TailorBid account for you as a <strong>${esc(info.label)}</strong>. ${esc(info.tagline)}`
)}
<div style="margin:18px 0 8px;font-size:13px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted}">Your sign-in details</div>
${credentials}
${
  o.reset
    ? ""
    : `<div style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted}">What you can do</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">${canList}</table>`
}
<div style="margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted}">Get started</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">${stepList}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0"><tr>
<td style="padding:12px 14px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;font-family:${FONT};font-size:13px;line-height:1.5;color:#92400e">
<strong>Keep this safe.</strong> This is a temporary password. Change it after your first sign-in and never share it. If you did not expect this email, contact your administrator.
</td></tr></table>`;

  return {
    subject: o.reset ? "Your new TailorBid password" : `You're invited to TailorBid as a ${info.label}`,
    html: layout({
      preheader: o.reset ? "Your temporary password has been reset." : `Your ${info.label} account is ready. Sign-in details inside.`,
      eyebrow: o.reset ? "Password reset" : "Invitation",
      title,
      body,
      cta: loginUrl ? { label: "Sign in to TailorBid", href: loginUrl } : undefined,
    }),
    text: [
      `Hi ${o.name},`,
      o.reset ? `${o.invitedBy} reset your TailorBid password.` : `${o.invitedBy} created a TailorBid account for you (${info.label}).`,
      "",
      `Sign in: ${loginUrl || "ask your administrator"}`,
      `Email: ${o.email}`,
      `Temporary password: ${o.password}`,
      `Role: ${info.label}`,
      "",
      "Please change your password after your first sign-in (My Page).",
    ].join("\n"),
  };
}

/* ----------------------------------------------------------- assignments */

export type AssignmentChange = { added: string[]; removed: string[] };

export function assignmentEmail(o: {
  name: string;
  role: string;
  generate: AssignmentChange; // bidder: profiles they can generate with
  manage: AssignmentChange; // user/admin: profiles they manage
  changedBy: string;
  url?: string;
}): Email {
  const isBidder = o.role === "bidder";
  const added = [...o.generate.added, ...o.manage.added];
  const removed = [...o.generate.removed, ...o.manage.removed];
  const title =
    added.length && !removed.length
      ? `You have ${added.length === 1 ? "a new profile" : `${added.length} new profiles`}`
      : removed.length && !added.length
        ? `${removed.length === 1 ? "A profile was" : `${removed.length} profiles were`} removed from your account`
        : "Your profile assignments changed";

  const chip = (label: string, tone: "green" | "slate") => {
    const [bg, fg, border] = tone === "green" ? [C.greenSoft, "#065f46", "#a7f3d0"] : ["#f1f5f9", "#475569", C.line];
    return `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:8px;background:${bg};border:1px solid ${border};color:${fg};font-family:${FONT};font-size:13px;font-weight:600;${tone === "slate" ? "text-decoration:line-through;" : ""}">${esc(label)}</span>`;
  };
  const block = (heading: string, desc: string, items: string[], tone: "green" | "slate") =>
    items.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border:1px solid ${C.line};border-radius:12px;border-collapse:separate">
<tr><td style="padding:14px 16px 8px;font-family:${FONT}">
<div style="font-size:13px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${tone === "green" ? C.green : C.muted}">${heading}</div>
<div style="margin:4px 0 10px;font-size:13px;line-height:1.5;color:${C.muted}">${desc}</div>
${items.map((i) => chip(i, tone)).join("")}
</td></tr></table>`
      : "";

  const body = `
${p(`Hi ${esc(o.name)},`)}
${p(`${esc(o.changedBy)} updated your profile assignments on TailorBid.`)}
${block(
  "Now available to you",
  o.role === "caller"
    ? "You will receive interview requests for these profiles."
    : "You can generate tailored resumes, cover letters and job descriptions with these profiles.",
  o.generate.added,
  "green"
)}
${block(
  "You now manage",
  o.role === "admin"
    ? "You will receive milestone emails for these profiles."
    : "You can edit these profiles, assign them to bidders, and you will receive their daily report and milestone emails.",
  o.manage.added,
  "green"
)}
${block(
  "No longer available",
  o.role === "caller"
    ? "You will no longer receive interview requests for these profiles. Interviews you already scheduled stay on your calendar."
    : "These profiles no longer appear on your Generate page. Your past applications are kept.",
  o.generate.removed,
  "slate"
)}
${block("No longer managed by you", "You will no longer receive reports or notifications for these profiles.", o.manage.removed, "slate")}
${p(
  isBidder
    ? "Open View Profile's Information to see the full details of each assigned profile."
    : o.role === "caller"
    ? "Open My Profiles to see the full details of each assigned profile."
    : "Open Profiles in TailorBid to review the profiles you manage."
)}`;

  const lines = [
    ...o.generate.added.map((x) => `+ Can generate with: ${x}`),
    ...o.manage.added.map((x) => `+ Manage: ${x}`),
    ...o.generate.removed.map((x) => `- No longer available: ${x}`),
    ...o.manage.removed.map((x) => `- No longer managed: ${x}`),
  ];
  return {
    subject: title,
    html: layout({
      preheader: lines.join(" · ").slice(0, 140),
      eyebrow: "Profile assignments",
      title,
      body,
      cta: o.url ? { label: isBidder ? "Open View Profile's Information" : "Open Profiles", href: `${o.url}${isBidder ? "/profiles" : "/admin/profiles"}` } : undefined,
    }),
    text: [`Hi ${o.name},`, `${o.changedBy} updated your profile assignments:`, ...lines].join("\n"),
  };
}

