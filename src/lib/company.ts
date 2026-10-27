/** Normalised company key: "Acme, Inc." / "ACME Inc" / "acme" → "acme". */
export function companyKey(name: string) {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|srl|bv|pty|pvt|private|holdings?|group)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Company key without spaces, so "Team Snap", "TeamSnap" and a board's "teamsnap" link slug all match. */
export function companyMatchKey(name: string) {
  return companyKey(name).replace(/ /g, "");
}

/** Normalised role: "Sr. Software Engineer (Backend)" → "sr software engineer backend". */
export function roleKey(title: string) {
  return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * The company a job-board link names, before the page is read: jobs.lever.co/teamsnap/… → "teamsnap",
 * acme.wd5.myworkdayjobs.com → "acme". "" for sites whose links don't name the company (LinkedIn, Indeed, own sites).
 */
export function companyFromUrl(url: string) {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return "";
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const first = (u.pathname.split("/").filter(Boolean)[0] ?? "").toLowerCase();
  const slug = (s: string) => decodeURIComponent(s).replace(/[-_.]+/g, " ").trim();
  // Boards with the company as the first path segment.
  if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$|^jobs(\.eu)?\.lever\.co$|^jobs\.ashbyhq\.com$|^apply\.workable\.com$|^jobs\.smartrecruiters\.com$|^jobs\.jobvite\.com$|^ats\.rippling\.com$/.test(host))
    return first && first !== "embed" ? slug(first) : "";
  // Boards with the company as the subdomain.
  const sub = host.match(/^([a-z0-9-]+)\.(?:wd\d+\.myworkdayjobs\.com|bamboohr\.com|breezy\.hr|recruitee\.com|teamtailor\.com|applytojob\.com)$/);
  if (sub) return slug(sub[1]);
  const icims = host.match(/^(?:careers|jobs)-([a-z0-9-]+)\.icims\.com$/);
  return icims ? slug(icims[1]) : "";
}
