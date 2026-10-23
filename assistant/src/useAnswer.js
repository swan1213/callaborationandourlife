import { useRef, useState } from 'react';
import { prepareAnswers, relatedCode, streamAnswer, translate } from './api.js';
import { humanizeAnswer, parseAnswer, parseFileRefs, spokenAnswer } from './questions.js';
import { COMMON_QUESTIONS, matchCommonQuestion, openerFor } from './commonQuestions.js';
import { translationTarget } from './Setup.jsx';
import { useEvent } from './useEvent.js';
import { asksAboutAnswering } from './selfAnswer.js';

// Questions that are probably about the take-home project, worth an instant local code search.
const PROJECT_HINT =
  /\b(code|files?|project|assignment|take[- ]home|implement(ed|ation)?|functions?|components?|class|module|tests?|bugs?|fix(ed)?|refactor(ed)?|api|endpoints?|database|schema|state|hooks?|repo(sitory)?|structure|architecture)\b/i;
const HISTORY_SIZE = 20;

/**
 * The suggested answer on screen: a streamed live answer or an instant prepared one, its translation,
 * earlier answers, and the "Your code" snippets from the take-home project marked "Use in interview".
 * setError(message) shows a problem ('' clears it); onAnswer(question, text, source) records a finished answer.
 */
export function useAnswer({ settings, setError, onAnswer }) {
  const [question, setQuestion] = useState('');
  const [text, setText] = useState('');
  const [answering, setAnswering] = useState(false);
  const [translation, setTranslation] = useState(''); // '' | '…' | text
  const [firstWordsMs, setFirstWordsMs] = useState(null); // time from asking to first answer text
  const [isDraft, setIsDraft] = useState(false); // answer started before the question was finished
  const [opener, setOpener] = useState(''); // instant first words to say while the answer loads
  const [source, setSource] = useState('live'); // 'live' | 'prepared'
  const [selfAnswer, setSelfAnswer] = useState(false); // a question the candidate answers in their own words
  const [history, setHistory] = useState([]); // [{ question, text }], newest first
  const [preparedStatus, setPreparedStatus] = useState(''); // '' | 'preparing' | 'ready'
  const prepared = useRef({}); // { [commonQuestionId]: answer text }
  const [code, setCode] = useState([]); // [{ path, symbol, startLine, code }]
  const codeTicket = useRef(0); // results for an older question are ignored
  const abort = useRef(null);
  // What the current answer was written for: caption text, still-a-draft flag, common question id.
  const answerFor = useRef({ key: '', draft: false, commonId: null });
  const recentOpeners = useRef([]); // openers already shown in this interview, newest last
  const openerRef = useRef('');

  /* ---------- "Your code" panel (reads the project folder on this PC; nothing is sent anywhere) ---------- */

  function newCodeTicket() {
    setCode([]);
    return ++codeTicket.current;
  }

  function findCode(ticket, request) {
    const id = settings.activeProjectId;
    if (!id) return;
    relatedCode({ id, ...request })
      .then((snippets) => ticket === codeTicket.current && setCode(snippets))
      .catch(() => {});
  }

  // Uses the FILES the answer named. "none" means the question isn't about the project: hide the panel.
  function codeFromAnswer(ticket, query, answer) {
    if (!settings.activeProjectId) return;
    const { files } = parseAnswer(answer);
    if (!files) return;
    const refs = parseFileRefs(files);
    if (refs.length) findCode(ticket, { query, refs });
    else if (ticket === codeTicket.current) setCode([]);
  }

  /* ---------- answers ---------- */

  // `key` is the caption text the answer is for; `draft` means the interviewer was still talking.
  // Resolves true once the whole answer is shown; false when it was replaced by a newer one or failed.
  const ask = useEvent(async (q, transcript, { key = q, draft = false } = {}) => {
    abort.current?.abort();
    // About how the candidate is answering (AI, reading from a screen…): no suggestion, no request.
    if (asksAboutAnswering(key) || asksAboutAnswering(q)) {
      abort.current = null;
      answerFor.current = { key, draft, commonId: null };
      setSelfAnswer(true);
      setIsDraft(draft);
      setSource('live');
      setOpener('');
      setQuestion(q);
      setText('');
      setTranslation('');
      setAnswering(false);
      setFirstWordsMs(null);
      newCodeTicket();
      return true;
    }
    setSelfAnswer(false);
    const controller = new AbortController();
    abort.current = controller;
    // A draft started while the interviewer was still talking: the candidate may already be saying its
    // opener, so the answer to the finished question keeps it. Otherwise a fresh one, unlike the last few.
    const wasDraft = answerFor.current.draft && !answerFor.current.commonId;
    const opener = wasDraft && openerRef.current ? openerRef.current : openerFor(key, recentOpeners.current);
    if (opener !== openerRef.current) recentOpeners.current = [...recentOpeners.current, opener].slice(-6);
    openerRef.current = opener;
    answerFor.current = { key, draft, commonId: null };
    setIsDraft(draft);
    setSource('live');
    setOpener(opener);
    setQuestion(q);
    setText('');
    setTranslation('');
    setAnswering(true);
    setError('');
    setFirstWordsMs(null);
    const ticket = newCodeTicket();
    if (PROJECT_HINT.test(key)) findCode(ticket, { query: key });
    const startedAt = performance.now();
    let full = '';
    let filesRequested = false;
    try {
      await streamAnswer({
        question: q,
        transcript,
        opener,
        profile: settings.profile,
        // The last few answers (newest first), so the new one doesn't repeat them.
        earlier: history
          .slice(0, 4)
          .map((h) => spokenAnswer(h.text))
          .filter(Boolean),
        signal: controller.signal,
        onDelta: (d) => {
          if (!full) setFirstWordsMs(performance.now() - startedAt);
          full += d;
          setText(humanizeAnswer(full));
          // The FILES section is complete once the next section starts: show that code right away.
          if (!filesRequested && /^FILES:[\s\S]*\n(MOOD|MEANING):/m.test(full)) {
            filesRequested = true;
            codeFromAnswer(ticket, key, full);
          }
        },
      });
      if (!filesRequested) codeFromAnswer(ticket, key, full);
      full = humanizeAnswer(full);
      setHistory((h) => [{ question: q, text: full }, ...h].slice(0, HISTORY_SIZE));
      onAnswer(q, full, 'live');
      return true;
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message);
      return false;
    } finally {
      if (abort.current === controller) setAnswering(false);
    }
  });

  // Shows a prepared answer instantly (no model call). Returns false if there is none for this text.
  const showPrepared = useEvent((q) => {
    if (settings.profile.preparedAnswers === false) return false;
    const common = matchCommonQuestion(q);
    const answer = common && prepared.current[common.id];
    if (!answer) return false;
    if (answerFor.current.commonId === common.id) return true; // already showing it
    abort.current?.abort();
    setSelfAnswer(false);
    answerFor.current = { key: q, draft: false, commonId: common.id };
    setIsDraft(false);
    setSource('prepared');
    setOpener('');
    setQuestion(q);
    setText(answer);
    setTranslation('');
    setAnswering(false);
    setFirstWordsMs(0);
    setHistory((h) => [{ question: q, text: answer }, ...h].slice(0, HISTORY_SIZE));
    onAnswer(q, answer, 'prepared');
    codeFromAnswer(newCodeTicket(), q, answer);
    return true;
  });

  // The interviewer finished the question a draft was written for: it is the real answer now.
  const confirmDraft = useEvent(() => {
    if (!answerFor.current.draft) return;
    answerFor.current.draft = false;
    setIsDraft(false);
  });

  // Answers to common questions, written when an interview starts (cached on disk by the server).
  const loadPrepared = useEvent(() => {
    const { profile } = settings;
    if (profile.preparedAnswers === false) return;
    setPreparedStatus('preparing');
    prepareAnswers(
      profile,
      COMMON_QUESTIONS.map(({ id, question }) => ({ id, question })),
    )
      .then((answers) => {
        prepared.current = answers;
        setPreparedStatus('ready');
      })
      .catch(() => setPreparedStatus(''));
  });

  const translateAnswer = useEvent(async () => {
    const language = translationTarget(settings.profile.nativeLanguage);
    const spoken = spokenAnswer(text);
    if (!language || !spoken) return;
    setTranslation('…');
    try {
      setTranslation(await translate(spoken, language));
    } catch (err) {
      setTranslation('');
      setError(err.message);
    }
  });

  return {
    question,
    selfAnswer,
    text,
    answering,
    translation,
    firstWordsMs,
    isDraft,
    opener,
    source,
    history,
    code,
    preparedStatus,
    preparedCount: Object.keys(prepared.current).length,
    answerFor, // read-only for useAutoAnswer
    ask,
    showPrepared,
    confirmDraft,
    loadPrepared,
    translateAnswer,
  };
}
