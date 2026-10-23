// HTML emails for interview requests (same table + inline-CSS layout as lib/emailTemplates.ts).
import { C, esc, FONT, layout, p, type Email } from "./emailTemplates";

/** Everything an email shows about one request; times are pre-formatted for the recipient's timezone. */
export type InterviewDetails = {
  step: number;
  locked?: boolean;
  profile: string;
  company: string;
  jobTitle: string;
  bidder: string;
  /** Label for the bidder row: "Bidder", or "Scheduled by" when an admin booked it. */
  bidderLabel?: string;
  requested: string; // "Thu, Oct 2, 3:00 PM – 5:00 PM (America/New_York)"
  duration: number;
  notes?: string;
  scheduled?: string;
  caller?: string;
  callerNote?: string;
  screenshots?: string[];
};

function detailsTable(d: InterviewDetails) {
  const rows: [string, string][] = [
    ["Step", `${stepBar(d.step)} <strong>Step ${d.step}</strong> · ${d.step === 1 ? "initial interview" : "follow-up interview"}`],
    ["Profile", `<strong>${esc(d.profile)}</strong>`],
    ["Company", esc(d.company || "Not specified")],
    ["Role", esc(d.jobTitle || "Not specified")],
    [d.bidderLabel ?? "Bidder", esc(d.bidder)],
    ...(d.requested !== d.scheduled ? [["Requested", esc(d.requested)] as [string, string]] : []),
    ["Length", `${d.duration} minutes`],
  ];
  if (d.scheduled) rows.push(["Scheduled", `<strong style="color:${C.green}">${esc(d.scheduled)}</strong>`]);
  if (d.caller) rows.push(["Caller", esc(d.caller)]);
  if (d.callerNote) rows.push(["Caller note", esc(d.callerNote).replace(/\n/g, "<br>")]);
  if (d.notes) rows.push([d.bidderLabel ? "Notes" : "Bidder notes", esc(d.notes).replace(/\n/g, "<br>")]);
  const tr = ([k, v]: [string, string], i: number) => `<tr>
<td style="padding:10px 14px;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${C.muted};width:120px;vertical-align:top">${k}</td>
<td style="padding:10px 14px;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${FONT};font-size:14px;line-height:1.5;color:${C.ink}">${v}</td></tr>`;
  const shots = (d.screenshots ?? []).length
    ? `<div style="margin:0 0 18px">${(d.screenshots ?? [])
        .map(
          (u, i) =>
            `<a href="${esc(u)}" target="_blank" style="display:inline-block;margin:0 8px 8px 0"><img src="${esc(u.replace("/upload/", "/upload/c_limit,w_520/"))}" alt="Interview email screenshot ${i + 1}" width="260" style="display:block;width:260px;max-width:100%;border:1px solid ${C.line};border-radius:8px"></a>`
        )
        .join("")}</div>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;border:1px solid ${C.line};border-radius:12px;border-collapse:separate;background:#f8fafc">${rows.map(tr).join("")}</table>${shots}`;
}

const STEP_COLORS = ["#0ea5e9", "#6366f1", "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e", "#f97316", "#f59e0b", "#84cc16", "#10b981"];
/** One coloured segment per step (e.g. three segments for step 3). */
function stepBar(step: number) {
  return `<span style="display:inline-block;vertical-align:middle;margin-right:6px">${STEP_COLORS.slice(0, Math.max(1, Math.min(10, step)))
    .map((c) => `<span style="display:inline-block;width:14px;height:6px;margin-right:2px;border-radius:3px;background:${c}"></span>`)
    .join("")}</span>`;
}

function callout(html: string, tone: "amber" | "green" | "rose" = "amber") {
  const [bg, border, fg] = { amber: ["#fffbeb", "#fde68a", "#92400e"], green: [C.greenSoft, "#a7f3d0", "#065f46"], rose: ["#fff1f2", "#fecdd3", "#9f1239"] }[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr><td style="padding:12px 14px;border-radius:10px;background:${bg};border:1px solid ${border};font-family:${FONT};font-size:14px;line-height:1.5;color:${fg}">${html}</td></tr></table>`;
}

const textDetails = (d: InterviewDetails) =>
  [
    `Step: ${d.step} (${d.step === 1 ? "initial" : "follow-up"})`,
    `Profile: ${d.profile}`,
    `Company: ${d.company || "-"}`,
    `Role: ${d.jobTitle || "-"}`,
    `${d.bidderLabel ?? "Bidder"}: ${d.bidder}`,
    d.requested !== d.scheduled ? `Requested: ${d.requested}` : "",
    `Length: ${d.duration} minutes`,
    d.scheduled ? `Scheduled: ${d.scheduled}` : "",
    d.caller ? `Caller: ${d.caller}` : "",
    d.callerNote ? `Caller note: ${d.callerNote}` : "",
    d.notes ? `Notes: ${d.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

const title = (d: InterviewDetails) => `Step ${d.step} · ${[d.company, d.jobTitle].filter(Boolean).join(" · ") || d.profile}`;

/** To the caller a bidder sent the request to. */
export function interviewRequestEmail(o: { name: string; d: InterviewDetails; deadline: string; url: string }): Email {
  const body = `${p(`Hi ${esc(o.name)},`)}
${p(`<strong>${esc(o.d.bidder)}</strong> asked you to conduct an interview for <strong>${esc(o.d.profile)}</strong>. Please review the details and schedule it at a time you are available.`)}
${
  o.d.locked
    ? callout(
        `This is <strong>step ${o.d.step}</strong> of an interview process you started. <strong>You must conduct it</strong>; follow-up interviews can't be transferred. Please schedule it by <strong>${esc(o.deadline)}</strong>.`,
        "rose"
      )
    : callout(`Please schedule it by <strong>${esc(o.deadline)}</strong>. If you can't make the requested time, transfer it with a reason so another caller can take it.`)
}
${detailsTable(o.d)}`;
  return {
    subject: `Interview request: ${title(o.d)}`,
    html: layout({ preheader: `${o.d.bidder} requested an interview for ${o.d.profile}. Schedule it by ${o.deadline}.`, eyebrow: "Interview request", title: `New interview request for ${o.d.profile}`, body, cta: { label: "Review & schedule", href: o.url } }),
    text: `Hi ${o.name},\n\n${o.d.bidder} asked you to conduct an interview for ${o.d.profile}.\nSchedule it by ${o.deadline}.\n\n${textDetails(o.d)}\n\nReview & schedule: ${o.url}`,
  };
}

/** To the caller an admin booked an interview for (already scheduled; nothing to accept). */
export function interviewAssignedEmail(o: { name: string; by: string; d: InterviewDetails; url: string; updated?: boolean }): Email {
  const intro = o.updated
    ? `An admin updated your interview for <strong>${esc(o.d.profile)}</strong>. Here are the current details.`
    : `<strong>${esc(o.by)}</strong> scheduled an interview for you to conduct for <strong>${esc(o.d.profile)}</strong>.`;
  const body = `${p(`Hi ${esc(o.name)},`)}
${p(intro)}
${callout(`<strong>${esc(o.d.scheduled ?? "")}</strong> · ${o.d.duration} minutes`, "green")}
${
  o.d.locked ? callout(`This is <strong>step ${o.d.step}</strong> of an interview process you started, so it stays with you.`) : ""
}${p(`It is already on your schedule. You will get the usual reminder before it starts. If the time doesn't work, open it to reschedule${o.d.locked ? "" : " or hand it to another caller"}.`)}
${detailsTable(o.d)}`;
  return {
    subject: `${o.updated ? "Interview updated" : "Interview scheduled for you"}: ${title(o.d)} · ${o.d.scheduled}`,
    html: layout({
      preheader: o.updated ? `Your interview for ${o.d.profile} was updated: ${o.d.scheduled}.` : `${o.by} scheduled an interview for you: ${o.d.scheduled}.`,
      eyebrow: o.updated ? "Interview updated" : "Interview scheduled",
      title: o.updated ? `Updated: your interview for ${o.d.profile}` : `You have an interview for ${o.d.profile}`,
      body,
      cta: { label: "Open My Schedule", href: o.url },
    }),
    text: `Hi ${o.name},

${o.by} scheduled an interview for you to conduct for ${o.d.profile}.
When: ${o.d.scheduled} (${o.d.duration} minutes)

${textDetails(o.d)}

Open My Schedule: ${o.url}`,
  };
}

/** To every other caller when a request is transferred: the first to accept gets it. */
export function interviewOpenEmail(o: { name: string; from: string; reason: string; d: InterviewDetails; url: string }): Email {
  const body = `${p(`Hi ${esc(o.name)},`)}
${p(`<strong>${esc(o.from)}</strong> can't conduct this interview and has opened it to all callers. <strong>The first caller to accept it gets it.</strong>`)}
${callout(`<strong>Reason:</strong> ${esc(o.reason)}`)}
${detailsTable(o.d)}`;
  return {
    subject: `Open interview request: ${title(o.d)}`,
    html: layout({ preheader: `${o.from} transferred an interview for ${o.d.profile}. First to accept gets it.`, eyebrow: "Open request", title: `Can you take this interview?`, body, cta: { label: "Accept this request", href: o.url } }),
    text: `Hi ${o.name},\n\n${o.from} transferred this interview request. The first caller to accept gets it.\nReason: ${o.reason}\n\n${textDetails(o.d)}\n\nAccept: ${o.url}`,
  };
}

/** To the bidder, the profile's users and admins when a caller accepts (schedules) a request. */
export function interviewAcceptedEmail(o: { name: string; d: InterviewDetails; rescheduled?: boolean; url: string }): Email {
  const verb = o.rescheduled ? "rescheduled" : "accepted and scheduled";
  const body = `${p(`Hi ${esc(o.name)},`)}
${p(`<strong>${esc(o.d.caller ?? "A caller")}</strong> ${verb} the interview for <strong>${esc(o.d.profile)}</strong>.`)}
${callout(`<strong>${esc(o.d.scheduled ?? "")}</strong> · ${o.d.duration} minutes with ${esc(o.d.caller ?? "")}`, "green")}
${detailsTable(o.d)}`;
  return {
    subject: `${o.rescheduled ? "Interview rescheduled" : "Interview scheduled"}: ${title(o.d)} · ${o.d.scheduled}`,
    html: layout({ preheader: `${o.d.caller} ${verb} the interview for ${o.d.profile}: ${o.d.scheduled}.`, eyebrow: o.rescheduled ? "Rescheduled" : "Interview scheduled", title: `${o.d.caller} will conduct the interview`, body, cta: { label: "View interview", href: o.url } }),
    text: `Hi ${o.name},\n\n${o.d.caller} ${verb} the interview for ${o.d.profile}.\n\n${textDetails(o.d)}\n\n${o.url}`,
  };
}

/** To the bidder, the profile's users and admins when nobody scheduled the request in time. */
export function interviewOverdueEmail(o: { name: string; caller: string | null; hours: number; d: InterviewDetails; url: string }): Email {
  const who = o.caller ? `The assigned caller, <strong>${esc(o.caller)}</strong>, did` : "No caller has";
  const body = `${p(`Hi ${esc(o.name)},`)}
${callout(`${who} not schedule this interview within <strong>${o.hours} hour${o.hours === 1 ? "" : "s"}</strong> of the request.`, "rose")}
${p("Please follow up, or ask another caller to take it.")}
${detailsTable(o.d)}`;
  return {
    subject: `Not scheduled in time: ${title(o.d)}`,
    html: layout({ preheader: `${o.caller ?? "No caller"} did not schedule the interview for ${o.d.profile} within ${o.hours}h.`, eyebrow: "Action needed", title: `Interview request not scheduled in time`, body, cta: { label: "Open request", href: o.url } }),
    text: `Hi ${o.name},\n\n${o.caller ? `The assigned caller, ${o.caller}, did` : "No caller has"} not schedule this interview within ${o.hours} hours.\n\n${textDetails(o.d)}\n\n${o.url}`,
  };
}

/** To the caller the day before: tomorrow's interviews. */
export function interviewDigestEmail(o: {
  name: string;
  day: string;
  timezone: string;
  rows: { time: string; company: string; role: string; profile: string; bidder: string; note: string }[];
  url: string;
}): Email {
  const th = (t: string) => `<th align="left" style="padding:8px 10px;border-bottom:1px solid ${C.line};background:#f8fafc;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${C.muted}">${t}</th>`;
  const td = (h: string, extra = "") => `<td style="padding:9px 10px;border-bottom:1px solid ${C.line};font-size:13px;line-height:1.4;color:${C.ink};vertical-align:top;${extra}">${h}</td>`;
  const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden;font-family:${FONT}">
<tr>${th("Time")}${th("Profile")}${th("Company / Role")}${th("Bidder")}</tr>
${o.rows
  .map(
    (r) =>
      `<tr>${td(`<strong>${esc(r.time)}</strong>`, "white-space:nowrap")}${td(esc(r.profile))}${td(`<strong>${esc(r.company || "—")}</strong><div style="color:${C.muted}">${esc(r.role)}</div>${r.note ? `<div style="margin-top:4px;color:${C.muted}">${esc(r.note)}</div>` : ""}`)}${td(esc(r.bidder))}</tr>`
  )
  .join("")}
</table>`;
  const body = `${p(`Hi ${esc(o.name)},`)}
${p(`You have <strong>${o.rows.length} interview${o.rows.length === 1 ? "" : "s"}</strong> tomorrow, ${esc(o.day)}. Times are in ${esc(o.timezone)}.`)}
${table}`;
  return {
    subject: `Tomorrow: ${o.rows.length} interview${o.rows.length === 1 ? "" : "s"} (${o.day})`,
    html: layout({ preheader: `Your interview schedule for ${o.day}.`, eyebrow: "Tomorrow's schedule", title: `Your interviews for ${o.day}`, body, cta: { label: "Open My Schedule", href: o.url } }),
    text: `Hi ${o.name},\n\nYour interviews for ${o.day} (${o.timezone}):\n${o.rows.map((r) => `- ${r.time} · ${r.profile} · ${r.company} ${r.role} · ${r.bidder}`).join("\n")}\n\n${o.url}`,
  };
}

/** To a caller: their interviews on a chosen day, sent from the Interviews page with an optional note. */
export function interviewDayMessageEmail(o: {
  name: string;
  from: string;
  day: string;
  timezone: string;
  note: string;
  rows: { time: string; profile: string; company: string; role: string; note: string }[];
  url: string;
}): Email {
  const th = (t: string) => `<th align="left" style="padding:8px 10px;border-bottom:1px solid ${C.line};background:#f8fafc;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${C.muted}">${t}</th>`;
  const td = (h: string, extra = "") => `<td style="padding:9px 10px;border-bottom:1px solid ${C.line};font-size:13px;line-height:1.4;color:${C.ink};vertical-align:top;${extra}">${h}</td>`;
  const table = o.rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden;font-family:${FONT}">
<tr>${th("Time")}${th("Profile")}${th("Company / Role")}</tr>
${o.rows
  .map(
    (r) =>
      `<tr>${td(`<strong>${esc(r.time)}</strong>`, "white-space:nowrap")}${td(esc(r.profile))}${td(`<strong>${esc(r.company || "—")}</strong><div style="color:${C.muted}">${esc(r.role)}</div>${r.note ? `<div style="margin-top:4px;color:${C.muted}">${esc(r.note)}</div>` : ""}`)}</tr>`
  )
  .join("")}
</table>`
    : callout("No interviews are scheduled for you on this day.");
  const body = `${p(`Hi ${esc(o.name)},`)}
${p(`<strong>${esc(o.from)}</strong> sent you your interview schedule for <strong>${esc(o.day)}</strong>. Times are in ${esc(o.timezone)}.`)}
${o.note ? callout(esc(o.note).replace(/\n/g, "<br>")) : ""}
${table}`;
  return {
    subject: `Your interviews for ${o.day} (${o.rows.length})`,
    html: layout({ preheader: `${o.rows.length} interview${o.rows.length === 1 ? "" : "s"} on ${o.day}.`, eyebrow: "Message", title: `Your interviews for ${o.day}`, body, cta: { label: "Open My Schedule", href: o.url } }),
    text: `Hi ${o.name},\n\n${o.from} sent you your interviews for ${o.day} (${o.timezone}).${o.note ? `\n\n${o.note}` : ""}\n\n${o.rows.map((r) => `- ${r.time} · ${r.profile} · ${r.company} (${r.role})`).join("\n") || "No interviews scheduled."}\n\n${o.url}`,
  };
}

/** To the caller shortly before an interview (lead time set on My Page). */
export function interviewReminderEmail(o: { name: string; minutes: number; d: InterviewDetails; url: string }): Email {
  const lead = o.minutes >= 60 && o.minutes % 60 === 0 ? `${o.minutes / 60} hour${o.minutes === 60 ? "" : "s"}` : `${o.minutes} minutes`;
  const body = `${p(`Hi ${esc(o.name)},`)}
${callout(`Your interview for <strong>${esc(o.d.profile)}</strong> starts in about <strong>${lead}</strong>: ${esc(o.d.scheduled ?? "")}.`, "green")}
${detailsTable(o.d)}`;
  return {
    subject: `Starting in ${lead}: interview for ${o.d.profile}`,
    html: layout({ preheader: `Interview for ${o.d.profile} at ${o.d.scheduled}.`, eyebrow: "Reminder", title: `Interview in ${lead}`, body, cta: { label: "Open My Schedule", href: o.url } }),
    text: `Hi ${o.name},\n\nYour interview for ${o.d.profile} starts in about ${lead}.\n\n${textDetails(o.d)}\n\n${o.url}`,
  };
}

/** To the responsible caller when the request is cancelled. */
export function interviewCancelledEmail(o: { name: string; by: string; reason: string; d: InterviewDetails; url: string }): Email {
  const body = `${p(`Hi ${esc(o.name)},`)}
${p(`<strong>${esc(o.by)}</strong> cancelled this interview request. No further action is needed.`)}
${o.reason ? callout(`<strong>Reason:</strong> ${esc(o.reason)}`) : ""}
${detailsTable(o.d)}`;
  return {
    subject: `Interview cancelled: ${title(o.d)}`,
    html: layout({ preheader: `${o.by} cancelled the interview for ${o.d.profile}.`, eyebrow: "Cancelled", title: `Interview request cancelled`, body, cta: { label: "Open Interview Requests", href: o.url } }),
    text: `Hi ${o.name},\n\n${o.by} cancelled this interview request.${o.reason ? `\nReason: ${o.reason}` : ""}\n\n${textDetails(o.d)}\n\n${o.url}`,
  };
}

export const OUTCOME_LABEL: Record<string, string> = {
  passed: "Passed: moving to the next step",
  failed: "Not moving forward",
  waiting: "Waiting for the company's decision",
  no_show: "Did not take place (no-show)",
};

/** To the bidder, the profile's users and admins when the caller reports the result. */
export function interviewReportEmail(o: {
  name: string;
  d: InterviewDetails;
  outcome: string;
  recordingUrl: string;
  summary: string;
  interviewerName?: string;
  interviewerCallerId?: string;
  url: string;
}): Email {
  const who = [o.interviewerName && `<strong>Interviewer:</strong> ${esc(o.interviewerName)}`, o.interviewerCallerId && `<strong>Caller ID:</strong> ${esc(o.interviewerCallerId)}`]
    .filter(Boolean)
    .join(" · ");
  const tone = o.outcome === "passed" ? "green" : o.outcome === "failed" || o.outcome === "no_show" ? "rose" : "amber";
  const rec = o.recordingUrl
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6"><a href="${esc(o.recordingUrl)}" target="_blank" style="color:${C.brand};font-weight:600">&#9654; Watch the recording</a></p>`
    : "";
  const body = `${p(`Hi ${esc(o.name)},`)}
${p(`<strong>${esc(o.d.caller ?? "The caller")}</strong> reported the result of the step ${o.d.step} interview for <strong>${esc(o.d.profile)}</strong>.`)}
${callout(`<strong>${esc(OUTCOME_LABEL[o.outcome] ?? o.outcome)}</strong>${who ? `<br>${who}` : ""}${o.summary ? `<br><strong>Feedback:</strong> ${esc(o.summary).replace(/\n/g, "<br>")}` : ""}`, tone)}
${rec}
${detailsTable(o.d)}`;
  return {
    subject: `Interview result: ${title(o.d)} · ${OUTCOME_LABEL[o.outcome] ?? o.outcome}`,
    html: layout({ preheader: `${o.d.caller} reported: ${OUTCOME_LABEL[o.outcome]}.`, eyebrow: "Interview result", title: `Step ${o.d.step} result: ${o.d.company || o.d.profile}`, body, cta: { label: "View interview", href: o.url } }),
    text: `Hi ${o.name},\n\n${o.d.caller} reported: ${OUTCOME_LABEL[o.outcome]}\n${o.interviewerName ? `Interviewer: ${o.interviewerName}${o.interviewerCallerId ? ` (${o.interviewerCallerId})` : ""}\n` : ""}Feedback: ${o.summary}\nRecording: ${o.recordingUrl || "-"}\n\n${textDetails(o.d)}\n\n${o.url}`,
  };
}

/** To the caller when an interview they conducted has no result yet. */
export function interviewReportReminderEmail(o: { name: string; d: InterviewDetails; url: string }): Email {
  const body = `${p(`Hi ${esc(o.name)},`)}
${callout(`Your interview for <strong>${esc(o.d.profile)}</strong> (${esc(o.d.scheduled ?? "")}) has ended. Please report the result, including the <strong>URL of the recorded video</strong>.`)}
${detailsTable(o.d)}`;
  return {
    subject: `Please report the result: ${title(o.d)}`,
    html: layout({ preheader: `Report the result and recording for ${o.d.profile}.`, eyebrow: "Report needed", title: `How did the interview go?`, body, cta: { label: "Report result", href: o.url } }),
    text: `Hi ${o.name},\n\nPlease report the result of the interview for ${o.d.profile} (${o.d.scheduled}), including the recording URL.\n\n${textDetails(o.d)}\n\n${o.url}`,
  };
}
