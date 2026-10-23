import AnswerText from './AnswerText.jsx';
import { FontSize } from './Controls.jsx';
import Icon from './Icons.jsx';
import { parseAnswer, spokenAnswer } from './questions.js';

// Shown until the first question: how to get started.
function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name="sparkles" />
      </div>
      <h3>Ready when you are</h3>
      <p>Your suggested answer appears here as soon as the interviewer asks a question.</p>
      <ol className="steps">
        <li>
          <span className="step-no">1</span>
          <span>
            Turn on Windows Live Captions <kbd>Win</kbd> <kbd>Ctrl</kbd> <kbd>L</kbd>
          </span>
        </li>
        <li>
          <span className="step-no">2</span>
          <span>
            Click <b>Start interview</b>
          </span>
        </li>
        <li>
          <span className="step-no">3</span>
          <span>Join your meeting. Answers appear automatically.</span>
        </li>
      </ol>
      <div className="shortcuts">
        <span>
          <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Space</kbd> answer latest
        </span>
        <span>
          <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>H</kbd> hide window
        </span>
        <span>
          <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>M</kbd> switch layout
        </span>
      </div>
    </div>
  );
}

// "Your code": snippets from the take-home project marked "Use in interview", with line numbers.
function CodePanel({ code, projectName }) {
  return (
    <div className="code-panel">
      <div className="code-head">Your code · {projectName}</div>
      {code.map((c) => (
        <figure key={c.path + c.startLine} className="code-snippet">
          <figcaption>
            <span className="code-path">{c.path}</span>
            {c.symbol && <span className="code-symbol">{c.symbol}</span>}
            <span className="muted">line {c.startLine}</span>
          </figcaption>
          <pre>
            {c.code.split('\n').map((line, i) => (
              <span key={i} className="code-line">
                <span className="ln">{c.startLine + i}</span>
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        </figure>
      ))}
    </div>
  );
}

/**
 * The suggested answer. `answer` comes from useAnswer; `liveText` is the words being spoken now
 * (shown under the answer in Mini); onRetry() writes a fresh live answer for a prepared one.
 */
export default function AnswerPanel({
  answer,
  settings,
  viewMode,
  liveText,
  targetLanguage,
  onFontScale,
  onOpenPrepare,
  onRetry,
}) {
  const parsed = parseAnswer(answer.text);
  const fontScale = settings.answerFontScale ?? 1;

  return (
    <section className="panel answer" style={{ '--answer-scale': fontScale }}>
      <div className="panel-head">
        <h2>
          <Icon name="sparkles" /> Suggested answer
          {answer.answering && (
            <span className="tag tag-busy">
              <span className="spinner" aria-hidden="true" /> Writing
            </span>
          )}
          {answer.isDraft && <span className="tag tag-draft">Early draft · still listening</span>}
          {answer.source === 'prepared' && (
            <span className="tag tag-ok">
              <Icon name="bolt" className="icon icon-fill" /> Prepared
            </span>
          )}
          {answer.source === 'live' && answer.firstWordsMs != null && !answer.answering && (
            <span className="tag-note">first words in {(answer.firstWordsMs / 1000).toFixed(1)}s</span>
          )}
        </h2>
        <div className="answer-tools">
          <FontSize value={fontScale} onChange={onFontScale} />
        </div>
      </div>
      {!settings.profile.resume?.trim() && (
        <div className="callout resume-hint">
          <span>
            <b>Add your resume in Prepare.</b> Without it, answers can only be general, because they never invent jobs
            or numbers.
          </span>
          <button type="button" className="ghost" onClick={onOpenPrepare}>
            Open Prepare
          </button>
        </div>
      )}
      {!answer.question && <EmptyState />}
      {answer.question && <p className="asked">Q: {answer.question}</p>}
      {answer.selfAnswer && (
        <div className="callout self-answer">
          <b>Answer this one in your own words.</b> The assistant doesn't suggest answers to questions about how you're
          answering.
        </div>
      )}
      {/* Say this right away while the full answer loads. */}
      {answer.answering && answer.opener && !parsed.answer && (
        <p className="opener">
          Start with: <b>“{answer.opener}”</b>
        </p>
      )}
      {/* Fall back to raw text only if the model ignored the section format. */}
      {(parsed.answer || (answer.text && !/^(MOOD|MEANING|ANSWER):/im.test(answer.text))) && (
        <AnswerText text={parsed.answer || answer.text} />
      )}
      {viewMode === 'mini' && liveText && <p className="mini-live">{liveText}</p>}
      {parsed.keyPoints && <pre className="points">{parsed.keyPoints}</pre>}
      {answer.code.length > 0 && <CodePanel code={answer.code} projectName={settings.activeProjectName} />}
      {/* Below the answer: they arrive after it and must not push it down while you read. */}
      {parsed.mood && answer.source === 'live' && (
        <p className="mood" title="Interviewer's mood, read from how they talk">
          Interviewer mood: <b>{parsed.mood}</b>
        </p>
      )}
      {parsed.meaning && <p className="meaning">{parsed.meaning}</p>}
      {answer.source === 'prepared' && (
        <button onClick={onRetry}>Not quite right? Write a fresh answer for this exact question</button>
      )}
      {answer.text && !answer.answering && targetLanguage && !answer.translation && (
        <button onClick={answer.translateAnswer}>Translate answer to {targetLanguage}</button>
      )}
      {answer.translation && <p className="answer-translation">{answer.translation}</p>}

      {answer.history.length > 1 && (
        <details>
          <summary>Previous answers ({answer.history.length - 1})</summary>
          {answer.history.slice(1).map((h, i) => (
            <div key={i} className="past">
              <strong>Q: {h.question}</strong>
              <AnswerText text={spokenAnswer(h.text)} className="past-answer" />
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
