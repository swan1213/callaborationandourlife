// Client-safe resume / cover letter design definitions, shared by the HTML preview, DOCX and PDF renderers.

/** Every id a profile or application may have stored. All of them render with the prompt layout below. */
export const DESIGN_IDS = ["ats", "ats-serif", "standard", "classic", "modern", "executive", "professional", "elegant", "banner"] as const;
export type DesignId = (typeof DESIGN_IDS)[number];
/** New profiles start with ATS Clean. */
export const DEFAULT_DESIGN: DesignId = "ats";

/** The two looks the picker offers. The resume prompt (Settings) allows no colour, serif type, banners or tinted bars. */
export type LookId = "ats" | "ats-serif";

/**
 * Resume layout from the resume prompt: US Letter, 0.55" margins, Calibri, black text, one column, no tables,
 * text boxes, icons or colour; left-aligned text, uppercase section headings with thin black rules.
 */
export type AtsSpec = {
  id: LookId;
  docxFont: string;
  cssFont: string;
  /** Name block alignment. */
  align: "left" | "center";
  resume: AtsResumeLayout;
};

/** Resume type sizes and spacing (pt), shared by the DOCX, PDF and HTML preview. */
export type AtsResumeLayout = {
  marginIn: number;
  name: number;
  headline: number;
  contact: number;
  heading: number;
  title: number;
  /** Company / location / dates line. */
  meta: number;
  body: number;
  bullet: number;
  /** Space before the first section heading, before the others, and after each heading. */
  firstSectionBefore: number;
  sectionBefore: number;
  sectionAfter: number;
  bulletAfter: number;
  /** Space between jobs, projects and schools. */
  entryGap: number;
  /** Rule colour (hex, no "#"), under the header and each section heading. */
  rule: string;
  sections: { summary: string; skills: string; experience: string; projects: string; education: string };
};

const PROMPT_LAYOUT: AtsResumeLayout = {
  marginIn: 0.55,
  name: 19,
  headline: 10,
  contact: 8.5,
  heading: 10.5,
  title: 9.7,
  meta: 9,
  body: 9.5,
  bullet: 9.2,
  firstSectionBefore: 5,
  sectionBefore: 6,
  sectionAfter: 2.5,
  bulletAfter: 1.5,
  entryGap: 4,
  rule: "000000",
  sections: { summary: "Professional Summary", skills: "Core Skills", experience: "Professional Experience", projects: "Selected Projects", education: "Education" },
};

const SANS_CSS = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";

export const ATS_SPECS: Record<LookId, AtsSpec> = {
  ats: { id: "ats", docxFont: "Calibri", cssFont: SANS_CSS, align: "left", resume: PROMPT_LAYOUT },
  "ats-serif": { id: "ats-serif", docxFont: "Calibri", cssFont: SANS_CSS, align: "center", resume: PROMPT_LAYOUT },
};

/** Older designs → the look they now render as (centered-name designs → Centered, the rest → ATS Clean). */
const LOOK_OF: Record<DesignId, LookId> = {
  ats: "ats",
  "ats-serif": "ats-serif",
  standard: "ats-serif",
  classic: "ats",
  modern: "ats",
  executive: "ats-serif",
  professional: "ats",
  elegant: "ats-serif",
  banner: "ats",
};

export function isDesignId(v: unknown): v is DesignId {
  return typeof v === "string" && (DESIGN_IDS as readonly string[]).includes(v);
}

/** The look a stored design id renders as; missing / unknown ids (older records) → Centered, like the old Standard. */
export function lookOf(id: unknown): LookId {
  return isDesignId(id) ? LOOK_OF[id] : "ats-serif";
}

/** The layout spec for a stored design id (every id has one). */
export function atsSpec(id: unknown): AtsSpec {
  return ATS_SPECS[lookOf(id)];
}

export type DesignInfo = { id: LookId; name: string; resumeBlurb: string; letterBlurb: string };

export const DESIGNS: DesignInfo[] = [
  {
    id: "ats",
    name: "ATS Clean",
    resumeBlurb: "One-page US Letter, Calibri, 0.55\" margins, black text, name on the left, skills by category.",
    letterBlurb: "US business letter in Calibri: letterhead with the name on the left, date, recipient, subject line.",
  },
  {
    id: "ats-serif",
    name: "ATS Centered",
    resumeBlurb: "The same one-page layout with the name and contact line centered.",
    letterBlurb: "The same US business letter with a centered letterhead.",
  },
];

/** Picker / label info for a stored design id. */
export const designInfo = (id: unknown) => DESIGNS.find((d) => d.id === lookOf(id))!;

/** Names of every stored design id, including the retired ones, for analytics on older applications. */
export const DESIGN_NAMES: Record<DesignId, string> = {
  ats: "ATS Clean",
  "ats-serif": "ATS Centered (was ATS Traditional)",
  standard: "Standard",
  classic: "Classic",
  modern: "Modern",
  executive: "Executive",
  professional: "Professional",
  elegant: "Elegant",
  banner: "Banner",
};
