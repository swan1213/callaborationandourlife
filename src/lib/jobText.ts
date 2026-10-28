// Client-safe.

/**
 * Job text as shown: escaped line breaks some postings carry as text ("\n" typed into the employer's HTML) become real
 * ones, and runs of blank lines collapse.
 */
export function tidyJobText(text: string) {
  return fromHtml(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", bull: "•" };

/**
 * Text saved as HTML markup (a posting whose data held escaped HTML, scraped before scrape.ts unescaped it): tags
 * become line breaks and bullets, entities become characters. Plain text is returned as is.
 */
function fromHtml(text: string) {
  if ((text.match(/<\/?(?:p|div|span|br|li|ul|ol|b|strong|em|i|u|a|h[1-6])\b[^>]*>/gi) ?? []).length < 3) return text;
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(?:p|div|li|ul|ol|h[1-6]|tr)>/gi, "\n")
    .replace(/<(?:p|div|ul|ol|h[1-6]|tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n /g, "\n");
}

export type JobBlock =
  | { kind: "title"; text: string; facts: string[] }
  | { kind: "heading"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "para"; text: string };

const BULLET = /^(?:[•\-*·▪●‣◦–—]|\d{1,2}[.)])\s+/;
// Section names postings use, so they read as headings wherever they sit.
const SECTION =
  /^(?:about\b|overview|summary|the (?:role|team|opportunity|position|job)|role|position|job (?:summary|description|details|overview)|responsibilit|duties|key (?:responsibilit|duties|qualification|skills|requirement)|what (?:you|we|you'll|you’ll|we'll|we’ll)\b|who (?:you|we) are|you (?:will|have|are|bring|might)|your (?:role|responsibilit|impact|day|background|skills|experience)|day to day|day-to-day|in this role|qualification|requirement|required|preferred|minimum|basic|must[- ]have|nice[- ]to[- ]have|bonus|pluses|plus if|skills|experience|education|tech(?:nical)? stack|technolog|tools|benefits|perks|compensation|salary|pay\b|why (?:join|you|work|us)|how to apply|our (?:team|culture|values|mission|benefits|stack)|equal (?:opportunity|employment)|eeo|location|working (?:here|at|with)|life at|bonus points)/i;
// Lines a job board adds around the posting, not part of it.
const NOISE = [/^find out how your skills align/i, /click on the tags to select/i, /^apply (?:now|for this job)$/i, /^show (?:more|less)$/i];

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const endsSentence = (s: string) => /[.!?;,]["')\]]?$/.test(s);

/** A short line naming a section: "Responsibilities", "What you'll do:", "About Samsara". */
function isHeading(line: string, strict: boolean) {
  const t = line.replace(/:$/, "");
  if (!t || t.length > 70 || words(t) > 9 || endsSentence(t) || !/^[A-Z0-9"“']/.test(t)) return false;
  if (SECTION.test(t) || line.endsWith(":")) return true;
  // Without a known name, only a short line opening a group of longer lines counts.
  return !strict && words(t) <= 6;
}

/**
 * The posting split into blocks to lay out: its first lines (title, place, type, pay…) as a title with facts, then
 * headings, bullet lists and paragraphs. Lines grouped without blank lines between them read as a list.
 */
export function jobBlocks(text: string): JobBlock[] {
  const groups = tidyJobText(text)
    .split(/\n\s*\n/)
    .map((g) =>
      g
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !NOISE.some((r) => r.test(l))),
    )
    .filter((g) => g.length);
  const blocks: JobBlock[] = [];

  // Title + short facts ("Canada", "Full-time", "$155K/yr - $260K/yr").
  const first = groups[0];
  if (first && first[0].length <= 120 && !endsSentence(first[0]) && first.slice(1).every((l) => l.length <= 50 && !BULLET.test(l))) {
    blocks.push({ kind: "title", text: first[0], facts: first.slice(1) });
    groups.shift();
  }

  for (const g of groups) {
    let run: string[] = [];
    const flush = () => {
      if (!run.length) return;
      // One line, or lines that are each a long paragraph, stay paragraphs; anything else is a list.
      const plain = run.every((l) => !BULLET.test(l));
      if (plain && (run.length === 1 || run.every((l) => l.length > 220))) run.forEach((l) => blocks.push({ kind: "para", text: l }));
      else blocks.push({ kind: "bullets", items: run.map((l) => l.replace(BULLET, "")) });
      run = [];
    };
    g.forEach((line, i) => {
      // A known section name or "…:" anywhere; a plain short line only when it opens a group (or stands alone) and
      // the line after it is a sentence, not more of the same short lines.
      const next = g[i + 1];
      const opener = i === 0 && (next === undefined || words(next) > 6);
      if (!BULLET.test(line) && isHeading(line, !opener)) {
        flush();
        blocks.push({ kind: "heading", text: line.replace(/:$/, "") });
      } else run.push(line);
    });
    flush();
  }
  return blocks;
}
