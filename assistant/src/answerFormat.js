// The answer format written by the prompt in server/prompts.cjs: ANSWER / KEY POINTS / FILES / MOOD / MEANING
// sections. Shared by the app (live answers) and the server (answers sent to TailorBid's Interview History), so the
// format is read the same way everywhere. Keep this file free of imports: the server loads it with require().

const SECTIONS = { MOOD: 'mood', MEANING: 'meaning', ANSWER: 'answer', 'KEY POINTS': 'keyPoints', FILES: 'files' };

// Splits the model output into its sections. Works in any section order and while the text is still streaming in.
export function parseAnswer(text) {
  const result = { mood: '', meaning: '', answer: '', keyPoints: '', files: '' };
  const headers = [...text.matchAll(/^(MOOD|MEANING|ANSWER|KEY POINTS|FILES):/gim)];
  headers.forEach((h, i) => {
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    result[SECTIONS[h[1].toUpperCase()]] = text.slice(h.index + h[0].length, end).trim();
  });
  return result;
}

// The words to say. Text without an ANSWER section (an older or malformed answer) is shown whole.
export const spokenAnswer = (text) => parseAnswer(text).answer || text.trim();

/* ---------- plain spoken English ---------- */

// The prompt asks for spoken English, but written-English words still slip in now and then. These
// rewrites fix them without another model call. They must be safe in any sentence: when unsure, leave it.
// "is/are/am" is only contracted before words that keep it correct ("that's what it is" must stay).
const CONTRACT_BEFORE = String.raw`(?=(?:not|going|really|pretty|very|so|all|still|also|just|now|kind|a|an|the|\w+ing)\b)`;
const VERB_ENDINGS = { e: 'use', es: 'uses', ed: 'used', ing: 'using' };
const PLAIN = [
  [/\bin order to\b/gi, 'to'],
  [/\bprior to\b/gi, 'before'],
  [/\b(?:utili[sz]|leverag)(e|es|ed|ing)\b/gi, (end) => VERB_ENDINGS[end.toLowerCase()]],
  [/\bapproximately\b/gi, 'about'],
  [/\bnumerous\b/gi, 'a lot of'],
  [/\ba (?:wide )?(?:range|variety|array) of\b/gi, 'all kinds of'],
  [/\bI believe that\b/g, 'I think'],
  [/\bI(?:'m| am) passionate about\b/g, 'I really like'],
  [/\bpassionate about\b/gi, 'really into'],
  [/\bI(?:'d| would) be happy to\b/g, 'I can'],
  [/\bin my previous role\b/gi, 'at my last job'],
  [/\bin my current role\b/gi, 'at my current job'],
  // Contractions: people almost never say the long forms out loud.
  [new RegExp(String.raw`\bI am ${CONTRACT_BEFORE}`, 'g'), "I'm "],
  [new RegExp(String.raw`\b(it|that|there|what|here|he|she) is ${CONTRACT_BEFORE}`, 'gi'), (w) => `${w}'s `],
  [new RegExp(String.raw`\b(you|we|they) are ${CONTRACT_BEFORE}`, 'gi'), (w) => `${w}'re `],
  [/\bI have been\b/g, "I've been"],
  [/\b(do|does|did|is|are|was|were|have|has|had|would|could|should) not\b/gi, (w) => `${w}n't`],
  [/\bwill not\b/gi, "won't"],
  [/\bcan ?not\b/gi, "can't"],
];

// Stock openers at the start of a sentence line (after an optional [cue]). '' drops the phrase.
const OPENERS = [
  [/^(?:that's a |what a )?(?:great|good|excellent|interesting|fantastic) question(?=[.!,]|$)[.!,]*\s*/i, ''],
  [/^I'm glad you asked(?: that)?(?=[.!,]|$)[.!,]*\s*/i, ''],
  [/^(?:additionally|furthermore|moreover|in addition),\s*/i, 'Also, '],
  [/^(?:with that being said|that being said|having said that),\s*/i, 'But '],
  [/^(?:ultimately|overall|all in all|in summary|to summarize|in conclusion|at the end of the day),\s*/i, ''],
  [/^(?:certainly|absolutely)(?=[,.!])/i, 'Yeah'],
  [/^it(?:'s| is) (?:worth noting|worth mentioning|important to note) that\s+/i, ''],
];

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A sentence too long to say in one breath is split where people pause anyway: ", and" / ", but" / ", so",
// when a new subject follows ("…, and I…"), so both halves are whole sentences. Questions are left alone
// (the first half would lose its "?"). The first such point after a few words is used, so it doesn't
// move while the sentence streams in.
const MAX_SENTENCE_WORDS = 16;
const SPLIT_AT =
  /, (?:and|but|so) (?=(?:I|I'm|I'd|I've|we|they|he|she|it|it's|that|this|the|my|our|their|there|then|now|you)\b)/g;
function splitLong(sentence) {
  if (sentence.split(/\s+/).length <= MAX_SENTENCE_WORDS || sentence.trimEnd().endsWith('?')) return sentence;
  const at = [...sentence.matchAll(SPLIT_AT)].find(
    (m) => sentence.slice(0, m.index).split(/\s+/).length >= 6 && sentence.slice(m.index).split(/\s+/).length >= 5,
  );
  if (!at) return sentence;
  const rest = sentence.slice(at.index + 2);
  return `${sentence.slice(0, at.index)}.\n${splitLong(capitalize(rest))}`;
}
// "In order to" → "To": keep a capital letter where the original had one.
const keepCase = (from, to) => (/^[A-Z]/.test(from) ? capitalize(to) : to);

function plainLine(line) {
  const [, cue, rest] = line.match(/^(\s*(?:\[[^\]]*\]\s*)?)(.*)$/);
  let text = rest;
  for (const [re, to] of OPENERS) text = text.replace(re, to);
  if (text !== rest) text = capitalize(text);
  for (const [re, to] of PLAIN) {
    text = text.replace(re, (m, ...groups) => keepCase(m, typeof to === 'function' ? to(groups[0]) : to));
  }
  // One sentence per line: a semicolon becomes a new sentence.
  text = text.replace(/;\s+(\w)/g, (_, c) => `.\n${c.toUpperCase()}`);
  text = text
    .split('\n')
    .map((s) => splitLong(s.trimEnd()))
    .join('\n');
  return rest && !text && !cue.trim() ? null : cue + text; // null: the whole line was a stock phrase
}

/**
 * The model output with its ANSWER section rewritten into plain spoken English. Other sections are kept.
 * Safe to run on a partial answer while it streams in: run it on the whole text received so far each time.
 */
export function humanizeAnswer(text) {
  const start = text.match(/^ANSWER:/im);
  const from = start ? start.index + start[0].length : 0;
  if (!start && /^(MOOD|MEANING|KEY POINTS|FILES):/im.test(text)) return text;
  const next = text.slice(from).search(/^(MOOD|MEANING|KEY POINTS|FILES):/im);
  const to = next === -1 ? text.length : from + next;
  const body = text
    .slice(from, to)
    .split('\n')
    .map(plainLine)
    .filter((line) => line !== null)
    .join('\n');
  return text.slice(0, from) + body + text.slice(to);
}
