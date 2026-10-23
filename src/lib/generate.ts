import { HttpError } from "./auth";
import { samplingFor, type ResolvedOpenAI } from "./openaiKeys";
import type { ProfileFields } from "./models/Profile";
import { DEFAULT_RESUME_PROMPT } from "./resumePrompt";
import { RESUME_HEADLINE } from "./headline";
import { scoreCoverLetter, scoreResume } from "./matchScore";

export type ResumeExperience = {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
  /** Older records: internships were written as a short description instead of bullets. */
  description?: string;
};

export type ResumeProject = { name: string; description?: string; techStack?: string[]; bullets: string[] };

export type ResumeContent = {
  fullName: string;
  headline: string;
  /** Profile's professional title at generation, shown under the name (lib/headline.ts resumeHeadline). */
  titleLine?: string;
  contact: { email: string; phone: string; linkedin: string; location: string; website: string; github?: string };
  /** One paragraph, plain text (no bold). */
  summary: string;
  skills: { category: string; items: string[] }[];
  experience: ResumeExperience[];
  projects?: ResumeProject[];
  education: { university: string; degree: string; field: string; startDate: string; endDate: string }[];
  /** Kept for older records; not rendered (the prompt forbids a Certifications section). */
  certifications: string[];
};

export type GenerationResult = {
  company: string;
  jobTitle: string;
  jobLocation: string;
  jobDescription: string;
  resume: ResumeContent;
  coverLetter: string;
  usage: { model: string; promptTokens: number; completionTokens: number };
  /** Keyword match (lib/matchScore.ts) before and after the ATS pass; absent when the pass is off. */
  ats?: { before: number; after: number; revised: boolean };
};

/* ------------------------------------------------------------------ dates */

function monthLabel(ym: string) {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  if (!y) return ym;
  if (!m) return String(y);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "May 2023 - Present" / "June 2020 - December 2022" (ASCII hyphen only). */
export function formatRange(start: string, end: string, current = false) {
  const s = monthLabel(start);
  const e = current || !end ? "Present" : monthLabel(end);
  return s ? `${s} - ${e}` : e === "Present" ? "" : e;
}

/* ------------------------------------------------------------- text rules */

const TECH_FIXES: [RegExp, string][] = [
  [/\bC\s*Plus\s*Plus\b/gi, "C++"],
  [/\bC\s*Sharp\b/gi, "C#"],
  [/\bF\s*Sharp\b/gi, "F#"],
  [/(^|[\s(,/])dot\s*net\b/gi, "$1.NET"],
  [/\bASP\.?\s*NET\b/gi, "ASP.NET"],
  [/\bnode\.?js\b/gi, "Node.js"],
  [/\bnext\.?js\b/gi, "Next.js"],
  [/\bvue\.?js\b/gi, "Vue.js"],
  [/\bjavascript\b/gi, "JavaScript"],
  [/\btypescript\b/gi, "TypeScript"],
  [/\bpostgres(ql)?\b/gi, "PostgreSQL"],
  [/\bmongo\s?db\b/gi, "MongoDB"],
  [/\bgraphql\b/gi, "GraphQL"],
  [/\bkubernetes\b/gi, "Kubernetes"],
];
const fixTech = (s: string) => TECH_FIXES.reduce((t, [re, rep]) => t.replace(re, rep), s);

/** Leftover AI-sounding words → plain ones (case kept for the first letter). */
const HUMAN_FIXES: [RegExp, string][] = [
  [/\bleverag(e|es|ed|ing)\b/gi, "us$1"],
  [/\butiliz(e|es|ed|ing)\b/gi, "us$1"],
  [/\butilization\b/gi, "usage"],
  [/\bspearheading\b/gi, "leading"],
  [/\bspearheads\b/gi, "leads"],
  [/\bspearhead(ed)?\b/gi, "led"],
  [/\bseamlessly\b/gi, "smoothly"],
  [/\bseamless\b/gi, "smooth"],
  [/\bcutting[- ]edge\b/gi, "modern"],
  [/\bstate[- ]of[- ]the[- ]art\b/gi, "modern"],
  [/\brobust\b/gi, "reliable"],
  [/\bfast[- ]paced\b/gi, "busy"],
  [/\bresults[- ]driven\b/gi, "hands-on"],
  [/\bproven track record of\b/gi, "history of"],
  [/\ba wide range of\b/gi, "many"],
  [/\bI am thrilled to\b/gi, "I'd like to"],
  [/\bI am excited to\b/gi, "I'd like to"],
  [/\bI am writing to express my interest in\b/gi, "I'm applying for"],
];
const keepCase = (from: string, to: string) => (to && /^[A-Z]/.test(from) ? to[0].toUpperCase() + to.slice(1) : to);
export const humanize = (s: string) =>
  HUMAN_FIXES.reduce((t, [re, rep]) => t.replace(re, (m: string, g1?: unknown) => keepCase(m, rep.replace("$1", typeof g1 === "string" ? g1 : ""))), s);
const ICONS = /[☀-➿\u{1F300}-\u{1FAFF}✅✔✓➤▶►⭐]/gu;

/** Resume text: no long dashes, icons, citations or links; optional **bold** kept only when allowed. */
function cleanResume(s: string, keepBold = false) {
  let t = s
    .replace(ICONS, "")
    .replace(/\s*[—―]\s*/g, ", ")
    .replace(/–/g, "-")
    .replace(/\[(\d+|source[^\]]*)\]|【[^】]*】/gi, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1") // markdown links → text
    .replace(/`/g, "");
  if (!keepBold) t = t.replace(/\*\*/g, "");
  return humanize(fixTech(t.replace(/[ \t]{2,}/g, " ").trim()));
}

/** Cover letter: plain text, no dashes of any kind, no bold. */
function cleanLetter(s: string) {
  return humanize(fixTech(
    s
      .replace(ICONS, "")
      .replace(/\*\*|__/g, "")
      .replace(/\s*[—―–]\s*/g, ", ")
      .replace(/\s+-\s+/g, ", ")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  ));
}

/**
 * Models sometimes separate letter paragraphs with single line breaks. Make every line its own paragraph,
 * except the sign-off ("Sincerely," + name stay together on consecutive lines).
 */
function letterParagraphBreaks(s: string) {
  const text = s.replace(/\r\n/g, "\n").trim();
  if (/\n\s*\n/.test(text) && text.split(/\n\s*\n/).length >= 3) return text;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^(sincerely|best regards|kind regards|regards|thank you),?$/i.test(lines[i]) && lines[i + 1]) {
      out.push(`${lines[i]}\n${lines[i + 1]}`);
      i++;
    } else out.push(lines[i]);
  }
  return out.join("\n\n");
}

const stripBullet = (s: string) => s.replace(/^\s*(?:[-*•·▪]|\d+[.)])\s+/, "");
const isBullet = (s: string) => /^\s*(?:[-*•·▪]|\d+[.)])\s+/.test(s);
const unbold = (s: string) => s.replace(/\*\*/g, "").trim();

/* ---------------------------------------------------- candidate profile */

/** The base resume passed as {{CANDIDATE_PROFILE}}. Facts here are authoritative. */
export function candidateProfileText(p: ProfileFields) {
  const lines: string[] = [];
  lines.push(`Name: ${p.fullName}`);
  const loc = p.location || [p.city, p.state].filter(Boolean).join(", ");
  if (loc) lines.push(`Location: ${loc}`);
  if (p.email) lines.push(`Email: ${p.email}`);
  if (p.phone) lines.push(`Phone: ${p.phone}`);
  if (p.linkedin) lines.push(`LinkedIn: ${p.linkedin}`);
  if (p.summary) lines.push("", "Summary:", p.summary);
  if (p.skills?.length) lines.push("", `Skills: ${p.skills.join(", ")}`);
  if (p.experience?.length) {
    lines.push("", "Experience (reverse chronological; keep these job titles, companies, locations and dates exactly):");
    for (const e of p.experience) {
      lines.push("", `Job title: ${e.title}`, `Company - location: ${e.company}${e.location ? ` - ${e.location}` : ""}`, `Dates: ${formatRange(e.startDate ?? "", e.endDate ?? "", !!e.current)}`);
      if (e.description) lines.push("Original responsibilities:", ...e.description.split("\n").map((l) => `• ${stripBullet(l)}`).filter((l) => l.length > 2));
    }
  }
  if (p.education?.length) {
    lines.push("", "Education:");
    for (const e of p.education) lines.push(`${e.university}${e.degree || e.field ? ` - ${[e.degree, e.field].filter(Boolean).join(", ")}` : ""}${e.startDate || e.endDate ? ` (${formatRange(e.startDate ?? "", e.endDate ?? "")})` : ""}`);
  }
  if (p.professionalTitle) lines.push("", `Professional title: ${p.professionalTitle}`);
  if (p.about?.trim()) lines.push("", "About this candidate (background and guidance from their manager):", p.about.trim());
  if (p.resumeReference?.trim())
    lines.push(
      "",
      "Reference resume (a previous resume: use its facts, section order and emphasis as a guide; the experience and education above win on titles, companies and dates):",
      p.resumeReference.trim()
    );
  return lines.join("\n");
}

/** Cover letter rules for prompts that have none (the default prompt is resume-only). */
const letterRules = (name: string) => `- 250 to 350 words, one page, first person, plain text: no bullets, bold, links or dashes of any kind.
- Start with "Dear Hiring Manager," with nothing above it.
- Opening: the exact company name, the exact position and one concrete reason this engineering work interests the
  candidate. Do not open with "I am writing to express", "I am thrilled to apply" or "As a passionate".
- Then the two or three most important engineering responsibilities in the job description, tied to the candidate's  strongest work, with real implementation detail.
- Then one specific example of how the candidate approaches engineering problems (root cause, architecture,
  reliability, testing or ownership).
- Close by tying that experience to the company's priorities, with a short, natural request to talk.
- Complement the resume rather than repeating its bullets. Never invent employers, metrics, credentials or claims about
  the company.
- End with "Sincerely," on its own line, then "${name}".`;

/**
 * The reply layout the parser depends on. Appended when a prompt doesn't ask for the COMPANY/ROLE lines and the cover
 * letter, so every prompt yields a company, a role, a headline and a cover letter.
 * Layout only: the content and writing rules (sections, bullet counts, letter style) stay with the prompt.
 */
const outputContract = (name: string) => `

# REQUIRED OUTPUT LAYOUT (set by the application so it can read your reply; it only changes how the reply is laid
# out, it overrides any instruction about delivering a file or leaving out the cover letter, and every content and
# writing rule above still applies)

This runs automatically: nobody can answer a question before the documents are written. Where the instructions say
to ask for missing experience first, do not ask; write the strongest truthful application from the evidence given (a
transferable-skills application where direct experience is missing) and never claim the missing experience.

Reply in plain text, not a file. At the very start of your reply, output exactly these three lines:
COMPANY: [Exact company name from the job description]
ROLE: [Exact job title from the job description]
HEADLINE: [The target professional headline shown under the candidate's name]

Then a blank line, then the resume content the instructions above ask for. Do not repeat the candidate's name or
contact details (the application adds the header). Start every section title on its own line with "# ", and keep
the words SUMMARY, SKILLS, EXPERIENCE, PROJECTS and EDUCATION in the titles of those sections (for example
"# PROFESSIONAL SUMMARY", "# TECHNICAL SKILLS"). In the skills section, write one line per category as
"Category Name: skill, skill, skill". In the experience section, write each job as a title line, a company line, a
"Location | Dates" line, then its bullets, each starting with "• ". In the projects section, write each project as its
name on its own line, then its lines, each starting with "• ".

Then output exactly these two lines:
---
COVER LETTER

Then a blank line, then the cover letter written as the instructions above describe, in plain text, starting at the
greeting (nothing above it). If the instructions say nothing about a cover letter, write one following these rules:
${letterRules(name)}`;

/** Adds the output layout unless the prompt already asks for the header lines and the cover letter section. */
export function withOutputContract(prompt: string, name: string) {
  const asksHeader = /^\s*COMPANY\s*:/m.test(prompt) && /^\s*ROLE\s*:/m.test(prompt);
  const asksLetter = /^\s*COVER LETTER\s*$/m.test(prompt);
  return asksHeader && asksLetter ? prompt : prompt + outputContract(name);
}

/** Placeholders with the job in them; a prompt using them gets the job inside the prompt instead of the user message. */
const JOB_PLACEHOLDERS = ["{{JOB_DESCRIPTION_CONTENT}}", "{{JOB_DESCRIPTION_LINK}}"];

export function fillPrompt(template: string, p: ProfileFields, job?: { text: string; url?: string }) {
  return template
    .split("{{CANDIDATE_PROFILE}}").join(candidateProfileText(p))
    .split("{{CANDIDATE_EMAIL}}").join(p.email || "")
    .split("{{SIGN_OFF_NAME}}").join(p.fullName)
    .split("{{ADDITIONAL_EXPERIENCE}}").join(p.about?.trim() || "None provided.")
    .split("{{JOB_DESCRIPTION_CONTENT}}").join(job?.text ?? "")
    .split("{{JOB_DESCRIPTION_LINK}}").join(job?.url || "(not provided; pasted by the user)");
}

/* ---------------------------------------------------------------- parser */

type ParsedExperience = { title: string; companyLine: string; dates: string; bullets: string[]; description?: string };
type Parsed = {
  company: string;
  role: string;
  headline: string;
  summary: string;
  skills: string[];
  /** Skills by category, when the reply writes "Category: a, b, c" lines. */
  skillGroups: { category: string; items: string[] }[];
  experience: ParsedExperience[];
  projects: ResumeProject[];
  coverLetter: string;
};

const DATE_LINE = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b(19|20)\d{2}\b).*(present|current|now|\d{4})|^(19|20)\d{2}$/i;

/** Parses the reply (COMPANY/ROLE/HEADLINE lines, # sections, cover letter) into structured parts. Tolerant of small format drift. */
export function parseResumeGPT(raw: string): Parsed {
  const text = raw.replace(/\r\n/g, "\n").replace(/^```[a-z]*\n?|```$/gim, "");
  const head = (key: string) => unbold(new RegExp(`^\\s*\\**${key}\\**\\s*:\\s*(.+)$`, "im").exec(text)?.[1] ?? "");
  const company = head("COMPANY");
  const role = head("ROLE");
  const headline = head("HEADLINE");

  // Split resume / cover letter at "---" + "COVER LETTER" (or just the COVER LETTER label).
  const splitAt = /^\s*-{3,}\s*\n+\s*#*\s*\**COVER LETTER\**\s*:?\s*$/im.exec(text) ?? /^\s*#*\s*\**COVER LETTER\**\s*:?\s*$/im.exec(text);
  const resumePart = splitAt ? text.slice(0, splitAt.index) : text;
  let coverLetter = splitAt ? text.slice(splitAt.index + splitAt[0].length) : "";
  const dear = coverLetter.search(/^\s*Dear\b/im);
  if (dear > 0) coverLetter = coverLetter.slice(dear);

  // Sections by "# TITLE"
  const sections = new Map<string, string[]>();
  let current = "";
  for (const line of resumePart.split("\n")) {
    const h = /^\s*#{1,3}\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = unbold(h[1]).toUpperCase();
      sections.set(current, []);
    } else if (current) sections.get(current)!.push(line);
  }
  const find = (...keys: string[]) => {
    for (const [k, v] of sections) if (keys.some((key) => k.includes(key))) return v;
    return [] as string[];
  };

  const summary = find("SUMMARY")
    .map((l) => stripBullet(l).trim())
    .filter(Boolean)
    .join(" ");

  const skillItems = (text: string) => [
    ...new Set(
      text
        .split(/\s*\|\s*|\s*;\s*/)
        .map((x) => unbold(x).replace(/^[^:|]{2,40}:\s*/, "").trim()) // drop "Category:" prefixes
        .flatMap((x) => (x.includes(",") && !x.includes("(") ? x.split(/\s*,\s*/) : [x]))
        .map((x) => x.replace(/\.$/, "").trim())
        .filter((x) => x && x.length < 60)
    ),
  ];
  const skillLines = find("SKILL").map((l) => unbold(stripBullet(l)).trim()).filter(Boolean);
  const skills = skillItems(skillLines.join(" | "));
  const skillGroups = skillLines
    .map((l) => /^([^:|]{2,40}):\s*(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ category: m[1].trim(), items: skillItems(m[2]) }))
    .filter((g) => g.items.length);

  // Experience: header lines (title / company - location / dates) followed by bullets.
  const experience: ParsedExperience[] = [];
  let header: string[] = [];
  let cur = null as ParsedExperience | null;
  const openEntry = () => {
    const parts = header.flatMap((h) => h.split(/\s+\|\s+/)).map(unbold).filter(Boolean);
    const dates = parts.find((p) => DATE_LINE.test(p)) ?? "";
    const rest = parts.filter((p) => p !== dates);
    cur = { title: rest[0] ?? "", companyLine: rest[1] ?? "", dates, bullets: [] };
    experience.push(cur);
    header = [];
    return cur;
  };
  // A prose line (sentences) right after an entry's header lines = internship description.
  const isProse = (l: string) => l.split(/\s+/).length >= 10 && /[.!?]["')]?$/.test(l);
  for (const rawLine of find("EXPERIENCE")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isBullet(line)) {
      if (header.length) openEntry();
      cur?.bullets.push(stripBullet(line));
    } else if (header.length >= 2 && isProse(line)) {
      openEntry().description = unbold(line);
    } else {
      header.push(line); // title, company, "location | dates" (any order, possibly "|"-joined)
    }
  }

  // Projects: **Title** / description / 3 bullets
  const projects: ResumeProject[] = [];
  let proj: ResumeProject | null = null;
  for (const rawLine of find("PROJECT")) {
    const line = rawLine.trim();
    if (!line) continue;
    const titleMatch = /^\*\*(.+?)\*\*:?$/.exec(line) ?? /^#{4,}\s*(.+)$/.exec(line);
    if (titleMatch && !isBullet(line)) {
      proj = { name: titleMatch[1].trim(), description: "", bullets: [] };
      projects.push(proj);
    } else if (isBullet(line)) {
      proj?.bullets.push(stripBullet(line));
    } else if (proj && !proj.description && !proj.bullets.length) {
      proj.description = line;
    } else if (!proj || proj.bullets.length) {
      proj = { name: unbold(line), description: "", bullets: [] }; // unbolded title fallback
      projects.push(proj);
    }
  }

  return { company, role, headline, summary, skills, skillGroups, experience, projects, coverLetter };
}

/* ------------------------------------------------------------ generation */

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Separate cover letter request, used when the main reply has none. Also returns the company and role, which such
 * replies tend to drop as well.
 */
async function writeCoverLetter(
  openai: Pick<ResolvedOpenAI, "client" | "model">,
  profile: ProfileFields,
  resume: ResumeContent,
  jobText: string,
  extraInstructions: string,
  /** The filled prompt; its cover letter instructions, if any, replace the built-in rules. */
  prompt: string
) {
  const extra = extraInstructions ? `\n\nAdditional instructions from the administrator:\n${extraInstructions}` : "";
  const rules = `Write the cover letter as the cover letter instructions in the prompt below describe (ignore its resume
instructions; the tailored resume is given in the user message). If the prompt has no cover letter instructions,
follow these rules:
${letterRules(profile.fullName)}
Use only facts from the candidate's resume and profile. Plain text, no headers above the greeting.${extra}

PROMPT:
${prompt}`;
  const resumeText = [
    `Summary: ${resume.summary}`,
    `Skills: ${resume.skills.flatMap((g) => g.items).join(", ")}`,
    ...resume.experience.map((e) => `${e.title} at ${e.company} (${formatRange(e.startDate, e.endDate, !e.endDate)}):\n${[e.description, ...e.bullets].filter(Boolean).map((b) => `- ${b}`).join("\n")}`),
  ].join("\n\n");
  try {
    const res = await openai.client.chat.completions.create({
      model: openai.model,
      ...samplingFor(openai.model, 0.7),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You write cover letters for senior software engineers. Reply with JSON: {"company": string, "role": string, "coverLetter": string}.
company / role: the hiring company and the exact job title from the job description ("" if not stated).
${rules}`,
        },
        { role: "user", content: `CANDIDATE PROFILE:\n${candidateProfileText(profile)}\n\nTAILORED RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobText}` },
      ],
    });
    const out = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { company?: unknown; role?: unknown; coverLetter?: unknown };
    return {
      company: typeof out.company === "string" ? out.company.trim() : "",
      role: typeof out.role === "string" ? out.role.trim() : "",
      coverLetter: typeof out.coverLetter === "string" ? out.coverLetter.trim() : "",
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    console.error("cover letter request failed", e);
    return null;
  }
}

async function callModel(openai: Pick<ResolvedOpenAI, "client" | "model">, system: string, user: string) {
  try {
    const completion = await openai.client.chat.completions.create({
      model: openai.model,
      ...samplingFor(openai.model, 0.7),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return completion;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    throw new HttpError(502, `OpenAI error: ${msg}`);
  }
}

/* ------------------------------------------------------------- ATS pass */

/** Generation must finish within the route's 60 s; the ATS revision only starts when this much time is left. */
const ATS_MIN_LEFT_MS = 22_000;
const GENERATION_BUDGET_MS = 57_000;

/**
 * ATS pass: scores the resume and cover letter with the same keyword match the Job match panel shows and, when the
 * resume is below `target` (or misses a required skill, or too few bullets have a number), asks the model for one
 * revision that works the missing keywords in. Titles, companies, dates and education never change. The revision is
 * kept only when it scores higher; any failure keeps the original.
 */
async function atsRevise(
  openai: Pick<ResolvedOpenAI, "client" | "model">,
  resume: ResumeContent,
  coverLetter: string,
  job: { text: string; title: string; company: string },
  target: number,
  timeoutMs: number
) {
  const before = scoreResume(resume, job.text, job.title);
  const letterBefore = scoreCoverLetter(coverLetter, job.text, job.company, job.title);
  const bullets = resume.experience.flatMap((e) => e.bullets);
  const quantified = bullets.length ? bullets.filter((b) => /\d/.test(b)).length / bullets.length : 1;
  const needs = before.score < target || before.missing.some((k) => k.required) || quantified < 0.5;
  const result = { resume, coverLetter, before: before.score, after: before.score, revised: false, promptTokens: 0, completionTokens: 0 };
  if (!needs || timeoutMs < 5000) return result;

  const required = before.missing.filter((k) => k.required).map((k) => k.term);
  const other = before.missing.filter((k) => !k.required).map((k) => k.term);
  const letterMissing = letterBefore.missing.map((k) => k.term);
  const draft = {
    titleLine: resume.titleLine ?? "",
    summary: resume.summary,
    skills: resume.skills,
    experience: resume.experience.map((e) => ({ title: e.title, company: e.company, bullets: e.bullets })),
    projects: (resume.projects ?? []).map((p) => ({ name: p.name, bullets: p.bullets })),
    coverLetter,
  };
  const system = `You revise a tailored resume and cover letter so they pass an applicant tracking system (ATS) keyword
screen for the job below, keeping the candidate's voice and every fact about employers, titles and dates.

Reply with the same JSON shape you are given: {"titleLine", "summary", "skills": [{"category", "items"}],
"experience": [{"title", "company", "bullets"}], "projects": [{"name", "bullets"}], "coverLetter"}.
Keep every experience entry in the same order with the same title and company, and the same number of bullets or more.

Make these changes:
- Every keyword listed under MISSING must appear in the skills, spelled exactly as listed (in the best-fitting
  category), and, for the REQUIRED ones, also in at least one experience bullet or the summary, worked into what that
  role actually did. Inside sentences, use normal capitalization ("system design", not "System design"); keep the
  exact spelling of product names (SQL, CI/CD, Docker). Add the other missing keywords to bullets too where the role's work supports them.
- titleLine: the job title from the posting ("${job.title || "see the job description"}"). The summary names that
  title and the posting's most important skills in its first sentence.
${quantified < 0.6 ? "- At least 60% of the experience bullets show a concrete number (percent, time saved, scale, users, requests, cost).\n" : ""}- Cover letter: mention ${letterMissing.length ? letterMissing.slice(0, 6).join(", ") : "the posting's top skills"}${/\d/.test(coverLetter) ? "" : " and one concrete result with a number"}; keep its length, greeting and sign-off.
- Plain text, no markdown, no long dashes. Do not stuff keywords into lists of buzzwords: each bullet stays one clear
  sentence about real work.

MISSING (REQUIRED): ${required.join(", ") || "none"}
MISSING (OTHER): ${other.join(", ") || "none"}
ALSO USE IF THEY FIT: ${before.softMissing.join(", ") || "none"}`;

  try {
    const res = await openai.client.chat.completions.create(
      {
        model: openai.model,
        ...samplingFor(openai.model, 0.4),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `JOB DESCRIPTION:\n${job.text.slice(0, 12000)}\n\nCURRENT DRAFT (JSON):\n${JSON.stringify(draft)}` },
        ],
      },
      { timeout: timeoutMs, maxRetries: 0 }
    );
    result.promptTokens = res.usage?.prompt_tokens ?? 0;
    result.completionTokens = res.usage?.completion_tokens ?? 0;
    const out = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<typeof draft>;
    const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => cleanResume(x)).filter(Boolean) : []);

    const skills = (Array.isArray(out.skills) ? out.skills : [])
      .map((g) => ({ category: cleanResume(String(g?.category ?? "")), items: strs(g?.items) }))
      .filter((g) => g.items.length);
    const revised: ResumeContent = {
      ...resume,
      titleLine: typeof out.titleLine === "string" && out.titleLine.trim() ? cleanResume(out.titleLine) : resume.titleLine,
      summary: typeof out.summary === "string" && out.summary.trim() ? cleanResume(out.summary) : resume.summary,
      skills: skills.length ? skills : resume.skills,
      // Matched by position; titles, companies and dates stay the profile's.
      experience: resume.experience.map((e, i) => {
        const b = strs(out.experience?.[i]?.bullets);
        return b.length >= Math.min(e.bullets.length, 2) ? { ...e, bullets: b } : e;
      }),
      projects: (resume.projects ?? []).map((p, i) => {
        const b = strs(out.projects?.[i]?.bullets);
        return b.length ? { ...p, bullets: b.slice(0, 3) } : p;
      }),
    };
    // Required skills the model still left out go into the skills section, where an ATS looks for them first.
    const stillMissing = scoreResume(revised, job.text, job.title).missing.filter((k) => k.required).map((k) => k.term);
    if (stillMissing.length) {
      const last = revised.skills.at(-1) ?? { category: "", items: [] };
      revised.skills = [...revised.skills.slice(0, -1), { ...last, items: [...last.items, ...stillMissing] }];
    }
    const after = scoreResume(revised, job.text, job.title).score;
    if (after > before.score) Object.assign(result, { resume: revised, after, revised: true });

    const letter = typeof out.coverLetter === "string" ? out.coverLetter.trim() : "";
    if (letter && scoreCoverLetter(letter, job.text, job.company, job.title).score > letterBefore.score) {
      result.coverLetter = letter;
      result.revised = true;
    }
  } catch (e) {
    console.error("ATS revision failed; keeping the first draft", e);
  }
  return result;
}

/**
 * Resume + cover letter for a job. The prompt (Settings, else DEFAULT_RESUME_PROMPT) is followed as written: the app
 * adds only the reply layout it parses, and takes job titles, companies, dates and education from the profile.
 * `atsTarget` (Settings → ATS target score; 0 = off): see atsRevise.
 */
export async function generateApplication(
  openai: Pick<ResolvedOpenAI, "client" | "model">,
  profile: ProfileFields,
  job: { text: string; url?: string; title?: string; company?: string; location?: string },
  extraInstructions = "",
  promptTemplate = "",
  atsTarget = 0
): Promise<GenerationResult> {
  const started = Date.now();
  const template = promptTemplate.trim() || DEFAULT_RESUME_PROMPT;
  const filled = fillPrompt(template, profile, job);
  const system =
    withOutputContract(filled, profile.fullName) +
    (extraInstructions ? `\n\nAdditional instructions from the administrator:\n${extraInstructions}` : "");
  // The job goes inside the prompt when it has the job placeholders, else in this message.
  const user = JOB_PLACEHOLDERS.some((ph) => template.includes(ph))
    ? "Write the resume and cover letter for the job description given above, following every instruction and the required output layout."
    : `JOB DESCRIPTION LINK: ${job.url || "(not provided; pasted by the user)"}\n\nJOB DESCRIPTION CONTENT:\n${job.text}`;

  let completion = await callModel(openai, system, user);
  let parsed = parseResumeGPT(completion.choices[0]?.message?.content ?? "");
  let promptTokens = completion.usage?.prompt_tokens ?? 0;
  let completionTokens = completion.usage?.completion_tokens ?? 0;

  // One retry if the resume structure is missing (a missing cover letter is written separately below).
  const broken = (p: Parsed) => !p.summary || !p.experience.some((e) => e.bullets.length);
  if (broken(parsed)) {
    completion = await callModel(
      openai,
      system,
      `${user}\n\nIMPORTANT: Follow the required output layout exactly: COMPANY/ROLE/HEADLINE lines, every resume section title on its own line starting with "# " (a summary section and an experience section with "• " bullets are required), then "---" and "COVER LETTER".`
    );
    const second = parseResumeGPT(completion.choices[0]?.message?.content ?? "");
    promptTokens += completion.usage?.prompt_tokens ?? 0;
    completionTokens += completion.usage?.completion_tokens ?? 0;
    if (!broken(second) || (second.summary && !parsed.summary)) parsed = second;
  }
  if (!parsed.summary && !parsed.experience.length) throw new HttpError(502, "The AI response could not be read. Please try again.");

  // Match parsed experience to profile roles (by company name, then by order); titles, companies and dates come from
  // the profile exactly.
  const used = new Set<number>();
  const experience: ResumeExperience[] = profile.experience.map((e, i) => {
    let idx = parsed.experience.findIndex((x, j) => !used.has(j) && norm(x.companyLine).includes(norm(e.company)));
    if (idx < 0 && !used.has(i) && parsed.experience[i]) idx = i;
    if (idx >= 0) used.add(idx);
    const bullets = (idx >= 0 ? parsed.experience[idx].bullets : []).map((b) => cleanResume(b)).filter(Boolean);
    return {
      company: e.company,
      title: e.title || "",
      location: e.location || "",
      startDate: e.startDate || "",
      endDate: e.current ? "" : e.endDate || "",
      bullets: bullets.length ? bullets : (e.description || "").split("\n").map((l) => cleanResume(stripBullet(l))).filter(Boolean),
    };
  });

  let resume: ResumeContent = {
    fullName: profile.fullName,
    headline: RESUME_HEADLINE,
    // The target headline from the reply (HEADLINE line) is shown under the name; otherwise the profile's title.
    ...(parsed.headline
      ? { titleLine: cleanResume(parsed.headline) }
      : profile.professionalTitle?.trim()
        ? { titleLine: profile.professionalTitle.trim() }
        : {}),
    contact: {
      email: profile.email || "",
      phone: profile.phone || "",
      linkedin: profile.linkedin || "",
      location: profile.location || [profile.city, profile.state].filter(Boolean).join(", "),
      website: "", // the prompt forbids portfolio/website links
      github: "",
    },
    summary: cleanResume(parsed.summary || profile.summary || ""),
    skills:
      parsed.skillGroups.length > 1
        ? parsed.skillGroups.map((g) => ({ category: cleanResume(g.category), items: g.items.map((x) => cleanResume(x)).filter(Boolean) }))
        : [{ category: "", items: (parsed.skills.length ? parsed.skills : profile.skills).map((x) => cleanResume(x)).filter(Boolean) }],
    experience,
    projects: parsed.projects
      .slice(0, 4)
      .map((p) => ({
        name: cleanResume(p.name),
        description: cleanResume(p.description ?? ""),
        bullets: p.bullets.map((b) => cleanResume(b)).filter(Boolean).slice(0, 3),
      }))
      .filter((p) => p.name && (p.bullets.length || p.description)),
    education: profile.education.map((e) => ({
      university: e.university,
      degree: e.degree || "",
      field: e.field || "",
      startDate: e.startDate || "",
      endDate: e.endDate || "",
    })),
    certifications: [],
  };

  // The reply had no cover letter: write it with a dedicated request.
  if (!parsed.coverLetter.trim()) {
    const letter = await writeCoverLetter(openai, profile, resume, job.text, extraInstructions, filled);
    if (letter) {
      parsed.coverLetter = letter.coverLetter;
      if (!parsed.company) parsed.company = letter.company;
      if (!parsed.role) parsed.role = letter.role;
      promptTokens += letter.promptTokens;
      completionTokens += letter.completionTokens;
    }
  }

  let ats: GenerationResult["ats"];
  if (atsTarget > 0) {
    const left = GENERATION_BUDGET_MS - (Date.now() - started);
    const pass = await atsRevise(
      openai,
      resume,
      parsed.coverLetter,
      { text: job.text, title: parsed.role || job.title || "", company: parsed.company || job.company || "" },
      atsTarget,
      left >= ATS_MIN_LEFT_MS ? left - 2000 : 0
    );
    resume = pass.resume;
    parsed.coverLetter = pass.coverLetter;
    promptTokens += pass.promptTokens;
    completionTokens += pass.completionTokens;
    ats = { before: pass.before, after: pass.after, revised: pass.revised };
  }

  const letter = cleanLetter(letterParagraphBreaks(parsed.coverLetter))
    // "Dear Hiring Manager" → "Dear Hiring Manager," (traditional business letter)
    .replace(/^(Dear [^\n,:]+?)\s*[:]?\s*$/m, "$1,")
    // keep the sign-off and the name together on consecutive lines
    .replace(/\n\s*\n(Sincerely|Best regards|Kind regards|Regards),?\s*\n\s*\n([^\n]+)\s*$/i, "\n\n$1,\n$2");
  const coverLetter = letter && !/sincerely/i.test(letter) ? `${letter}\n\nSincerely,\n${profile.fullName}` : letter;

  return {
    company: parsed.company || job.company || "",
    jobTitle: parsed.role || job.title || "",
    jobLocation: job.location || "",
    jobDescription: job.text,
    resume,
    coverLetter,
    usage: { model: openai.model, promptTokens, completionTokens },
    ...(ats ? { ats } : {}),
  };
}
