import { useRef } from 'react';
import { draftDelay, looksLikeQuestion, openQuestionBefore, sameQuestion, turnLines, wordCount } from './questions.js';
import { matchCommonQuestion } from './commonQuestions.js';
import { useEvent } from './useEvent.js';

const joinText = (lines) =>
  lines
    .map((s) => s.text)
    .join(' ')
    .trim();

/**
 * Decides when to answer: from finished caption lines, and early ("draft") answers from words still
 * being spoken. `answer` is from useAnswer; `segments` are the caption lines on screen.
 *
 * Every question gets answered, even small ones: each answer covers all the interviewer's lines since
 * the last answer that finished, so a turn like "Can you hear me? Great. So tell me about yourself"
 * gets both parts answered, and a question whose answer was cut off by the next one is carried over.
 */
export function useAutoAnswer({ answer, segments, enabled, settings }) {
  const partialTimer = useRef(null);
  const lastDraftAt = useRef(0); // when the latest early answer was started
  const answeredUpTo = useRef(0); // id of the last caption line a finished answer covered
  const latestAsk = useRef(null); // the latest automatic answer: resolves true once it finished

  const texts = () => segments.map((s) => s.text).filter(Boolean);

  // Lines up to `id` count as answered once `done` resolves true (a newer question can still cut it off).
  const coverUpTo = (id, done) =>
    Promise.resolve(done).then((ok) => {
      if (ok) answeredUpTo.current = Math.max(answeredUpTo.current, id);
    });

  const autoAsk = (q, transcript, options) => (latestAsk.current = answer.ask(q, transcript, options));

  // A prepared answer only fits when nothing else in the turn is still waiting for an answer.
  const showPrepared = (line) =>
    !openQuestionBefore(segments, line, answeredUpTo.current) && answer.showPrepared(line.text);

  // Words arriving while the interviewer is still talking. When they already form a question and the
  // speaker pauses briefly, start a draft answer instead of waiting for the end.
  const onPartial = useEvent((pending) => {
    clearTimeout(partialTimer.current);
    if (!enabled || wordCount(pending) < 3) return;
    // A common question with a prepared answer: show it right away, even mid-sentence.
    if (showPrepared({ id: Infinity, text: pending })) return;
    if (settings.profile.earlyAnswers === false) return;
    const wait = draftDelay(pending, answer.answerFor.current, performance.now() - lastDraftAt.current);
    if (wait == null) return;

    partialTimer.current = setTimeout(() => {
      if (sameQuestion(answer.answerFor.current.key, pending)) return; // the current answer already fits
      lastDraftAt.current = performance.now();
      draftFor(pending);
    }, wait);
  });

  // Runs from a timer: uses the caption lines on screen by then.
  const draftFor = useEvent((pending) => {
    const q = joinText(turnLines(segments, { id: Infinity, text: pending }, answeredUpTo.current));
    autoAsk(q, [...texts(), pending].join(' '), { key: pending, draft: true });
  });

  // A finished caption line (`id` from the segment it belongs to): answer it if it asks something.
  const onLine = useEvent((id, text) => {
    clearTimeout(partialTimer.current);
    const current = answer.answerFor.current;
    if (!enabled) return;
    const line = { id, text };
    // Already showing the prepared answer for this common question (picked up mid-sentence).
    if (current.commonId && matchCommonQuestion(text)?.id === current.commonId) return coverUpTo(id, true);
    if (showPrepared(line)) return coverUpTo(id, true);
    // The current answer still fits (a draft started mid-sentence, or Live Captions only added
    // filler/punctuation to a line): keep it. A draft is no longer a draft.
    if (sameQuestion(current.key, text)) {
      answer.confirmDraft();
      return coverUpTo(id, latestAsk.current);
    }
    if (looksLikeQuestion(text)) {
      const q = joinText(turnLines(segments, line, answeredUpTo.current));
      const transcript = joinText([...segments.filter((s) => s.id < id && s.text), line]);
      coverUpTo(id, autoAsk(q, transcript, { key: text }));
    }
  });

  // Ctrl+Shift+Space / Ctrl+Enter / "Answer latest": the last few caption lines.
  const answerLatest = useEvent(() => {
    const recent = joinText(segments.slice(-3));
    if (recent) answer.ask(recent, texts().join(' '));
  });

  // A new interview: lines still on screen from an earlier one are not questions to answer now.
  const reset = useEvent(() => {
    answeredUpTo.current = segments.at(-1)?.id ?? 0;
  });

  return { onPartial, onLine, answerLatest, reset };
}
