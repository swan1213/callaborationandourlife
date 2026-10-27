// Pay stated in a job description, shown highlighted at the top of the job description (page and DOCX).
// Client-safe: no server imports.

const CUR = String.raw`(?:US\$|CA\$|C\$|AU\$|A\$|\$|£|€|USD ?|CAD ?|GBP ?|EUR ?|AUD ?)`;
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;
const AMOUNT = String.raw`${CUR}\s?(?:${NUM})(?:\s?[kK]\b)?`;
const PERIOD = String.raw`(?:\s*(?:per|\/|an|a)\s*(?:year|yr|annum|hour|hr|month|mo|week|wk)\b|\s*(?:annually|yearly|hourly|monthly|weekly)\b)`;
const SALARY = new RegExp(
  String.raw`(${AMOUNT})(${PERIOD})?(?:\s*(?:-|–|—|to)\s*((?:${CUR})?\s?(?:${NUM})(?:\s?[kK]\b)?))?(\s*(?:USD|CAD|GBP|EUR|AUD)\b)?(${PERIOD})?`,
  "g"
);
/** Lines about pay (not funding, revenue or prices). */
const PAY_WORDS = /\b(salary|salaries|compensation|pays?|paid|wages?|base|range|OTE|earn|earnings|hourly|annual(ly)?|per (year|hour|annum)|rate)\b|\/\s?(yr|hr|hour|year)\b/i;
const NOT_PAY = /\b(raised|funding|funded|revenue|valuation|billion|investors?|series [a-e]|ARR|budget|customers? save|price|pricing|stipend for)\b/i;

const PERIOD_WORD: Record<string, string> = { yr: "year", year: "year", annum: "year", annually: "year", yearly: "year", hr: "hour", hour: "hour", hourly: "hour", month: "month", mo: "month", monthly: "month", week: "week", wk: "week", weekly: "week" };

function value(s: string) {
  const n = Number(s.replace(/[^\d.]/g, ""));
  return /k\s*$/i.test(s.trim()) ? n * 1000 : n;
}

/**
 * The pay range(s) a job description states, e.g. "$120,000 – $150,000 per year" (several ranges, as for location
 * tiers, joined with "; "), or "" when it states none. Amounts count only on lines that talk about pay.
 */
export function findSalary(text: string): string {
  const found: string[] = [];
  for (const line of (text || "").split("\n")) {
    if (!PAY_WORDS.test(line) || NOT_PAY.test(line)) continue;
    for (const m of line.matchAll(SALARY)) {
      const [, from, firstPeriod, toRaw, code, lastPeriod] = m;
      const word = (lastPeriod || firstPeriod)?.trim().toLowerCase().replace(/^(per\s+|\/\s*|an\s+|a\s+)/, "") ?? "";
      const period = PERIOD_WORD[word] ?? "";
      const low = value(from);
      // "$120k-150" → "$120k – 150k"
      const to = toRaw && !/[kK]/.test(toRaw) && /[kK]/.test(from) && value(toRaw) < 1000 ? `${toRaw.trim()}k` : toRaw;
      const high = to ? value(to) : low;
      // Pay-sized numbers only: hourly 7 to 1,000; otherwise 1,000 to 2 million (a lone "$50" isn't a salary).
      const hourly = period === "hour" || (!period && low < 1000 && /\b(hour|hourly|hr)\b/i.test(line));
      const ok = hourly ? low >= 7 && low <= 1000 : low >= 1000 && low <= 2_000_000 && high <= 5_000_000;
      if (!ok || (to && high < low)) continue;
      const range = to ? `${from.trim()} – ${to.trim()}` : from.trim();
      const label = `${range}${code ? ` ${code.trim()}` : ""}${period ? ` per ${period}` : hourly ? " per hour" : ""}`.replace(/\s+/g, " ");
      if (!found.includes(label)) found.push(label);
    }
    if (found.length >= 3) break;
  }
  return found.join("; ");
}

/** JobPosting structured data's baseSalary → "$120,000 – $150,000 per year" ("" when absent). */
export function salaryFromJobPosting(base: unknown): string {
  if (!base || typeof base !== "object") return "";
  const b = base as { currency?: unknown; value?: unknown };
  const v = (typeof b.value === "object" && b.value ? b.value : {}) as { value?: unknown; minValue?: unknown; maxValue?: unknown; unitText?: unknown };
  const num = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" && x.trim() && !Number.isNaN(Number(x)) ? Number(x) : null);
  const min = num(v.minValue) ?? num(v.value) ?? num(b.value);
  const max = num(v.maxValue);
  if (!min) return "";
  const cur = typeof b.currency === "string" ? b.currency.toUpperCase() : "USD";
  const sym = { USD: "$", CAD: "CA$", AUD: "A$", GBP: "£", EUR: "€" }[cur];
  const fmt = (n: number) => `${sym ?? ""}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}${sym ? "" : ` ${cur}`}`;
  const unit = typeof v.unitText === "string" ? v.unitText.toLowerCase() : "";
  const period = { year: "year", hour: "hour", month: "month", week: "week", day: "day" }[unit];
  return `${fmt(min)}${max && max !== min ? ` – ${fmt(max)}` : ""}${period ? ` per ${period}` : ""}`;
}
