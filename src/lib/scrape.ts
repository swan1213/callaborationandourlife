import * as cheerio from "cheerio";
import { HttpError } from "./auth";

export type ScrapedJob = {
  url: string;
  title: string;
  company: string;
  location: string;
  text: string;
  /** True when the company came from the posting's JobPosting structured data (reliable employer name). */
  companyTrusted?: boolean;
};

const MAX_TEXT = 20000;

function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Invalid job URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "Job URL must be http(s)");
  const host = url.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith("[");
  if (privateHost) throw new HttpError(400, "Job URL must be a public website");
  return url;
}

function htmlToText(html: string) {
  const $ = cheerio.load(`<div>${html}</div>`);
  $("br").replaceWith("\n");
  $("li").each((_, el) => {
    $(el).prepend("• ").append("\n");
  });
  $("p,div,h1,h2,h3,h4,h5,h6,ul,ol,tr").each((_, el) => {
    $(el).append("\n");
  });
  return clean($.root().text());
}

function clean(text: string) {
  return text
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

type JsonLd = Record<string, unknown>;

function findJobPosting(node: unknown): JsonLd | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as JsonLd;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj;
  if (obj["@graph"]) return findJobPosting(obj["@graph"]);
  return null;
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in v) return str((v as JsonLd).name);
  return "";
}

function locationOf(job: JsonLd): string {
  const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
  const addr = (loc as JsonLd | undefined)?.address as JsonLd | undefined;
  const parts = addr ? [addr.addressLocality, addr.addressRegion, addr.addressCountry].map(str) : [];
  const joined = parts.filter(Boolean).join(", ");
  if (joined) return joined;
  return job.jobLocationType === "TELECOMMUTE" ? "Remote" : "";
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function getJson(url: string): Promise<JsonLd | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": UA, Accept: "application/json" } });
    return res.ok ? ((await res.json()) as JsonLd) : null;
  } catch {
    return null;
  }
}

/**
 * Workable job pages are rendered by JavaScript (the HTML has no job text), so read the posting from Workable's
 * public API instead. Links: apply.workable.com/{account}/j/{code} or {account}.workable.com/j/{code}.
 */
async function scrapeWorkable(url: URL): Promise<ScrapedJob | null> {
  const host = url.hostname.toLowerCase();
  if (!host.endsWith("workable.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const j = parts.indexOf("j");
  const code = j >= 0 ? parts[j + 1] : "";
  const account = host === "apply.workable.com" ? (j > 0 ? parts[j - 1] : "") : host.split(".")[0];
  if (!account || !code || !/^[\w-]+$/.test(account) || !/^[\w-]+$/.test(code)) return null;

  const base = `https://apply.workable.com/api/v2/accounts/${account}`;
  const job = await getJson(`${base}/jobs/${code}`);
  if (!job?.description) return null;
  const org = await getJson(`https://apply.workable.com/api/v1/accounts/${account}`);

  const loc = (job.location ?? {}) as JsonLd;
  const location = [str(loc.city), str(loc.region), str(loc.country)].filter(Boolean).join(", ");
  const where = [job.workplace === "remote" || job.remote ? "Remote" : str(job.workplace), location].filter(Boolean).join(" · ");
  const section = (title: string, html: unknown) => (str(html) ? `\n\n${title}\n${htmlToText(str(html))}` : "");
  const text = clean(
    `${str(job.title)}${where ? `\n${where}` : ""}\n\n${htmlToText(str(job.description))}` +
      section("Requirements", job.requirements) +
      section("Benefits", job.benefits)
  );
  const company = str(org?.name);
  return {
    url: url.toString(),
    title: str(job.title),
    company,
    location: [job.remote ? "Remote" : "", location].filter(Boolean).join(", "),
    text: text.slice(0, MAX_TEXT),
    companyTrusted: !!company,
  };
}

const CLOSED_JOB = "This job posting is closed or no longer exists, so nothing was generated. Check the link, or paste the job description manually.";

/**
 * Greenhouse job from the link alone: {board}/jobs/{id} on greenhouse.io, the embed URL (?for=board&token=id),
 * or a company careers page with ?gh_jid={id} (board unknown until the page is read).
 */
function greenhouseRef(url: URL): { board: string; id: string } | null {
  const host = url.hostname.toLowerCase();
  const q = url.searchParams;
  if (host.endsWith("greenhouse.io")) {
    if (q.get("for") && /^\d+$/.test(q.get("token") ?? "")) return { board: q.get("for")!, id: q.get("token")! };
    const m = url.pathname.match(/^\/([\w-]+)\/jobs\/(\d+)/);
    if (m && m[1] !== "embed") return { board: m[1], id: m[2] };
  }
  const id = q.get("gh_jid") ?? "";
  return /^\d+$/.test(id) ? { board: "", id } : null;
}

/** Board name from a careers page that embeds a Greenhouse board (job_board/js?for=acme, job_app?for=acme, ...). */
function greenhouseBoardIn(html: string) {
  return html.match(/greenhouse\.io\/embed\/job_(?:board|app)(?:\/js)?\?(?:[^"'\s]*&)?for=([\w-]+)/i)?.[1] ?? "";
}

/**
 * Greenhouse posting from its public API. A job the API does not know is closed (Greenhouse pages then show the
 * board, careers pages the company's generic text), so it is refused instead of generating from the wrong page.
 * Returns null when the API could not be reached.
 */
async function scrapeGreenhouse(url: URL, board: string, id: string): Promise<ScrapedJob | null> {
  let res: Response;
  try {
    res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${id}`, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (res.status === 404) throw new HttpError(422, CLOSED_JOB);
  if (!res.ok) return null;
  const job = (await res.json().catch(() => null)) as JsonLd | null;
  // content is escaped HTML ("&lt;p&gt;..."): unescape it, then convert to text.
  const text = htmlToText(cheerio.load(`<div>${str(job?.content)}</div>`).root().text());
  if (text.length < 200) throw new HttpError(422, CLOSED_JOB);
  const title = str(job?.title);
  const location = str(job?.location);
  const company = str(job?.company_name);
  return {
    url: url.toString(),
    title,
    company,
    location,
    text: clean(`${title}${location ? `\n${location}` : ""}\n\n${text}`).slice(0, MAX_TEXT),
    companyTrusted: !!company,
  };
}

/** Words a real job description almost always has; plain page text needs a few of them to count as one. */
const JOB_SIGNALS = [
  /\bresponsibilit/i,
  /\brequirements?\b/i,
  /\bqualifications?\b/i,
  /\bwhat you(?:'|’)?ll (?:do|bring|need)\b|\byou will\b/i,
  /\b(?:\d+\+? )?years? of (?:\w+ ){0,3}experience\b|\bexperience (?:with|in)\b/i,
  /\bskills\b/i,
  /\babout the (?:role|job|position|team)\b|\bjob description\b|\bthe role\b/i,
  /\b(?:full[- ]time|part[- ]time|contract|salary|compensation|benefits)\b/i,
];

function looksLikeJobDescription(text: string) {
  return JOB_SIGNALS.filter((re) => re.test(text)).length >= 3;
}

export async function scrapeJob(rawUrl: string): Promise<ScrapedJob> {
  const url = assertPublicUrl(rawUrl.trim());

  // Job boards whose pages need JavaScript: read their public posting APIs.
  const fromApi = await scrapeWorkable(url);
  if (fromApi && fromApi.text.length > 200) return fromApi;
  const gh = greenhouseRef(url);
  if (gh?.board) {
    const job = await scrapeGreenhouse(url, gh.board, gh.id);
    if (job) return job;
  }

  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    throw new HttpError(
      422,
      `Could not fetch the job page (${e instanceof Error ? e.message : "error"}). Paste the job description manually instead.`
    );
  }

  // Careers page with an embedded Greenhouse board (?gh_jid=): the job is loaded by JavaScript, so read it from the API.
  if (gh && !gh.board) {
    const board = greenhouseBoardIn(html);
    const job = board ? await scrapeGreenhouse(url, board, gh.id) : null;
    if (job) return job;
  }

  const $ = cheerio.load(html);

  // 1) Structured data (Greenhouse, Lever, Workday, LinkedIn, Indeed, most ATSs)
  let posting: JsonLd | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (posting) return;
    try {
      posting = findJobPosting(JSON.parse($(el).contents().text()));
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  if (posting) {
    const p = posting as JsonLd;
    const text = htmlToText(str(p.description));
    if (text.length > 200) {
      return {
        url: url.toString(),
        title: str(p.title),
        company: str(p.hiringOrganization),
        location: locationOf(p),
        text: text.slice(0, MAX_TEXT),
        companyTrusted: !!str(p.hiringOrganization),
      };
    }
  }

  // 2) Fallback: readable page text
  const title = $('meta[property="og:title"]').attr("content") || $("title").text() || "";
  const site = $('meta[property="og:site_name"]').attr("content") || "";
  $("script,style,noscript,svg,nav,footer,header,form,iframe,button").remove();
  const main = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const text = htmlToText(main.html() || "");
  if (text.length < 200) {
    throw new HttpError(
      422,
      "The job page did not contain readable text (it may require JavaScript or login). Paste the job description manually instead."
    );
  }
  // Text without the usual job description content (a careers or listing page, a closed job): nothing to tailor to.
  if (!looksLikeJobDescription(text)) {
    throw new HttpError(
      422,
      "No job description was found on this page (the job may be closed, or the page lists jobs instead of describing one), so nothing was generated. Paste the job description manually instead."
    );
  }
  return { url: url.toString(), title: clean(title), company: clean(site), location: "", text: text.slice(0, MAX_TEXT) };
}
