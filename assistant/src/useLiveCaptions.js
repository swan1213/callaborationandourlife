import { useCallback, useEffect, useRef, useState } from 'react';
import { onLiveCaptions, startLiveCaptions, stopLiveCaptions } from './api.js';
import { newText, splitSentences } from './captionDiff.js';

const QUESTION_SETTLE_MS = 500; // Live Captions sometimes shows an early "?" mid-sentence; drafts already cover speed
const PHRASE_SETTLE_MS = 800; // other text waits a little longer for the speaker to continue
const MAX_PENDING_MS = 8000; // long monologues are still sent in pieces
// A sentence Live Captions has finished (punctuated, and the speaker moved on) becomes a caption line
// once it stays unchanged this long, without waiting for a pause. Live Captions sometimes fixes the
// last words of a sentence right after punctuating it, hence the short wait.
const SENTENCE_STABLE_MS = 300;
const COMMITTED_KEEP_CHARS = 4000; // only the end of the committed text is needed to find new words

const normalize = (t) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// The finished sentences at the start of `pending` (all but the one still being spoken).
function finishedSentences(pending) {
  const parts = splitSentences(pending);
  let count = 0;
  while (count < parts.length - 1 && /[.?!]$/.test(parts[count])) count++;
  return parts.slice(0, count).join(' ');
}

/**
 * Reads Windows 11 Live Captions (local, free, near real-time) and calls onCaption(text)
 * with each new phrase once the speaker pauses. `liveText` is the phrase being spoken right now,
 * also passed word by word to onPartial(text) so answers can start before the phrase ends.
 */
export function useLiveCaptions({ onCaption, onPartial }) {
  const [status, setStatus] = useState('idle'); // idle | waiting | connected
  const [liveText, setLiveText] = useState('');
  const s = useRef({});
  const onCaptionRef = useRef(onCaption);
  onCaptionRef.current = onCaption;
  const onPartialRef = useRef(onPartial);
  onPartialRef.current = onPartial;

  const commit = useCallback(() => {
    const st = s.current;
    clearTimeout(st.timer);
    clearTimeout(st.finishedTimer);
    st.finished = '';
    st.pendingSince = null;
    const text = newText(st.committed, st.current);
    st.committed = st.current;
    setLiveText('');
    if (text) emit(text);
  }, []);

  // Live Captions keeps rewriting the last words it showed ("How do you usually?" becomes
  // "How do you usually handle disagreements?"). A line that repeats the previous one is dropped,
  // and one that extends it replaces it ({ revise: true }) instead of becoming a new line.
  function emit(text) {
    const st = s.current;
    const now = normalize(text);
    const last = normalize(st.lastLine || '');
    if (last && (now === last || last.startsWith(now))) return;
    const revise = Boolean(last) && now.startsWith(last);
    st.lastLine = text;
    onCaptionRef.current?.(text, { revise });
  }

  // Shows finished sentences as caption lines while the speaker keeps talking.
  const commitFinished = useCallback(() => {
    const st = s.current;
    const done = finishedSentences(newText(st.committed, st.current));
    if (!done || done !== st.finished) return; // changed again since the timer started: wait for it to settle
    st.committed = `${st.committed}\n${done}`.slice(-COMMITTED_KEEP_CHARS);
    st.finished = '';
    st.pendingSince = null;
    setLiveText(newText(st.committed, st.current));
    emit(done);
  }, []);

  const stop = useCallback(() => {
    clearTimeout(s.current.timer);
    clearTimeout(s.current.finishedTimer);
    s.current.unsubscribe?.();
    stopLiveCaptions();
    s.current = {};
    setStatus('idle');
    setLiveText('');
  }, []);

  const start = useCallback(() => {
    stop();
    const st = { committed: null, current: '', pendingSince: null };
    s.current = st;
    st.unsubscribe = onLiveCaptions((event) => {
      if (event.status === 'stopped') return stop();
      if (event.status) return setStatus(event.status);
      if (event.text === undefined) return;

      st.current = event.text;
      // Whatever is already on screen when we connect is old: use it only as the starting point.
      if (st.committed === null) {
        st.committed = event.text;
        return;
      }
      const pending = newText(st.committed, st.current);
      setLiveText(pending);
      clearTimeout(st.timer);
      if (!pending) return;
      onPartialRef.current?.(pending);

      const now = performance.now();
      st.pendingSince ??= now;
      if (now - st.pendingSince > MAX_PENDING_MS) return commit();
      st.timer = setTimeout(commit, pending.endsWith('?') ? QUESTION_SETTLE_MS : PHRASE_SETTLE_MS);

      // Finished sentences don't wait for a pause; restart their short timer only when they change.
      const done = finishedSentences(pending);
      if (done && done !== st.finished) {
        st.finished = done;
        clearTimeout(st.finishedTimer);
        st.finishedTimer = setTimeout(commitFinished, SENTENCE_STABLE_MS);
      }
    });
    setStatus('waiting');
    startLiveCaptions();
  }, [commit, commitFinished, stop]);

  useEffect(() => stop, [stop]);

  return { status, liveText, start, stop };
}
