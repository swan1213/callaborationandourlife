// @ts-nocheck -- dev-only data script; loose typing keeps the fixtures short.
// Fills a LOCAL demo database with fictional people, profiles, applications and interviews for the Help screenshots.
// Usage: see scripts/help/README.md. Refuses to run unless MONGODB_URI is localhost and MONGODB_DB contains "demo".
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../src/lib/models/User";
import { Profile } from "../../src/lib/models/Profile";
import { Application } from "../../src/lib/models/Application";
import { InterviewRequest } from "../../src/lib/models/InterviewRequest";
import { Feedback } from "../../src/lib/models/Feedback";
import { Message, MessageRead } from "../../src/lib/models/Message";
import { Notice } from "../../src/lib/models/Notice";
import { ApiKey } from "../../src/lib/models/ApiKey";
import { AccessToken } from "../../src/lib/models/AccessToken";
import { ActivityLog } from "../../src/lib/models/ActivityLog";
import { Settings } from "../../src/lib/models/Settings";
import { InterviewSession } from "../../src/lib/models/InterviewSession";
import { WorkSession } from "../../src/lib/models/WorkSession";
import { encrypt } from "../../src/lib/crypto";
import { companyKey } from "../../src/lib/company";
import type { ResumeContent } from "../../src/lib/generate";

const { MONGODB_URI = "", MONGODB_DB = "" } = process.env;
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(MONGODB_URI) || !MONGODB_DB.includes("demo")) {
  console.error("Refusing to seed: MONGODB_URI must be a local server and MONGODB_DB must contain 'demo'.");
  process.exit(1);
}

const DEMO_PASSWORD = "Demo-pass-2026!";
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);
const at = (ms: number) => new Date(now + ms);
/** Today at hh:mm New York time (EDT, UTC-4), shifted by `days`. */
const nyAt = (days: number, hh: number, mm = 0) => {
  const d = new Date(now);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh + 4, mm);
  return new Date(base + days * DAY);
};
const roleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pick = <T>(xs: T[], i: number) => xs[i % xs.length];

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
  await mongoose.connection.db!.dropDatabase();

  /* ------------------------------------------------------------ settings & keys */
  await Settings.create({ key: "global", interviewSweepAt: new Date("2099-01-01"), myPageNotice: "Welcome to TailorBid! Remember to attach the confirmation screenshot before submitting each application." });
  const key = await ApiKey.create({
    label: "Main OpenAI key",
    keyEnc: encrypt("sk-demo-0000000000000000000000000000"),
    keyMask: "sk-demo…0000",
    model: "gpt-4o-mini",
    isDefault: true,
    monthlyTokenLimit: 20_000_000,
    lastUsedAt: ago(2 * HOUR),
  });
  await ApiKey.create({ label: "Backup key", keyEnc: encrypt("sk-demo-1111111111111111111111111111"), keyMask: "sk-demo…1111", model: "gpt-4.1-mini", inputPricePerM: 0.4, outputPricePerM: 1.6 });

  /* ------------------------------------------------------------ profiles */
  const PROFILES = [
    { label: "Daniel Park", first: "Daniel", last: "Park", title: "Senior Software Engineer", city: "Austin", state: "TX", zip: "78701", email: "daniel.park@example.com", phone: "(512) 555-0142", design: "ats" },
    { label: "Sophia Nguyen", first: "Sophia", last: "Nguyen", title: "Senior Backend Engineer", city: "Seattle", state: "WA", zip: "98101", email: "sophia.nguyen@example.com", phone: "(206) 555-0178", design: "modern" },
    { label: "Emma Johnson", first: "Emma", last: "Johnson", title: "Full Stack Engineer", city: "Denver", state: "CO", zip: "80202", email: "emma.johnson@example.com", phone: "(303) 555-0119", design: "classic" },
  ] as const;
  const profiles = [];
  for (const [i, p] of PROFILES.entries()) {
    profiles.push(
      await Profile.create({
        label: p.label,
        firstName: p.first,
        lastName: p.last,
        fullName: `${p.first} ${p.last}`,
        professionalTitle: p.title,
        email: p.email,
        phone: p.phone,
        linkedin: `https://www.linkedin.com/in/${p.first.toLowerCase()}-${p.last.toLowerCase()}-demo`,
        github: `https://github.com/${p.first.toLowerCase()}${p.last.toLowerCase()}-demo`,
        location: `${p.city}, ${p.state}`,
        street: `${120 + i * 37} Main Street`,
        street2: "Apt 4B",
        city: p.city,
        state: p.state,
        zipcode: p.zip,
        country: "United States",
        timezone: "America/Chicago",
        currentCompany: pick(["Northwind Labs", "Bluebird Systems", "Contoso Cloud"], i),
        dateOfBirth: `199${i + 1}-0${i + 3}-1${i}`,
        gender: pick(["Male", "Female", "Female"], i),
        race: pick(["Asian", "Asian", "White"], i),
        visaStatus: "U.S. Citizen",
        veteranStatus: "I am not a protected veteran",
        disabilityStatus: "No, I do not have a disability",
        salary: pick(["165,000", "158,000", "145,000"], i),
        availability: "2 weeks notice",
        yearsExperience: pick(["9", "8", "6"], i),
        englishLevel: "Native",
        workAuthorizedUS: "Yes",
        needsSponsorship: "No",
        workSetup: ["Remote", "Hybrid"],
        willingToRelocate: "Yes",
        summary: `${p.title} with a track record of shipping reliable, high-traffic systems and mentoring engineers.`,
        skills: ["TypeScript", "Node.js", "React", "Go", "PostgreSQL", "AWS", "Kubernetes", "Kafka"],
        experience: [
          { company: pick(["Northwind Labs", "Bluebird Systems", "Contoso Cloud"], i), title: p.title, location: `${p.city}, ${p.state}`, startDate: "2021-03", current: true, description: "Led the payments platform team; cut checkout latency by 40%." },
          { company: pick(["Fabrikam", "Tailspin Toys", "Adventure Works"], i), title: "Software Engineer", location: "Remote", startDate: "2017-06", endDate: "2021-02", description: "Built internal APIs and data pipelines serving 2M users." },
        ],
        education: [{ university: pick(["University of Texas at Austin", "University of Washington", "University of Colorado Boulder"], i), degree: "B.S.", field: "Computer Science", startDate: "2009-09", endDate: "2013-05" }],
        apiKey: key._id,
        monthlyQuota: pick([300, 250, 0], i),
        resumeDesign: p.design,
        coverLetterDesign: p.design,
      })
    );
  }
  const [daniel, sophia, emma] = profiles;

  /* ------------------------------------------------------------ people */
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const person = (name: string, email: string, role: string, extra: Record<string, unknown> = {}) =>
    User.create({ name, email, passwordHash: hash, role, status: "approved", lastLoginAt: ago(3 * HOUR), lastSeenAt: ago(5 * 60_000), lastActiveAt: ago(5 * 60_000), ...extra });
  const admin = await person("Alex Morgan", "alex@demo.tailorbid.test", "admin", { avatar: "preset:fox", feePerApplication: 0, timezone: "America/New_York" });
  const manager = await person("Jordan Lee", "jordan@demo.tailorbid.test", "user", { avatar: "preset:koala", managedProfiles: [daniel._id, sophia._id, emma._id], feePerApplication: 0 });
  const casey = await person("Casey Brooks", "casey@demo.tailorbid.test", "bidder", { avatar: "preset:lion", assignedProfiles: [daniel._id, sophia._id, emma._id] });
  const taylor = await person("Taylor Kim", "taylor@demo.tailorbid.test", "bidder", { avatar: "preset:panda", assignedProfiles: [daniel._id, sophia._id] });
  const riley = await person("Riley Chen", "riley@demo.tailorbid.test", "bidder", { assignedProfiles: [emma._id], trusted: true });
  const morgan = await person("Morgan Reyes", "morgan@demo.tailorbid.test", "caller", {
    avatar: "preset:fox",
    assignedProfiles: [daniel._id, sophia._id, emma._id],
    timezone: "America/New_York",
    callerSettings: { timezone: "America/New_York", reminderMinutes: 60, digestHour: 18 },
  });
  const sam = await person("Sam Patel", "sam@demo.tailorbid.test", "caller", { assignedProfiles: [daniel._id, emma._id], callerSettings: { timezone: "America/Chicago", reminderMinutes: 30, digestHour: 19 } });
  await person("Avery Collins", "avery@demo.tailorbid.test", "bidder", { status: "pending", lastLoginAt: undefined });
  await person("Quinn Foster", "quinn@demo.tailorbid.test", "caller", { status: "pending", lastLoginAt: undefined });
  await person("Drew Walker", "drew@demo.tailorbid.test", "bidder", { status: "suspended", assignedProfiles: [emma._id] });

  /* ------------------------------------------------------------ applications */
  const JOBS = [
    ["Shopify", "Senior Developer, Checkout", "Remote, US"],
    ["Stripe", "Software Engineer, Payments Infrastructure", "Seattle, WA"],
    ["Rippling", "Senior Software Engineer, Backend", "San Francisco, CA"],
    ["Datadog", "Software Engineer, Distributed Systems", "New York, NY"],
    ["Figma", "Frontend Engineer, Editor", "Remote, US"],
    ["Snowflake", "Senior Software Engineer, Backend - Data Cloud", "Bellevue, WA"],
    ["Cloudflare", "Systems Engineer, Platform", "Austin, TX"],
    ["Notion", "Software Engineer, Platform", "Remote, US"],
    ["Airtable", "Senior Backend Engineer, Trust", "Remote, US"],
    ["Plaid", "Software Engineer, Data Platform", "New York, NY"],
    ["Asana", "Senior Software Engineer, API", "Remote, US"],
    ["Twilio", "Software Engineer, Messaging", "Denver, CO"],
    ["HubSpot", "Senior Full Stack Engineer", "Boston, MA"],
    ["Okta", "Senior Software Engineer, Identity", "Remote, US"],
    ["GitLab", "Backend Engineer, Verify", "Remote, US"],
    ["Discord", "Software Engineer, Infrastructure", "San Francisco, CA"],
    ["Coinbase", "Senior Software Engineer, Platform", "Remote, US"],
    ["Instacart", "Software Engineer, Fulfillment", "Remote, US"],
    ["Zapier", "Senior Product Engineer", "Remote, US"],
    ["Gusto", "Software Engineer, Payroll", "Denver, CO"],
    ["Brex", "Senior Backend Engineer", "Remote, US"],
    ["Ramp", "Software Engineer, Core Platform", "New York, NY"],
    ["Vercel", "Software Engineer, Edge Runtime", "Remote, US"],
    ["Retool", "Full Stack Engineer", "San Francisco, CA"],
  ] as const;

  const resumeFor = (p: (typeof profiles)[number], company: string, title: string): ResumeContent => ({
    fullName: p.fullName,
    headline: title,
    titleLine: p.professionalTitle,
    contact: { email: p.email, phone: p.phone, linkedin: p.linkedin, location: p.location, website: "", github: p.github },
    summary: `${p.professionalTitle} with ${p.yearsExperience}+ years building reliable, high-traffic products. Excited to bring payments, platform and API experience to ${company}'s ${title} team.`,
    skills: [
      { category: "Languages", items: ["TypeScript", "Go", "Python", "SQL"] },
      { category: "Backend", items: ["Node.js", "gRPC", "REST APIs", "Kafka", "Redis"] },
      { category: "Cloud & Data", items: ["AWS", "Kubernetes", "Terraform", "PostgreSQL"] },
    ],
    experience: p.experience.map((e) => ({
      company: e.company,
      title: e.title ?? "",
      location: e.location ?? "",
      startDate: e.startDate ?? "",
      endDate: e.current ? "Present" : (e.endDate ?? ""),
      bullets: [
        "Designed and shipped a service handling 12K requests per second with 99.99% availability.",
        "Cut p95 latency by 40% by redesigning caching and database access patterns.",
        "Mentored four engineers and led design reviews across three teams.",
      ],
    })),
    education: p.education.map((e) => ({ university: e.university, degree: e.degree ?? "", field: e.field ?? "", startDate: e.startDate ?? "", endDate: e.endDate ?? "" })),
    certifications: [],
  });
  const coverFor = (p: (typeof profiles)[number], company: string, title: string) =>
    `Dear Hiring Team,\n\nI am excited to apply for the ${title} role at ${company}. Over the past ${p.yearsExperience} years I have built and scaled backend systems that handle millions of users, and I would love to bring that experience to your team.\n\nAt ${p.experience[0].company} I led the payments platform team and cut checkout latency by 40%. I enjoy turning ambiguous problems into simple, dependable services.\n\nThank you for your time and consideration.\n\nSincerely,\n${p.fullName}`;
  const jdFor = (company: string, title: string, loc: string) =>
    `${title} at ${company} (${loc})\n\nAbout the role\nYou will design, build and operate services used by millions of customers.\n\nWhat you'll do\n- Own critical backend services end to end\n- Partner with product and design on new features\n- Improve reliability, performance and developer experience\n\nWhat we're looking for\n- 5+ years building production software\n- Experience with TypeScript, Go or Java\n- Experience with cloud infrastructure (AWS or GCP)`;

  const SHOT = "/help-demo/confirmation.png";
  const bidders = [casey, taylor, riley];
  const apps = [];
  for (const [i, [company, jobTitle, jobLocation]] of JOBS.entries()) {
    const p = i % 5 === 4 ? emma : pick([daniel, sophia, daniel, sophia], i);
    const bidder = p === emma ? pick([casey, riley], i) : i % 6 === 5 ? manager : pick([casey, taylor], i);
    // The newest dozen within two days, the rest spread over the last eight weeks (for the charts).
    const created = ago(i === 12 ? 5 * HOUR : i < 12 ? i * 4 * HOUR + 40 * 60_000 : 2 * DAY + (i - 11) * 4.3 * DAY);
    // A mix: newest are generated, a few not-generated, most older ones submitted, some paid.
    // Casey (the demo bidder) gets one unknown-company row (12) and one not-generated row (16).
    const status = i === 3 || i === 16 ? "not_generated" : i < 3 || i === 8 || i === 12 ? "generated" : "submitted";
    const submitted = status === "submitted";
    const paid = submitted && i >= 16;
    const unknownCompany = i === 12;
    apps.push(
      await Application.create({
        user: bidder._id,
        profile: p._id,
        profileLabel: p.label,
        companyKey: unknownCompany ? "" : companyKey(company),
        jobUrl: `https://boards.greenhouse.io/${company.toLowerCase()}/jobs/${4100000 + i * 7919}`,
        company: unknownCompany ? "" : company,
        jobTitle,
        jobLocation,
        jobDescription: status === "not_generated" ? "" : jdFor(company, jobTitle, jobLocation),
        resume: status === "not_generated" ? null : resumeFor(p, company, jobTitle),
        coverLetter: status === "not_generated" ? "" : coverFor(p, company, jobTitle),
        resumeDesign: p.resumeDesign,
        coverLetterDesign: p.coverLetterDesign,
        status,
        generationError: status === "not_generated" ? "Job description not readable" : "",
        submittedAt: submitted ? new Date(created.getTime() + 2 * HOUR) : undefined,
        screenshots: submitted && i % 4 !== 1 ? [{ url: SHOT, publicId: `demo/${i}` }] : [],
        usage: status === "not_generated" ? undefined : { model: "gpt-4o-mini", apiKey: key._id, promptTokens: 6200 + i * 13, completionTokens: 2400 + i * 7, costUsd: 0.0024 },
        fee: submitted ? 0.07 : 0,
        paid,
        paidAt: paid ? ago(DAY) : undefined,
        paidBy: paid ? admin._id : null,
        createdAt: created,
        updatedAt: created,
      })
    );
  }
  await Application.collection.updateMany({}, [{ $set: { updatedAt: "$createdAt" } }]);

  /* ------------------------------------------------------------ interviews */
  type IV = Partial<Parameters<typeof InterviewRequest.create>[0]> & Record<string, unknown>;
  const iv = async (app: (typeof apps)[number], o: IV) => {
    const p = profiles.find((x) => String(x._id) === String(app.profile))!;
    const company = app.company || "Notion";
    const start = (o.scheduledAt as Date) ?? (o.windowStart as Date) ?? at(DAY);
    return InterviewRequest.create({
      profile: p._id,
      profileLabel: p.label,
      requestedBy: app.user,
      application: app._id,
      company,
      jobTitle: app.jobTitle,
      companyKey: companyKey(company),
      roleKey: roleKey(app.jobTitle),
      mode: "exact",
      windowStart: start,
      timezone: "America/New_York",
      durationMinutes: 45,
      scheduleBy: at(3 * HOUR),
      screenshots: [{ url: "/help-demo/invite-email.png", publicId: "demo/invite" }],
      notes: "Recruiter screen over Zoom; link is in the invitation email.",
      events: [{ at: ago(DAY), byName: "Casey Brooks", action: "requested" }],
      ...o,
    });
  };
  const a = (company: string) => apps.find((x) => x.company === company)!;
  const done = (outcome: string, iname: string, summary: string) => ({
    status: "completed",
    report: { outcome, recordingUrl: "https://drive.example.com/recordings/demo", summary, interviewerName: iname, interviewerCallerId: "+1 (415) 555-0134", reportedAt: ago(2 * DAY), reportedByName: "Morgan Reyes", feedbackUpdatedAt: ago(2 * DAY) },
  });
  const step1 = await iv(a("Shopify"), { step: 1, caller: morgan._id, requestedCaller: morgan._id, scheduledAt: nyAt(-6, 10), acceptedAt: ago(7 * DAY), ...done("passed", "Priya Shah", "Went well: system design on checkout flows, asked about idempotency. Next: technical round."), callerNote: "Zoom: https://zoom.example.com/j/555" });
  (step1 as unknown as { report: Record<string, unknown> }).report.reportedBy = morgan._id;
  await step1.save();
  await iv(a("Shopify"), { step: 2, previous: step1._id, lockedCaller: true, caller: morgan._id, requestedCaller: morgan._id, status: "scheduled", scheduledAt: nyAt(0, 14, 30), acceptedAt: ago(DAY), callerNote: "Google Meet: meet.example.com/abc-defg", comments: [{ at: ago(5 * HOUR), by: admin._id, byName: "Alex Morgan", role: "admin", text: "Panel of two; expect a live coding exercise." }] });
  await iv(a("Stripe"), { step: 1, caller: morgan._id, requestedCaller: morgan._id, status: "pending", windowStart: nyAt(1, 11), scheduleBy: at(2 * HOUR), requestedBy: taylor._id });
  await iv(a("Rippling"), { step: 1, caller: null, requestedCaller: sam._id, status: "open", windowStart: nyAt(2, 13), mode: "range", windowEnd: nyAt(2, 17), transfers: [{ from: sam._id, fromName: "Sam Patel", reason: "Out sick that afternoon", at: ago(4 * HOUR) }] });
  await iv(a("Snowflake"), { step: 1, caller: sam._id, requestedCaller: sam._id, status: "scheduled", scheduledAt: nyAt(1, 15), acceptedAt: ago(10 * HOUR), callerNote: "Phone screen: they will call the profile's number." });
  await iv(a("Cloudflare"), { step: 1, caller: morgan._id, requestedCaller: morgan._id, status: "scheduled", scheduledAt: nyAt(3, 9, 30), acceptedAt: ago(20 * HOUR) });
  await iv(a("Figma"), { step: 1, caller: morgan._id, requestedCaller: morgan._id, status: "scheduled", scheduledAt: nyAt(-1, 16), acceptedAt: ago(3 * DAY) });
  await iv(a("Airtable"), { step: 1, caller: sam._id, requestedCaller: sam._id, scheduledAt: nyAt(-3, 12), acceptedAt: ago(4 * DAY), ...done("waiting", "Marcus Lee", "Behavioral round; they will reply within a week.") });
  await iv(a("Plaid"), { step: 1, caller: morgan._id, requestedCaller: morgan._id, scheduledAt: nyAt(-4, 11), acceptedAt: ago(5 * DAY), ...done("failed", "Hannah Ortiz", "Struggled with the SQL question. Practice window functions.") });
  await iv(a("Asana"), { step: 1, caller: morgan._id, requestedCaller: morgan._id, status: "scheduled", scheduledAt: nyAt(5, 10), acceptedAt: ago(2 * HOUR) });
  await iv(a("Twilio"), { step: 1, caller: sam._id, requestedCaller: sam._id, status: "scheduled", scheduledAt: nyAt(8, 14), acceptedAt: ago(2 * HOUR) });

  /* ------------------------------------------------------------ feedback, messages, notices */
  await Feedback.create([
    { user: casey._id, userName: "Casey Brooks", userEmail: casey.email, role: "bidder", category: "idea", subject: "Bulk submit for trusted bidders", message: "It would save time to submit several applications at once.", status: "in_progress", seenAt: ago(DAY), replies: [{ by: admin._id, byName: "Alex Morgan", message: "Good idea, we're looking into it.", at: ago(20 * HOUR) }], createdAt: ago(2 * DAY) },
    { user: morgan._id, userName: "Morgan Reyes", userEmail: morgan.email, role: "caller", category: "bug", subject: "Calendar shows the wrong week on Sunday", message: "On Sundays the week view jumps to the next week.", status: "new", screenshots: [{ url: SHOT, publicId: "demo/fb" }], createdAt: ago(5 * HOUR) },
    { user: manager._id, userName: "Jordan Lee", userEmail: manager.email, role: "user", category: "question", subject: "Can I export applications per profile?", message: "Looking for a CSV per profile for the monthly review.", status: "resolved", seenAt: ago(4 * DAY), replies: [{ by: admin._id, byName: "Alex Morgan", message: "Use the Profile filter, then Download all documents.", at: ago(4 * DAY) }], createdAt: ago(5 * DAY) },
  ]);
  const everyone = [admin, manager, casey, taylor, riley, morgan, sam];
  const msg1 = await Message.create({ title: "New cooldown: 30 days per company", body: "From today a profile can apply to the same company once every 30 days.", audience: { roles: ["bidder", "user"], users: [] }, recipients: [manager._id, casey._id, taylor._id, riley._id], email: true, emailedCount: 4, sender: admin._id, senderName: "Alex Morgan", createdAt: ago(3 * DAY) });
  const msg2 = await Message.create({ title: "Interview reporting reminder", body: "Please report every interview result within 2 hours, including the recording link.", audience: { roles: ["caller"], users: [] }, recipients: [morgan._id, sam._id], sender: admin._id, senderName: "Alex Morgan", createdAt: ago(DAY) });
  await MessageRead.create([{ message: msg1._id, user: casey._id, at: ago(2 * DAY) }, { message: msg1._id, user: manager._id, at: ago(2 * DAY) }, { message: msg2._id, user: morgan._id, at: ago(20 * HOUR) }]);
  for (const u of everyone) {
    await Notice.create([
      { user: u._id, kind: "interview_scheduled", tone: "success", title: "Interview scheduled: Shopify · Senior Developer, Checkout", body: "Morgan Reyes scheduled step 2 for today at 2:30 PM.", url: "/interviews", createdAt: ago(HOUR) },
      { user: u._id, kind: "interview_reported", tone: "info", title: "Result reported: Airtable · Senior Backend Engineer, Trust", body: "Waiting for the company's reply.", url: "/interviews", readAt: ago(DAY), createdAt: ago(2 * DAY) },
    ]);
  }

  /* ------------------------------------------------------------ API access & logs */
  await AccessToken.create([
    { name: "Reporting dashboard", prefix: "tbk_7Fq2", hash: "demo-hash-1", createdBy: admin._id, createdByName: "Alex Morgan", lastUsedAt: ago(30 * 60_000), lastUsedIp: "203.0.113.24", useCount: 1284 },
    { name: "Interview sync", prefix: "tbk_Q9m4", hash: "demo-hash-2", createdBy: admin._id, createdByName: "Alex Morgan", expiresAt: at(60 * DAY), lastUsedAt: ago(DAY), lastUsedIp: "198.51.100.7", useCount: 87 },
  ]);
  const LOGS: [string, string, string, string, number, (typeof everyone)[number]][] = [
    ["info", "auth", "POST /api/auth/login", "Signed in", 200, casey],
    ["info", "applications", "POST /api/applications/generate", "Generated an application: Shopify · Senior Developer, Checkout", 200, casey],
    ["info", "applications", "POST /api/applications/:id/submit", "Submitted an application: Stripe · Software Engineer, Payments Infrastructure", 200, taylor],
    ["info", "downloads", "GET /api/applications/:id/download", "Downloaded the resume PDF", 200, casey],
    ["info", "interviews", "PATCH /api/interviews/:id · accept", "Scheduled an interview: Shopify (step 2)", 200, morgan],
    ["warn", "applications", "POST /api/applications/generate", "Blocked: same company within the 30-day cooldown", 409, taylor],
    ["info", "users", "PATCH /api/admin/users/:id", "Updated Riley Chen: profiles", 200, admin],
    ["info", "email", "email · interview-scheduled", "Email sent to 3 recipients", 200, admin],
    ["error", "server", "POST /api/applications/generate", "OpenAI request timed out", 500, casey],
    ["info", "auth", "POST /api/auth/login", "Signed in", 200, morgan],
  ];
  await ActivityLog.create(
    LOGS.map(([level, category, action, summary, status, u], i) => ({
      level,
      category,
      action,
      summary,
      actor: u._id,
      actorName: u.name,
      actorEmail: u.email,
      actorRole: u.role,
      method: action.split(" ")[0].length <= 6 ? action.split(" ")[0] : "",
      path: action.split(" ")[1] ?? "",
      status,
      durationMs: 120 + i * 37,
      ip: "203.0.113." + (10 + i),
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0",
      createdAt: ago(i * 47 * 60_000 + 5 * 60_000),
    }))
  );

  /* ------------------------------------------------------------ Interview Assistant recordings & work time */
  const recorded = async (who: (typeof everyone)[number], company: string, stage: string, daysAgo: number, reviewed: boolean) => {
    const app = a(company);
    const p = profiles.find((x) => String(x._id) === String(app.profile))!;
    const start = nyAt(-daysAgo, 10).getTime();
    const lines = [
      "Thanks for joining today. Could you start by walking me through your background?",
      "Sure. I'm a senior engineer focused on payments and platform work for the last few years.",
      "Great. Tell me about a time you improved the performance of a critical service.",
      "At my current company checkout latency was hurting conversion, so I redesigned our caching layer.",
      "How did you measure the impact?",
      "We tracked p95 latency and conversion; latency dropped by 40% and conversion rose two points.",
      "How do you handle disagreements on technical direction within the team?",
      "I write a short design doc with the options and trade-offs, then we decide together in review.",
      "What questions do you have for us?",
    ];
    await InterviewSession.create({
      user: who._id,
      userName: who.name,
      clientId: `demo-${company}-${stage}`,
      profile: p._id,
      profileLabel: p.label,
      company,
      role: app.jobTitle,
      stage,
      startedAt: new Date(start),
      endedAt: new Date(start + 41 * 60_000),
      captions: lines.map((text, i) => ({ t: start + i * 75_000, text })),
      answers: [
        { t: start + 150_000, question: "Tell me about a time you improved the performance of a critical service.", source: "live", answer: "[smile] At Northwind Labs our checkout was slow at peak traffic.\n\nI profiled the hot paths, moved session reads to Redis and batched database writes. [pause] p95 latency dropped by 40%.", keyPoints: "• Problem: slow checkout\n• Action: Redis cache, batched writes\n• Result: -40% p95 latency", mood: "Interested" },
        { t: start + 450_000, question: "How do you handle disagreements on technical direction?", source: "prepared", answer: "I put the options in a short design doc with trade-offs, ask for input early, and we decide in review.", keyPoints: "• Write it down\n• Invite input\n• Decide together", mood: "Neutral" },
      ],
      report: reviewed
        ? {
            summary: "A strong recruiter screen: clear examples with measurable results. Keep answers a little shorter.",
            wentWell: ["Concrete numbers for the latency project", "Calm, structured answer on disagreements"],
            toImprove: [{ question: "Walk me through your background", tip: "Lead with the role you're applying for, then two highlights; aim for 60 seconds." }],
            thankYouEmail: "Hi Priya, thank you for your time today...",
            nextStagePrep: ["Review system design for payments", "Prepare a question about the team's on-call"],
            generatedAt: new Date(start + 50 * 60_000),
          }
        : null,
    });
  };
  await recorded(morgan, "Shopify", "recruiter", 6, true);
  await recorded(morgan, "Plaid", "technical", 4, true);
  await recorded(sam, "Airtable", "hr", 3, false);
  await recorded(morgan, "Figma", "technical", 1, false);

  const workers = [admin, manager, casey, taylor, riley, morgan, sam];
  const stretches = [];
  for (let d = 0; d < 10; d++)
    for (const [i, u] of workers.entries()) {
      if ((d + i) % 6 === 5) continue;
      const begin = nyAt(-d, 8 + (i % 3), (i * 13) % 60).getTime();
      if (begin > now) continue;
      const hours = 2 + ((d * 7 + i * 5) % 5);
      stretches.push({ user: u._id, start: new Date(begin), end: new Date(Math.min(begin + hours * HOUR, now)) });
      stretches.push({ user: u._id, start: new Date(begin + (hours + 1) * HOUR), end: new Date(Math.min(begin + (hours + 3) * HOUR, now)) });
    }
  await WorkSession.create(stretches.filter((s) => s.end > s.start));

  console.log(`Demo data ready in ${MONGODB_DB}: ${apps.length} applications, password "${DEMO_PASSWORD}".`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
