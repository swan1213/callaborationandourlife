/** "linkedin.com/in/x" → "https://linkedin.com/in/x" (leaves full URLs and empty values alone). */
export function normalizeUrl(v: string) {
  const t = (v || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t) || t.startsWith("www.")) return `https://${t}`;
  return t;
}

/** Display form for documents: no scheme, no "www.", no trailing slash. */
export function displayUrl(v: string) {
  return (v || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/**
 * Parameters that don't change which job a link points to: tracking (utm_…, Jobright's jr_id, Simplify's gh_src,
 * referrers), embedding and display (embed, in_iframe, lang, Dayforce's screen size and time-zone offsets),
 * apply-flow steps, and the search filters a job board leaves on a posting's URL.
 */
const IGNORED_PARAM =
  /^(utm_.*|jr_id|gh_src|source|src|ref|refid|referrer|trk|trackingid|fbclid|gclid|mc_.*|lever-.*|embed|in_iframe|iframe|lang|locale|mobile|width|height|bga|needsredirect|jan1offset|jun1offset|step|stepname|productive_apply_.*|jobsite|mode|iis|nl|fr|tm_.*|rb|__tx_annotation|sort_by|start|query|location|location_type|lat|lon|country_short_name|work_type(\[\])?)$/i;
/** Page suffixes that are the same posting: its sign-in or application page. */
const PAGE_SUFFIX = /\/(login|apply|application)$/i;

/**
 * Key for spotting the same job pasted twice. The query string is kept, because many boards put the job in it
 * (Greenhouse embeds `?for=company&token=…`, `?gh_jid=`, `?ashby_jid=`, ADP `?jobId=`); only the parameters above,
 * the #fragment, "www.", a trailing slash or /login · /apply · /application, and letter case in the host and path
 * are ignored.
 */
export function urlKey(u: string) {
  try {
    const url = new URL(u.trim());
    const params = [...url.searchParams].filter(([k]) => !IGNORED_PARAM.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? `?${new URLSearchParams(params)}` : "";
    const host = url.host.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase().replace(/\/+$/, "").replace(PAGE_SUFFIX, "");
    return `${host}${path}${query}`;
  } catch {
    return u.trim();
  }
}

export const URL_FIELDS = ["linkedin", "github", "website", "portfolio"] as const;
