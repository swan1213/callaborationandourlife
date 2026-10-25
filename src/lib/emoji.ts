// Emoji checks shared by the chat page and the chat API. Client-safe: no server imports.

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|️|‍)+$/u;

const graphemes = (s: string) => [...new Intl.Segmenter().segment(s)].length;

/** True for a short message made only of emoji (up to 3), which the chat shows large without a bubble. */
export function isEmojiOnly(text: string) {
  const t = text.replace(/\s/g, "");
  return !!t && EMOJI_ONLY.test(t) && graphemes(t) <= 3;
}

/** True for exactly one emoji (a reaction). */
export function isSingleEmoji(text: string) {
  return text.length <= 32 && EMOJI_ONLY.test(text) && graphemes(text) === 1;
}
