const STARTERS = [
  'what',
  'why',
  'how',
  'when',
  'where',
  'which',
  'who',
  'can you',
  'could you',
  'would you',
  'will you',
  'do you',
  'did you',
  'have you',
  'are you',
  'is there',
  'tell me',
  'tell us',
  'walk me',
  'walk us',
  'describe',
  'explain',
  'give me an example',
  'share',
  // Contractions ("what's" doesn't start with "what ") and small yes/no questions, which Live Captions
  // often shows before it adds the "?": "How's your day going", "Is that okay with you".
  "what's",
  "how's",
  "where's",
  "who's",
  "when's",
  "why's",
  "what're",
  "how're",
  "where're",
  "how'd",
  "what'd",
  'is it',
  'is that',
  'is this',
  'is everything',
  'are we',
  'are there',
  'are they',
  'does that',
  'does it',
  'does this',
  'do we',
  'do they',
  'did it',
  'did that',
  'did we',
  'was it',
  'was that',
  'were you',
  'should we',
  'shall we',
  'can i',
  'can we',
  'could i',
  'could we',
  'may i',
  'would that',
  'will that',
  'any questions',
  'anything else',
  'any other',
];

// Phrases that ask something wherever they appear. Live Captions often adds punctuation late, so
// while someone is still talking a question can sit mid-sentence: "that's great so tell me how you…".
// Only clear asking phrases: a bare "what" or "explain" ("let me explain") counts at a sentence start only.
const MID_SPEECH =
  /\b(can you|could you|would you|will you|tell me|tell us|walk me|walk us|talk me through|how do you|how did you|how would you|how have you|what do you|what did you|what would you|what is your|what's your|what are your|what was your|why did you|why do you|why would you|have you ever|do you have|did you ever|are you familiar|give me an example|i'd like to hear|i would like to hear|i'd love to hear)\b/i;

/**
 * The part of `text` that asks something, from where the question starts to the end, or '' if
 * nothing looks like a question. Used to start answers while the interviewer is still talking.
 */
export function questionPart(text) {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i];
    const plain = stripLeadIns(s.toLowerCase());
    if (s.includes('?') || STARTERS.some((st) => plain.startsWith(st + ' '))) return sentences.slice(i).join(' ');
    const mid = s.match(MID_SPEECH);
    if (mid) return [s.slice(mid.index), ...sentences.slice(i + 1)].join(' ');
  }
  return '';
}

// Cheap heuristic so we don't call the model on every caption line.
export function looksLikeQuestion(text) {
  return text.trim().length >= 8 && questionPart(text) !== '';
}

// Words people put before a question: "So, can you…", "Okay great, tell me…", "And why…".
const LEAD_IN =
  /^(so|okay|ok|well|and|alright|all right|right|now|great|cool|perfect|good|thanks|thank you|um|uh|yeah|then|next)\b[,\s]*/;

function stripLeadIns(sentence) {
  let s = sentence.trim();
  for (let prev = ''; prev !== s;) {
    prev = s;
    s = s.replace(LEAD_IN, '');
  }
  return s;
}

// The answer sections are read in answerFormat.js, which the server shares.
export { humanizeAnswer, parseAnswer, spokenAnswer } from './answerFormat.js';

const words = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

export const wordCount = (text) => words(text).length;

// Words that can trail a question without changing what is being asked.
const FILLER = new Set([
  'please',
  'now',
  'today',
  'again',
  'so',
  'then',
  'here',
  'quickly',
  'briefly',
  'first',
  'too',
  'okay',
  'ok',
]);

/**
 * True when an early ("draft") answer written for `draftFor` still fits the finished `finalText`:
 * the same words, or the same words plus filler like "please" / "today".
 * Anything more (e.g. "tell me about" → "tell me about your weaknesses") needs a new answer.
 */
export function sameQuestion(draftFor, finalText) {
  const a = words(draftFor);
  const b = words(finalText);
  if (!a.length || b.length < a.length) return false;
  if (a.some((w, i) => b[i] !== w)) return false;
  return b.slice(a.length).every((w) => FILLER.has(w));
}

/**
 * True when `text` continues the question a draft was written for: the draft's words come first,
 * except its last word, which Live Captions often finishes or corrects ("experi" → "experience").
 */
export function extendsQuestion(draftFor, text) {
  const a = words(draftFor);
  const b = words(text);
  if (!a.length || b.length < a.length) return false;
  return a.slice(0, -1).every((w, i) => b[i] === w);
}

// The FILES section ("- src/cart.js | useCart") as [{ path, symbol }]; empty when "none".
export function parseFileRefs(files) {
  return files
    .split('\n')
    .map((line) => line.replace(/^[\s\-*•]+/, '').trim())
    .filter((line) => line && !/^none\b/i.test(line))
    .map((line) => {
      const [path, symbol = ''] = line.split('|').map((x) => x.trim().replace(/^`|`$/g, ''));
      return { path, symbol: symbol.replace(/\(\)$/, '') };
    })
    .filter((r) => /[\w-]+\.\w+$/.test(r.path))
    .slice(0, 3);
}

// Early ("draft") answers while the interviewer is still talking:
// - a question of at least DRAFT_NOW_WORDS words is answered right away, without waiting for a pause;
// - shorter ones wait for a short gap between words (DRAFT_PAUSE_MS);
// - while the question keeps growing, a fresher draft is written once REDRAFT_MIN_WORDS new words
//   have arrived, at most every REDRAFT_EVERY_MS, so the answer keeps up with what is being asked.
const DRAFT_PAUSE_MS = 250;
const DRAFT_NOW_WORDS = 5;
const REDRAFT_MIN_WORDS = 4;
const REDRAFT_EVERY_MS = 1500;
const MIN_DRAFT_GAP_MS = 700; // never restart drafts faster than this (e.g. Live Captions rewriting words)

/**
 * How long to wait (ms) before writing an early answer for `pending`, the words being spoken right now,
 * or null while they don't ask anything yet. `current` is what the shown answer was written for
 * ({ key, draft }); `sinceLastMs` is the time since the latest draft started. The caller restarts the
 * wait on every new word, so each wait is measured from the latest word.
 */
export function draftDelay(pending, current, sinceLastMs) {
  const asked = wordCount(questionPart(pending));
  if (asked < 4) return null;
  const growing = current.draft && extendsQuestion(current.key, pending);
  let wait;
  if (!growing)
    wait = asked >= DRAFT_NOW_WORDS ? 0 : DRAFT_PAUSE_MS; // a new question
  else if (wordCount(pending) - wordCount(current.key) >= REDRAFT_MIN_WORDS) wait = REDRAFT_EVERY_MS - sinceLastMs;
  else wait = DRAFT_PAUSE_MS; // only a word or two more: update at the next short gap
  return Math.max(0, wait, MIN_DRAFT_GAP_MS - sinceLastMs);
}

const MAX_TURN_LINES = 4;

/**
 * The interviewer's turn to answer, ending with `line` ({ id, text }): every earlier caption line that no
 * finished answer has covered yet (ids after `answeredUpTo`), so no question in the turn is skipped, even a
 * small one. When all earlier lines are covered, just the line before, since a question often runs across
 * a line break. At most MAX_TURN_LINES lines, so a long monologue stays focused on its end.
 */
export function turnLines(segments, line, answeredUpTo) {
  const before = segments.filter((s) => s.id < line.id && s.text);
  const open = before.filter((s) => s.id > answeredUpTo);
  return [...(open.length ? open : before.slice(-1)).slice(-(MAX_TURN_LINES - 1)), line];
}

// True when a line before `line` asks something no finished answer has covered yet.
export const openQuestionBefore = (segments, line, answeredUpTo) =>
  segments.some((s) => s.id < line.id && s.id > answeredUpTo && looksLikeQuestion(s.text));
