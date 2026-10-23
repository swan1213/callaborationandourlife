// Questions about how the candidate is answering right now (using AI or ChatGPT to answer, reading from a screen,
// someone helping): the assistant suggests nothing for these, and the candidate answers in their own words.
// Shared by the app (no request is made) and the server (a second check). Keep this file free of imports: the
// server loads it with require().
//
// Questions about AI as a skill ("How do you use Copilot in your daily work?") are normal questions and still
// get an answer: only questions about this interview match.

const PATTERNS = [
  // "Are you using AI to answer these questions?", "Did you get help from ChatGPT for that answer?"
  /\b(using|use|used|get|got|getting|have|having)\s+(an?\s+)?(ai|a\.i\.|chat ?gpt|gpt|copilot|claude|gemini|an? (ai )?(tool|assistant|app)|any (ai |other )?(tools?|help|assistance)|help|assistance|notes)\b[^.?!]{0,40}\b(answer|answering|respond|responding|reply|replying|these questions|this interview|this call|right now)\b/,
  // "Are you reading from a screen?", "Are you looking at something?", "Is someone feeding you answers?"
  /\bare you (reading|looking at (something|another|a (screen|script|note|paper))|getting (help|answers)|being (helped|fed|told)|typing)\b/,
  /\b(reading|read) (it |this |that )?(from|off) (a|the|your|another|some) (screen|script|notes?|paper|monitor|tab|document)\b/,
  /\b(someone|somebody|anyone|a person) (else )?(is )?(in the room|helping you|feeding you|with you|telling you|whispering)\b/,
  // "It sounds like you might be using AI", "you sound like you're reading"
  /\bsounds? (like|as if) (you('re| are)|you might be|you may be) (reading|using (ai|chat ?gpt|a tool|some(thing| kind of tool)))\b/,
  /\b(ai|chat ?gpt)[- ](generated|written|assisted) (answers?|responses?)\b/,
];

/** True when the interviewer is asking about how the candidate is answering (see the comment above). */
export function asksAboutAnswering(text) {
  const t = String(text || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ');
  return PATTERNS.some((re) => re.test(t));
}
