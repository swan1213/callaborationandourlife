// Windows Live Captions shows a rolling block of recent text that is rewritten as speech continues.
// These helpers find the part that is new since we last took ("committed") text from it.

const normalize = (s) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

export const splitSentences = (text) =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Returns the sentences in `current` that come after the point where `committed` ended.
 *
 * Finds where one of the last few committed sentences appears in `current`, and requires the
 * sentence before it to match too, so a repeated phrase ("Great.", "Okay.") is not mistaken
 * for the old one. The committed last sentence may have been unfinished and since rewritten,
 * which is why earlier committed sentences are tried as anchors as well.
 */
export function newText(committed, current) {
  const old = splitSentences(committed).map(normalize);
  const sentences = splitSentences(current);
  const now = sentences.map(normalize);

  for (let k = old.length - 1; k >= Math.max(0, old.length - 4); k--) {
    for (let j = now.length - 1; j >= 0; j--) {
      // j === 0 or k === 0: the sentence before has scrolled away, so it can't be checked.
      if (now[j] === old[k] && (j === 0 || k === 0 || now[j - 1] === old[k - 1])) {
        const rest = sentences.slice(j + 1);
        // Matched an older sentence: the ones after it were re-punctuated, so some of `rest` was said already.
        return k < old.length - 2 ? afterSaidSentence(committed, rest) : rest.join(' ');
      }
    }
  }
  return afterSaidSentence(committed, sentences);
}

// Words of the end of the committed text: enough to cover the Live Captions window.
const SAID_WORDS = 80;
const MIN_ANCHOR_WORDS = 4; // "OK." or "All right." are said all the time: never an anchor

/**
 * No sentence matched exactly. Live Captions often re-punctuates text it already showed
 * ("All right, perfect. That's…" becomes "All right. Perfect, that's…"), so compare words, not
 * sentences: what follows the last sentence whose words were all said already (one wrong word
 * allowed in ten, for a recognition fix) is new. Without such a sentence, everything scrolled
 * away and all of it is new.
 */
function afterSaidSentence(committed, sentences) {
  const said = new Set(normalize(committed).split(' ').slice(-SAID_WORDS));
  for (let j = sentences.length - 1; j >= 0; j--) {
    const words = normalize(sentences[j]).split(' ').filter(Boolean);
    if (words.length < MIN_ANCHOR_WORDS) continue;
    const unsaid = words.filter((w) => !said.has(w)).length;
    if (unsaid <= Math.floor(words.length / 10)) return sentences.slice(j + 1).join(' ');
  }
  return sentences.join(' ');
}
