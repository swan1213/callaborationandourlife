import { AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "fs/promises";
import JSZip from "jszip";
import path from "path";
import { PDFDocument, rgb, setCharacterSpacing, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatRange, type ResumeContent } from "./generate";
import { displayUrl } from "./links";
import { resumeHeadline } from "./headline";
import { atsSpec, type AtsSpec } from "./designs";

export type AppDocSource = {
  _id: unknown;
  company?: string | null;
  jobTitle?: string | null;
  jobUrl?: string | null;
  jobLocation?: string | null;
  jobDescription?: string | null;
  coverLetter?: string | null;
  resume: ResumeContent;
  /** Design ids from lib/designs.ts; missing / "" = Standard. */
  resumeDesign?: string | null;
  coverLetterDesign?: string | null;
  createdAt?: Date | string;
};

const FONT = "Calibri";
const BLACK = "000000";
const PAGE_W = 12240; // twips, US Letter (8.5 x 11")
const PAGE_H = 15840;

export function safeName(s: string, max = 80) {
  let name = (s || "").replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim();
  if (name.length > max) name = name.slice(0, max).replace(/\s+\S*$/, ""); // cut at a word boundary
  return name.replace(/\s/g, "_") || "Untitled";
}

/** "[Company Name]_[Role Title]" — base name for the files inside the ZIP. */
export function baseFileName(app: AppDocSource) {
  return `${safeName(app.company || "Company")}_${safeName(app.jobTitle || "Role")}`;
}

/** "{Date}-{Company Name}-{Role}", e.g. "2026-09-26-Anthropic-Software Engineer". */
export function applicationLabel(app: AppDocSource) {
  const clean = (s: string) =>
    (s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const d = new Date(app.createdAt ?? Date.now());
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return [date, clean(app.company || "") || "Company", clean(app.jobTitle || "") || "Role"].join("-");
}

export function zipFileName(app: AppDocSource) {
  return `${applicationLabel(app)}.zip`;
}

/** Header contact line: location | phone | email | LinkedIn (plain text; no portfolio/website per the prompt). */
function contactParts(r: ResumeContent) {
  const c = r.contact;
  return [c.location, c.phone, c.email, displayUrl(c.linkedin)].filter((x): x is string => !!x);
}

const plain = (s: string) => s.replace(/\*\*/g, "");

/** "October 17, 2026": the date line on cover letters. */
function letterDate(app: AppDocSource) {
  return new Date(app.createdAt ?? Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/* ------------------------------------------------------------------ DOCX */

// Body text 10.5 pt; section headings are 6 pt larger (16.5 pt). Content is plain (no bold) and justified.
const BODY = 21; // half-points
const HEADING = BODY + 12; // +6 pt
const J = AlignmentType.JUSTIFIED;
const t = (text: string, bold = false, size = BODY) => new TextRun({ text: plain(text), bold, size, font: FONT, color: BLACK });

/** An empty line (a real line break) at body size. */
const blankLine = () => new Paragraph({ spacing: { before: 0, after: 0 }, children: [t("")] });

/**
 * "#" section title → Word Heading 1.
 * Layout: a blank line before the section (except the first), spacing around the title, then one blank line before content.
 */
function heading(text: string, first = false) {
  return [
    ...(first ? [] : [blankLine()]),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      spacing: { before: 120, after: 120 },
      children: [new TextRun({ text: text.toUpperCase(), font: FONT, color: BLACK, bold: true, size: HEADING })],
    }),
    new Paragraph({ keepNext: true, spacing: { after: 0 }, children: [t("", false, 12)] }),
  ];
}

function bullet(text: string) {
  return new Paragraph({ style: "ListBullet", alignment: J, numbering: { reference: "tb-bullet", level: 0 }, spacing: { after: 30 }, children: [t(text)] });
}

function docxShell(children: Paragraph[], margins = 720, font = FONT, color = BLACK) {
  return new Document({
    styles: {
      default: { document: { run: { font, color, size: BODY }, paragraph: { alignment: J } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font, color, bold: true, size: HEADING },
          paragraph: { spacing: { before: 120, after: 120 }, keepNext: true },
        },
        { id: "ListBullet", name: "List Bullet", basedOn: "Normal", quickFormat: true, run: { font, color, size: BODY }, paragraph: { alignment: J } },
      ],
    },
    numbering: {
      config: [
        {
          reference: "tb-bullet",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: margins, bottom: margins, left: margins, right: margins } } }, children }],
  });
}

/** Every design renders with the resume prompt's layout (lib/designs.ts). */
export async function resumeDocx(r: ResumeContent, design?: string | null): Promise<Buffer> {
  return atsResumeDocx(r, await fitOnePage(r, atsSpec(design)));
}

const CLOSING = /^(sincerely|best regards|kind regards|warm regards|regards|best|respectfully|thank you),?$/i;

/**
 * Splits the letter into salutation / body / closing so the salutation and sign-off are left-aligned
 * (a soft line break inside a justified paragraph would stretch "Dear Hiring Manager," across the line).
 */
function letterBlocks(app: AppDocSource) {
  const paras = (app.coverLetter || "").replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let salutation = "";
  const closing: string[] = [];
  if (paras.length && /^dear\b/i.test(paras[0])) {
    const [first, ...rest] = paras[0].split("\n");
    salutation = first.trim();
    const remainder = rest.join(" ").trim();
    if (remainder) paras[0] = remainder;
    else paras.shift();
  }
  // Sign-off: "Sincerely," (possibly inside the last paragraph) + name (same or next paragraph).
  for (let i = paras.length - 1; i >= Math.max(0, paras.length - 3); i--) {
    const lines = paras[i].split("\n").map((l) => l.trim());
    const at = lines.findIndex((l) => CLOSING.test(l));
    if (at < 0) continue;
    const before = lines.slice(0, at).join(" ").trim();
    closing.push(...lines.slice(at), ...paras.slice(i + 1).flatMap((p) => p.split("\n").map((l) => l.trim())));
    paras.splice(i, paras.length - i, ...(before ? [before] : []));
    break;
  }
  const body = paras.map((p) => p.replace(/\s*\n\s*/g, " "));
  return { salutation, body, closing: closing.filter(Boolean) };
}

export async function coverLetterDocx(app: AppDocSource): Promise<Buffer> {
  return atsLetterDocx(app, atsSpec(app.coverLetterDesign));
}

const hp = (pt: number) => Math.round(pt * 2); // half-points

export async function jobDescriptionDocx(app: AppDocSource): Promise<Buffer> {
  const meta: [string, string][] = (
    [
      ["Company", app.company || ""],
      ["Role", app.jobTitle || ""],
      ["Location", app.jobLocation || ""],
      ["URL", app.jobUrl || ""],
      ["Generated", new Date(app.createdAt ?? Date.now()).toISOString().slice(0, 10)],
    ] as [string, string][]
  ).filter(([, v]) => v);

  const children: Paragraph[] = [
    new Paragraph({ spacing: { after: 120 }, children: [t(app.jobTitle || "Job Description", true, 32)] }),
    ...meta.map(([k, v]) => new Paragraph({ children: [t(`${k}: `, true), t(v)] })),
    ...heading("Job Description"),
  ];
  // Short lines without terminal punctuation are treated as sub-headings; "•"/"-" lines as bullets.
  for (const raw of (app.jobDescription || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const isB = /^[•\-*·]\s+/.test(line);
    const text = line.replace(/^[•\-*·]\s+/, "");
    const isHeading = !isB && text.length <= 60 && !/[.,;:]$/.test(text) && /^[A-Z]/.test(text) && text.split(" ").length <= 8;
    children.push(
      isB
        ? bullet(text)
        : isHeading
          ? new Paragraph({ spacing: { before: 200, after: 60 }, children: [t(text, true, 22)] })
          : new Paragraph({ spacing: { after: 100 }, children: [t(text, false, 20)] })
    );
  }
  return Packer.toBuffer(docxShell(children, 1080));
}

/* ------------------------------------------------------------------- PDF */

// Keep PDF text to the WinAnsi range, which the embedded font covers; normalise everything else. Tabs and line
// breaks become a space: drawText can't encode them ("WinAnsi cannot encode … (0x000a)"), and a stray line break in a one-line field
// (a title, a location, a date) made the whole download fail. Paragraphs are split on "\n" before this runs.
function winAnsi(text: string) {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[●▪‣⁃]/g, "•")
    .replace(/ /g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/[^\x20-\x7E¡-ÿ•…€™]/g, "");
}

const INK = rgb(0, 0, 0);
const JUSTIFY_LAST_LINE_FILL = 0.85;

class PdfWriter {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    public fonts: { regular: PDFFont; bold: PDFFont },
    public margin = 50
  ) {
    this.newPage();
  }
  get width() {
    return 612 - this.margin * 2;
  }
  newPage() {
    this.page = this.doc.addPage([612, 792]);
    this.y = 792 - this.margin;
  }
  ensure(h: number) {
    if (this.y - h < this.margin) this.newPage();
  }
  /** Word-wraps mixed bold/regular segments; `indent` shifts the text block. */
  rich(
    segs: { text: string; bold?: boolean }[],
    opts: { size?: number; indent?: number; center?: boolean; gap?: number; justify?: boolean; color?: RGB; width?: number; leading?: number } = {}
  ) {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const lh = size * (opts.leading ?? 1.32);
    const maxW = (opts.width ?? this.width) - indent;
    const words: { w: string; bold: boolean }[] = [];
    for (const s of segs) for (const w of winAnsi(s.text).split(/(\s+)/)) if (w) words.push({ w, bold: !!s.bold });
    const lines: { w: string; bold: boolean }[][] = [];
    let line: { w: string; bold: boolean }[] = [];
    let width = 0;
    const measure = (x: { w: string; bold: boolean }) => (x.bold ? this.fonts.bold : this.fonts.regular).widthOfTextAtSize(x.w, size);
    for (const x of words) {
      if (/^\s+$/.test(x.w) && !line.length) continue;
      const wv = measure(x);
      if (width + wv > maxW && line.length && !/^\s+$/.test(x.w)) {
        lines.push(line);
        line = [];
        width = 0;
      }
      if (/^\s+$/.test(x.w) && !line.length) continue;
      line.push(/^\s+$/.test(x.w) ? { ...x, w: " " } : x);
      width += /^\s+$/.test(x.w) ? measure({ w: " ", bold: x.bold }) : wv;
    }
    if (line.length) lines.push(line);
    lines.forEach((l, li) => {
      while (l.length && /^\s+$/.test(l[l.length - 1].w)) l.pop();
      this.ensure(lh);
      this.y -= lh;
      const total = l.reduce((a, x) => a + measure(x), 0);
      const gaps = l.filter((x) => /^\s+$/.test(x.w)).length;
      // Justify every line; the last (or only) line too once it is at least 85% full, so content is
      // flush with both margins. Shorter tails stay left so a few words are not scattered across the line.
      const stretch = li < lines.length - 1 || total / maxW >= JUSTIFY_LAST_LINE_FILL;
      const extra = opts.justify && stretch && gaps > 0 ? (maxW - total) / gaps : 0;
      let x = opts.center ? this.margin + (this.width - total) / 2 : this.margin + indent;
      // Emit real space characters inside the drawn strings so the PDF text layer (what ATS parsers read)
      // keeps word boundaries: whole runs when not justifying, "word␠" chunks when justifying.
      const runs: { w: string; bold: boolean; gapAfter: boolean }[] = [];
      for (const part of l) {
        const isSpace = /^\s+$/.test(part.w);
        const last = runs[runs.length - 1];
        if (isSpace) {
          if (last) (last.w += " "), (last.gapAfter = true);
        } else if (last && last.bold === part.bold && !(extra && last.gapAfter)) last.w += part.w;
        else runs.push({ w: part.w, bold: part.bold, gapAfter: false });
      }
      for (const run of runs) {
        const font = run.bold ? this.fonts.bold : this.fonts.regular;
        this.page.drawText(run.w, { x, y: this.y, size, font, color: opts.color ?? INK });
        x += font.widthOfTextAtSize(run.w, size) + (run.gapAfter ? extra : 0);
      }
    });
    this.y -= opts.gap ?? 0;
  }
  bullet(text: string, size = 10, color: RGB = INK, justify = true) {
    const lh = size * 1.32;
    this.ensure(lh);
    // Draw the bullet first so text extraction (ATS parsers) reads "• text" in order.
    this.page.drawText("•", { x: this.margin + 5, y: this.y - lh, size, font: this.fonts.regular, color });
    this.rich([{ text: plain(text) }], { size, indent: 16, justify, color });
    this.y -= 1.5;
  }
  /** One unwrapped line at baseline `y`, optionally letter-spaced (PDF Tc, so the text layer stays one string). */
  label(text: string, o: { y: number; size: number; bold?: boolean; color?: RGB; tracking?: number; center?: boolean; indent?: number }) {
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const s = winAnsi(text);
    const tracking = o.tracking ?? 0;
    const width = font.widthOfTextAtSize(s, o.size) + tracking * Math.max(0, s.length - 1);
    const x = o.center ? this.margin + (this.width - width) / 2 : this.margin + (o.indent ?? 0);
    if (tracking) this.page.pushOperators(setCharacterSpacing(tracking));
    this.page.drawText(s, { x, y: o.y, size: o.size, font, color: o.color ?? INK });
    if (tracking) this.page.pushOperators(setCharacterSpacing(0));
  }
}

/**
 * TailorBid Sans: Carlito, which has Calibri's exact letter widths, trimmed to WinAnsi (src/lib/fonts/README.txt, SIL
 * Open Font License). The PDF looks like the Calibri Word file and the one-page fit measured on it holds for both.
 * Embedded whole (about 24 KB each): pdf-lib's own subsetting drops Carlito's glyphs. Traced by next.config.ts.
 */
let pdfFontFiles: Promise<Buffer[]> | null = null;
const fontFiles = () =>
  (pdfFontFiles ??= Promise.all(["TailorBidSans-Regular.ttf", "TailorBidSans-Bold.ttf"].map((f) => readFile(path.join(process.cwd(), "src/lib/fonts", f)))));

async function newPdf() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, bold] = await fontFiles();
  const fonts = { regular: await doc.embedFont(regular), bold: await doc.embedFont(bold) };
  return { doc, fonts };
}

export async function resumePdf(r: ResumeContent, design?: string | null): Promise<Uint8Array> {
  return (await atsResumePdf(r, await fitOnePage(r, atsSpec(design)))).save();
}

export async function coverLetterPdf(app: AppDocSource): Promise<Uint8Array> {
  return atsLetterPdf(app, atsSpec(app.coverLetterDesign));
}

/* ------------------------------------------------------- resume prompt layout
   Every design (lib/designs.ts) renders with the resume prompt's layout: US Letter, 0.55" margins, Calibri, black
   text, one column, uppercase section headings with thin rules, "Company | Location | Dates" under each job title,
   skills grouped by category, real bullets and real text only (no tables, text boxes, columns, images, page
   headers/footers or colour). */

/** Skills as "Category: a, b, c" lines; one plain list when the groups have no names. */
export function atsSkillLines(r: ResumeContent): { label: string; items: string }[] {
  const groups = r.skills.filter((g) => g.items?.length);
  if (!groups.length) return [];
  if (groups.length === 1 && !groups[0].category?.trim()) return [{ label: "", items: groups[0].items.join(", ") }];
  return groups.map((g) => ({ label: (g.category || "").trim(), items: g.items.join(", ") }));
}

/** "May 2016" (graduation), or the range when only a start date is known. */
export const atsEducationDate = (e: ResumeContent["education"][number]) =>
  formatRange("", e.endDate) || formatRange(e.startDate, e.endDate).replace(/^Present$/, "");

/** "Company | Location | Dates" under the job title. */
export const experienceMeta = (e: ResumeContent["experience"][number]) =>
  [e.company, e.location, formatRange(e.startDate, e.endDate, !e.endDate)].filter(Boolean).join(" | ");

/** "Degree, Major | Year" after the university on its education line. */
export const educationRest = (e: ResumeContent["education"][number]) =>
  [[e.degree, e.field].filter(Boolean).join(", "), atsEducationDate(e)].filter(Boolean).join(" | ");

const ATS_INK = "000000";

function atsDocxKit(a: AtsSpec, bodyPt: number) {
  const run = (text: string, o: { size?: number; bold?: boolean; italics?: boolean; tracking?: number } = {}) =>
    new TextRun({ text: plain(text), font: a.docxFont, size: hp(o.size ?? bodyPt), bold: o.bold, italics: o.italics, characterSpacing: o.tracking, color: ATS_INK });
  const p = (children: TextRun[], o: { after?: number; before?: number; keepNext?: boolean; align?: "left" | "center" } = {}) =>
    new Paragraph({
      alignment: o.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: o.before ?? 0, after: o.after ?? 0, line: 252 },
      keepNext: o.keepNext,
      children,
    });
  const L = a.resume;
  const tw = (pt: number) => Math.round(pt * 20);
  const heading = (title: string, first: boolean) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      alignment: AlignmentType.LEFT,
      spacing: { before: tw(first ? L.firstSectionBefore : L.sectionBefore), after: tw(L.sectionAfter) },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: L.rule, space: 1 } },
      children: [run(title.toUpperCase(), { size: L.heading, bold: true, tracking: 10 })],
    });
  const bullet = (text: string) =>
    new Paragraph({
      style: "ListBullet",
      alignment: AlignmentType.LEFT,
      numbering: { reference: "tb-bullet", level: 0 },
      spacing: { after: tw(L.bulletAfter), line: 252 },
      children: [run(text, { size: L.bullet })],
    });
  /** Name, headline and contact line, in the document body (never a page header) so every ATS reads them. */
  const header = (r: ResumeContent, o: { headline?: boolean; name?: number; contact?: number } = {}) => {
    const align = a.align;
    const out = [p([run(r.fullName, { size: o.name ?? 20, bold: true })], { align, after: 20 })];
    if (o.headline !== false) out.push(p([run(resumeHeadline(r), { size: L.headline })], { align, after: 20 }));
    const contact = contactParts(r);
    if (contact.length) out.push(p([run(contact.join("  |  "), { size: o.contact ?? bodyPt - 1 })], { align }));
    return out;
  };
  /** Thin rule across the page (an empty paragraph's bottom border). */
  const rule = (color: string, before = 60) =>
    new Paragraph({ spacing: { before, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 } }, children: [run("", { size: 4 })] });
  return { run, p, heading, bullet, header, rule };
}

async function atsResumeDocx(r: ResumeContent, a: AtsSpec): Promise<Buffer> {
  const L = a.resume;
  const MARGIN = Math.round(L.marginIn * 1440);
  const k = atsDocxKit(a, L.body);
  const tw = (pt: number) => Math.round(pt * 20);
  const children: Paragraph[] = k.header(r, { name: L.name, contact: L.contact });
  children.push(k.rule(L.rule, 40));
  let first = true;
  const section = (title: string) => {
    children.push(k.heading(title, first));
    first = false;
  };
  const gap = () => k.p([k.run("", { size: 2 })], { after: tw(L.entryGap) });

  if (r.summary) {
    section(L.sections.summary);
    children.push(k.p([k.run(r.summary)], { after: 20 }));
  }
  const skills = atsSkillLines(r);
  if (skills.length) {
    section(L.sections.skills);
    for (const s of skills) children.push(k.p(s.label ? [k.run(`${s.label}: `, { bold: true }), k.run(s.items)] : [k.run(s.items)], { after: 20 }));
  }
  if (r.experience.length) {
    section(L.sections.experience);
    r.experience.forEach((e, i) => {
      children.push(k.p([k.run(e.title, { size: L.title, bold: true })], { keepNext: true }));
      const meta = experienceMeta(e);
      if (meta) children.push(k.p([k.run(meta, { size: L.meta })], { after: 30, keepNext: true }));
      if (e.description) children.push(k.p([k.run(e.description)], { after: 30 }));
      e.bullets.forEach((b) => children.push(k.bullet(b)));
      if (i < r.experience.length - 1) children.push(gap());
    });
  }
  if (r.projects?.length) {
    section(L.sections.projects);
    r.projects.forEach((pr, i) => {
      const stack = pr.techStack?.length ? pr.techStack.join(", ") : "";
      children.push(k.p([k.run(pr.name, { size: L.title, bold: true }), ...(stack ? [k.run(`  |  ${stack}`, { italics: true })] : [])], { after: 20, keepNext: true }));
      if (pr.description) children.push(k.p([k.run(pr.description)], { after: 30, keepNext: !!pr.bullets.length }));
      pr.bullets.forEach((b) => children.push(k.bullet(b)));
      if (i < r.projects!.length - 1) children.push(gap());
    });
  }
  if (r.education.length) {
    section(L.sections.education);
    r.education.forEach((e, i) => {
      const rest = educationRest(e);
      children.push(k.p([k.run(e.university, { bold: true }), ...(rest ? [k.run(` | ${rest}`)] : [])], { after: i === r.education.length - 1 ? 0 : 30 }));
    });
  }
  return Packer.toBuffer(docxShell(children, MARGIN, a.docxFont, ATS_INK));
}

/** US business letter parts: recipient block and subject line, plus the salutation / body / closing. */
export function atsLetterParts(app: Pick<AppDocSource, "company" | "jobTitle" | "jobLocation" | "coverLetter" | "_id" | "resume">) {
  const recipient = ["Hiring Team", app.company || "", app.jobLocation || ""].filter(Boolean);
  const subject = app.jobTitle ? `Re: ${app.jobTitle}` : "";
  return { recipient, subject, ...letterBlocks(app as AppDocSource) };
}

async function atsLetterDocx(app: AppDocSource, a: AtsSpec): Promise<Buffer> {
  const MARGIN = 1440; // 1"
  const k = atsDocxKit(a, 11);
  const children: Paragraph[] = k.header(app.resume, { headline: false });
  children.push(k.rule(a.resume.rule));
  const { recipient, subject, salutation, body, closing } = atsLetterParts(app);
  children.push(k.p([k.run(letterDate(app))], { before: 320, after: 240 }));
  recipient.forEach((l, i) => children.push(k.p([k.run(l)], { after: i === recipient.length - 1 ? 240 : 0 })));
  if (subject) children.push(k.p([k.run(subject, { bold: true })], { after: 240 }));
  if (salutation) children.push(k.p([k.run(salutation)], { after: 200 }));
  body.forEach((t) => children.push(k.p([k.run(t)], { after: 200 })));
  closing.forEach((c, i) => children.push(k.p([k.run(c)], { after: i === 0 && closing.length > 1 ? 360 : 0 })));
  return Packer.toBuffer(docxShell(children, MARGIN, a.docxFont, ATS_INK));
}

/* ATS PDF: same structure; each line is drawn left to right so the PDF text layer reads in order. */

const PDF_ATS_INK = rgb(0, 0, 0);

function atsPdfKit(w: PdfWriter, a: AtsSpec, bodyPt: number) {
  const para = (segs: { text: string; bold?: boolean }[], o: { size?: number; gap?: number; center?: boolean } = {}) =>
    w.rich(segs, { size: o.size ?? bodyPt, justify: false, center: o.center, gap: o.gap ?? 0, color: PDF_ATS_INK, leading: 1.3 });
  const L = a.resume;
  const ruleRgb = (hex: string) => rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  const heading = (title: string, first: boolean) => {
    w.ensure(60);
    w.y -= first ? L.firstSectionBefore : L.sectionBefore;
    const size = L.heading;
    const base = w.y - size;
    w.label(title.toUpperCase(), { y: base, size, bold: true, color: PDF_ATS_INK, tracking: 0.5 });
    w.page.drawLine({ start: { x: w.margin, y: base - 3.5 }, end: { x: w.margin + w.width, y: base - 3.5 }, thickness: 0.6, color: ruleRgb(L.rule) });
    w.y = base - 5 - L.sectionAfter;
  };
  const header = (r: ResumeContent, o: { headline?: boolean; name?: number; contact?: number } = {}) => {
    const center = a.align === "center";
    para([{ text: r.fullName, bold: true }], { size: o.name ?? 19, center, gap: 2 });
    if (o.headline !== false) para([{ text: resumeHeadline(r) }], { size: L.headline, center, gap: 1 });
    const contact = contactParts(r);
    if (contact.length) para([{ text: contact.join("  |  ") }], { size: o.contact ?? bodyPt - 1, center });
  };
  /** Thin rule across the page under the header. */
  const rule = (color: RGB, before = 6) => {
    w.y -= before;
    w.page.drawLine({ start: { x: w.margin, y: w.y }, end: { x: w.margin + w.width, y: w.y }, thickness: 0.6, color });
  };
  return { para, heading, header, rule, ruleRgb };
}

/**
 * The prompt's one-page rule: when the resume runs past one page, tighten the spacing, then the type sizes (never
 * below 9 pt, contact line as specified), and use the first layout that fits. Measured with the PDF renderer, whose
 * Helvetica is wider than Calibri, so the Word file fits too. Content that is still too long keeps the tightest layout.
 */
async function fitOnePage(r: ResumeContent, a: AtsSpec): Promise<AtsSpec> {
  const L = a.resume;
  const tight = { ...L, firstSectionBefore: 4, sectionBefore: 5, sectionAfter: 2, bulletAfter: 1, entryGap: 3 };
  const steps: AtsSpec["resume"][] = [
    L,
    tight,
    { ...tight, name: 18, headline: 9.5, heading: 10, title: 9.5, body: 9.3, bullet: 9.1 },
    { ...tight, name: 18, headline: 9.5, heading: 10, title: 9.2, meta: 9, body: 9, bullet: 9 },
  ];
  for (const resume of steps) {
    const spec = { ...a, resume };
    if ((await atsResumePdf(r, spec)).getPageCount() === 1) return spec;
  }
  return { ...a, resume: steps[steps.length - 1] };
}

async function atsResumePdf(r: ResumeContent, a: AtsSpec): Promise<PDFDocument> {
  const { doc, fonts } = await newPdf();
  doc.setTitle(`${r.fullName} - Resume`);
  doc.setAuthor(r.fullName);
  doc.setSubject(resumeHeadline(r));
  const L = a.resume;
  const w = new PdfWriter(doc, fonts, L.marginIn * 72);
  const k = atsPdfKit(w, a, L.body);
  k.header(r, { name: L.name, contact: L.contact });
  k.rule(k.ruleRgb(L.rule), 4);
  let first = true;
  const section = (title: string) => {
    k.heading(title, first);
    first = false;
  };
  const bullet = (b: string) => {
    w.bullet(b, L.bullet, PDF_ATS_INK, false);
    w.y -= L.bulletAfter - 1.5; // PdfWriter.bullet already leaves 1.5 pt
  };
  if (r.summary) {
    section(L.sections.summary);
    k.para([{ text: r.summary }]);
  }
  const skills = atsSkillLines(r);
  if (skills.length) {
    section(L.sections.skills);
    for (const s of skills) k.para(s.label ? [{ text: `${s.label}: `, bold: true }, { text: s.items }] : [{ text: s.items }], { gap: 1 });
  }
  if (r.experience.length) {
    section(L.sections.experience);
    r.experience.forEach((e, i) => {
      if (i) w.y -= L.entryGap;
      w.ensure(52);
      k.para([{ text: e.title, bold: true }], { size: L.title });
      const meta = experienceMeta(e);
      if (meta) k.para([{ text: meta }], { size: L.meta, gap: 1.5 });
      if (e.description) k.para([{ text: e.description }], { gap: 1 });
      for (const b of e.bullets) bullet(b);
    });
  }
  if (r.projects?.length) {
    section(L.sections.projects);
    r.projects.forEach((pr, i) => {
      if (i) w.y -= L.entryGap;
      w.ensure(44);
      const stack = pr.techStack?.length ? pr.techStack.join(", ") : "";
      k.para([{ text: pr.name, bold: true }, ...(stack ? [{ text: `  |  ${stack}` }] : [])], { size: L.title, gap: 1 });
      if (pr.description) k.para([{ text: pr.description }], { gap: 1.5 });
      for (const b of pr.bullets) bullet(b);
    });
  }
  if (r.education.length) {
    section(L.sections.education);
    r.education.forEach((e, i) => {
      if (i) w.y -= 1.5;
      const rest = educationRest(e);
      k.para([{ text: e.university, bold: true }, ...(rest ? [{ text: ` | ${rest}` }] : [])]);
    });
  }
  return doc;
}

async function atsLetterPdf(app: AppDocSource, a: AtsSpec): Promise<Uint8Array> {
  const { doc, fonts } = await newPdf();
  doc.setTitle(`${app.resume.fullName} - Cover Letter`);
  doc.setAuthor(app.resume.fullName);
  const SIZE = 11;
  const w = new PdfWriter(doc, fonts, 72); // 1"
  const k = atsPdfKit(w, a, SIZE);
  k.header(app.resume, { headline: false });
  w.y -= 6;
  w.page.drawLine({ start: { x: w.margin, y: w.y }, end: { x: w.margin + w.width, y: w.y }, thickness: 0.6, color: k.ruleRgb(a.resume.rule) });
  const { recipient, subject, salutation, body, closing } = atsLetterParts(app);
  const blank = () => (w.y -= SIZE * 1.15);
  w.y -= 18;
  k.para([{ text: letterDate(app) }]);
  blank();
  recipient.forEach((l) => k.para([{ text: l }]));
  blank();
  if (subject) {
    k.para([{ text: subject, bold: true }]);
    blank();
  }
  if (salutation) {
    k.para([{ text: salutation }]);
    w.y -= 8;
  }
  for (const t of body) k.para([{ text: t }], { gap: 9 });
  closing.forEach((c, i) => {
    k.para([{ text: c }]);
    if (i === 0 && closing.length > 1) w.y -= 22; // room for a signature
  });
  return doc.save();
}

/* ------------------------------------------------------------------- ZIP */

/** One application's documents in `folder` (see zipLayout.ts); the folder already names the job, so the files don't repeat it. */
export async function addApplicationToZip(zip: JSZip, app: AppDocSource, folder: string, resumeOnly = false) {
  const dir = zip.folder(folder)!;
  if (resumeOnly) {
    const [rDocx, rPdf] = await Promise.all([resumeDocx(app.resume, app.resumeDesign), resumePdf(app.resume, app.resumeDesign)]);
    dir.file("Resume.docx", rDocx);
    dir.file("Resume.pdf", rPdf);
    return;
  }
  const [rDocx, rPdf, cDocx, cPdf, jdDocx] = await Promise.all([
    resumeDocx(app.resume, app.resumeDesign),
    resumePdf(app.resume, app.resumeDesign),
    coverLetterDocx(app),
    coverLetterPdf(app),
    jobDescriptionDocx(app),
  ]);
  dir.file("Resume.docx", rDocx);
  dir.file("Resume.pdf", rPdf);
  dir.file("Cover_Letter.docx", cDocx);
  dir.file("Cover_Letter.pdf", cPdf);
  dir.file("Job_Description.docx", jdDocx);
}

export async function applicationZip(app: AppDocSource, folder: string) {
  const zip = new JSZip();
  await addApplicationToZip(zip, app, folder);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export function zipResponse(data: Uint8Array, filename: string) {
  return new Response(data as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
