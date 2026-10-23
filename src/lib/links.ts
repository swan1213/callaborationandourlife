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

/** Tracking parameters that don't change which job a link points to. */
const TRACKING_PARAM = /^(utm_.*|gh_src|source|src|ref|referrer|trk|fbclid|gclid|lever-.*)$/i;

/**
 * Key for spotting the same job pasted twice. The query string is kept, because many boards put the job in it
 * (Greenhouse embeds `?for=company&token=…`, `?gh_jid=`, `?ashby_jid=`, ADP `?reqId=`); only tracking parameters,
 * the #fragment, a trailing slash and the host's case are ignored.
 */
export function urlKey(u: string) {
  try {
    const url = new URL(u);
    const params = [...url.searchParams].filter(([k]) => !TRACKING_PARAM.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? `?${new URLSearchParams(params)}` : "";
    return `${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}${query}`;
  } catch {
    return u;
  }
}

export const URL_FIELDS = ["linkedin", "github", "website", "portfolio"] as const;
