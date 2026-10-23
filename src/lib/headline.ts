/**
 * Role-only headline for the resume header: drops company, team, tech stack and location qualifiers.
 * "Senior Software Engineer, Fullstack"            → "Senior Software Engineer"
 * "Full-Stack Software Engineer, Reinforcement ..." → "Full-Stack Software Engineer"
 * "Software Engineer - Platform (Go/Kubernetes)"   → "Software Engineer"
 * "Senior Backend Engineer at Stripe"              → "Senior Backend Engineer"
 */
export function roleOnly(title: string) {
  let t = (title || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  t = t.replace(/\s*[([{].*$/, ""); // (Go/Kubernetes), [Remote]
  t = t.replace(/\s+(at|@|with|for)\s+.+$/i, ""); // at Stripe
  t = t.split(/\s*[,|/–—:;]\s*|\s+-\s+/)[0]; // , Fullstack | - Platform | / Remote
  return t.trim() || (title || "").trim();
}

/** The role shown under the candidate's name when the profile has no professional title. */
export const RESUME_HEADLINE = "Senior Software Engineer";

/** Headline under the name on a resume: the profile's professional title (stored at generation), else the default. */
export const resumeHeadline = (r: { titleLine?: string }) => r.titleLine?.trim() || RESUME_HEADLINE;
