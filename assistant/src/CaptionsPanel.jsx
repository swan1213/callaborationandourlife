import { useEffect, useRef, useState } from 'react';
import { plural } from './format.js';
import Icon from './Icons.jsx';
import { looksLikeQuestion } from './questions.js';
import { useEvent } from './useEvent.js';

// Within this distance of the bottom, the captions panel keeps following new speech.
const STICK_TO_BOTTOM_PX = 60;

/**
 * The interviewer's words: caption lines (questions highlighted, translations under them), the words
 * being spoken now in grey, and a box to type a question. `layoutKey` changes when the layout does.
 */
export default function CaptionsPanel({
  segments,
  liveText,
  listening,
  connected,
  canAsk,
  layoutKey,
  onAnswerLatest,
  onClear,
  onAsk,
}) {
  // Follow new captions only while the panel is scrolled to the bottom, so scrolling up to reread
  // earlier speech isn't undone by every new word.
  const captionsRef = useRef(null);
  const follow = useRef(true);
  const [behind, setBehind] = useState(false); // scrolled up while new speech arrived

  const onScroll = () => {
    const el = captionsRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
    follow.current = atBottom;
    if (atBottom) setBehind(false);
  };

  const scrollToEnd = useEvent(() => {
    const el = captionsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    follow.current = true;
    setBehind(false);
  });

  useEffect(() => {
    if (follow.current) scrollToEnd();
    else if (segments.length || liveText) setBehind(true);
  }, [segments, liveText, layoutKey, scrollToEnd]);

  return (
    <section className="panel transcript">
      <div className="panel-head">
        <h2>
          <Icon name="captions" /> Live captions
          {listening && connected && <span className="live-dot" aria-label="Listening" />}
        </h2>
        {segments.length > 0 && <span className="tag-note">{plural(segments.length, 'line')}</span>}
      </div>
      <div className="captions-wrap">
        <div className="captions" ref={captionsRef} onScroll={onScroll}>
          {segments.length === 0 && !liveText && (
            <p className="captions-empty">
              {listening
                ? 'Listening… captions appear as soon as the interviewer speaks.'
                : "The interviewer's words appear here during the interview."}
            </p>
          )}
          {segments.map((s) => (
            <p key={s.id} className={looksLikeQuestion(s.text) ? 'question' : ''}>
              {s.text}
              {s.translation && <span className="translation">{s.translation}</span>}
            </p>
          ))}
          {liveText && <p className="pending live">{liveText}</p>}
        </div>
        {behind && (
          <button type="button" className="captions-latest" onClick={scrollToEnd}>
            <Icon name="down" /> Latest
          </button>
        )}
      </div>
      <div className="captions-actions">
        <button onClick={onAnswerLatest} disabled={!segments.length} title="Answer the latest captions (Ctrl+Enter)">
          <Icon name="answer" /> Answer latest
        </button>
        <button
          className="ghost"
          onClick={onClear}
          disabled={!segments.length}
          title="Clear the captions on screen (Interview History in TailorBid keeps them)"
        >
          <Icon name="eraser" /> Clear
        </button>
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          const q = e.target.q.value.trim();
          if (q) onAsk(q);
          e.target.reset();
        }}
      >
        <input name="q" placeholder="Type a question to answer…" autoComplete="off" />
        <button type="submit" className="primary" disabled={!canAsk} title="Write an answer for this question">
          <Icon name="send" /> Ask
        </button>
      </form>
    </section>
  );
}
