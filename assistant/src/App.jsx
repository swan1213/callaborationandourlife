import { useEffect, useRef, useState } from 'react';
import { connectTailorbid, getSettings, keepAlive, onHotkey, saveSettings, translate, warmup } from './api.js';
import { closeOnTop, onTopSupported, openOnTop, resizeOnTop } from './onTop.js';
import { useLiveCaptions } from './useLiveCaptions.js';
import { useAnswer } from './useAnswer.js';
import { useAutoAnswer } from './useAutoAnswer.js';
import { useSaveWhileListening, useSessionRecorder } from './useSessionRecorder.js';
import { useEvent } from './useEvent.js';
import { usePresence } from './usePresence.js';
import Setup, { translationTarget } from './Setup.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import Prepare from './Prepare.jsx';
import { duration, plural } from './format.js';
import StartSessionDialog from './StartSessionDialog.jsx';
import ConnectScreen from './ConnectScreen.jsx';
import AnswerPanel from './AnswerPanel.jsx';
import CaptionsPanel from './CaptionsPanel.jsx';
import { MoreMenu, ToggleChip, VIEW_MODES, ViewSwitch } from './Controls.jsx';
import Icon from './Icons.jsx';

// OpenAI's prompt cache lasts a few minutes; refresh it a bit sooner.
const WARMUP_EVERY_MS = 4 * 60 * 1000;
// OpenAI closes an idle connection after about two minutes, and reopening it costs a second or more.
const KEEPALIVE_EVERY_MS = 45 * 1000;
// The whole interview stays in the captions panel; this only guards against a runaway
// all-day session (several hours of speech). Answers only use the recent conversation anyway.
const MAX_CAPTION_LINES = 5000;

// TailorBid's Interview Assistant button opens the app with #tailorbid={ origin, token } (clicked again
// while the app is open, only this part of the address changes). It is removed from the address right away.
function takeTailorbidLink() {
  const match = /^#tailorbid=(.+)$/.exec(window.location.hash);
  if (!match) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return {};
  }
}

export default function App() {
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState('live');
  const [setupDirty, setSetupDirty] = useState(false); // unsaved edits on the Setup or Prepare page
  const [leaveSetupTo, setLeaveSetupTo] = useState(null); // tab waiting for "discard changes?" answer
  const [segments, setSegments] = useState([]); // caption lines: [{ id, text, translation }]
  const seq = useRef(0); // caption line ids
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [error, setError] = useState('');
  const [onTop, setOnTop] = useState(false); // the app is in an always-on-top Picture-in-Picture window
  const [showStart, setShowStart] = useState(false);
  const [finished, setFinished] = useState(null); // the session just saved, for the "Interview saved" dialog

  // Theme and accent color (Setup → Appearance) are attributes on <html> that styles.css reads.
  const theme = settings?.theme;
  const accent = settings?.accent;
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
    if (accent && accent !== 'blue') root.dataset.accent = accent;
    else delete root.dataset.accent;
  }, [theme, accent]);

  useEffect(() => {
    // Opened from TailorBid: connect first, so the interview's resume and job description are loaded.
    const connect = async () => {
      const link = takeTailorbidLink();
      if (!link) return null;
      try {
        return await connectTailorbid(link);
      } catch (err) {
        setError(`TailorBid: ${err.message}`);
        return null;
      }
    };
    connect()
      .then((s) => s || getSettings())
      .then(setSettings);
    const onHashChange = () => connect().then((s) => s && setSettings(s));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /* ---------- the interview: captions → answers, recorded for Interview History in TailorBid ---------- */

  const recorder = useSessionRecorder();
  const answer = useAnswer({ settings, setError, onAnswer: recorder.recordAnswer });
  const auto = useAutoAnswer({ answer, segments, enabled: autoAnswer, settings });

  // Adds a translation under a caption when "Translate" is on. Failures only affect that line.
  async function translateSegment(id, text, context) {
    const { translateCaptions, profile } = settings;
    const language = translationTarget(profile.nativeLanguage);
    if (!translateCaptions || !language) return;
    try {
      const translation = await translate(text, language, context);
      setSegments((s) => s.map((seg) => (seg.id === id ? { ...seg, translation } : seg)));
      recorder.recordTranslation(id, translation);
    } catch {
      setSegments((s) => s.map((seg) => (seg.id === id ? { ...seg, translation: '(translation failed)' } : seg)));
    }
  }

  // A finished phrase from Windows Live Captions (read on this PC; no OpenAI involved).
  // `revise`: Live Captions rewrote the line it just gave us, so update that line instead of adding one.
  const handleLiveCaption = useEvent((text, { revise = false } = {}) => {
    const last = segments.at(-1);
    const editing = revise && last;
    const id = editing ? last.id : ++seq.current;
    const prev = (editing ? segments.slice(-4, -1) : segments.slice(-3)).map((s) => s.text).join(' ');
    if (editing) setSegments((s) => s.map((seg) => (seg.id === id ? { ...seg, text, translation: undefined } : seg)));
    else setSegments((s) => [...s, { id, text }].slice(-MAX_CAPTION_LINES));
    recorder.recordCaption(id, text);
    translateSegment(id, text, prev);
    auto.onLine(id, text);
  });

  const liveCaptions = useLiveCaptions({ onCaption: handleLiveCaption, onPartial: auto.onPartial });
  const listening = liveCaptions.status !== 'idle';
  useSaveWhileListening(recorder, listening, { onSaved: setFinished, onError: setError });
  usePresence(Boolean(settings?.tailorbid && !settings.tailorbid.expired), listening);

  // `meta` comes from the Start dialog: { company, role, stage }.
  const startListening = (meta) => {
    setShowStart(false);
    setFinished(null);
    recorder.begin(meta);
    auto.reset();
    setError('');
    warmup(settings.profile);
    answer.loadPrepared();
    liveCaptions.start();
  };

  const stopListening = () => {
    // The phrase still being spoken when Stop is clicked belongs in the saved transcript too.
    const pending = liveCaptions.liveText.trim();
    if (pending) recorder.recordCaption(++seq.current, pending);
    liveCaptions.stop();
  };

  // Keep the connection and prompt cache warm while listening, so no answer starts "cold".
  const warm = useEvent(() => warmup(settings.profile));
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(warm, WARMUP_EVERY_MS);
    return () => clearInterval(id);
  }, [listening, warm]);
  // Also as soon as the assistant opens (and when it's opened for another interview), so even the first
  // question is fast: TailorBid's connection and OpenAI's prompt cache are ready before the call starts.
  const canAnswer = Boolean(settings?.hasApiKey);
  const openedAt = settings?.tailorbid?.connectedAt;
  useEffect(() => {
    if (canAnswer) warm();
  }, [canAnswer, openedAt, warm]);
  useEffect(() => {
    if (!canAnswer) return;
    const id = setInterval(keepAlive, KEEPALIVE_EVERY_MS);
    return () => clearInterval(id);
  }, [canAnswer]);

  /* ---------- settings, layout and tabs ---------- */

  const updateSettings = async (patch) => {
    setSettings(await saveSettings(patch));
  };

  // Changes on screen right away; saving happens in the background.
  const setAnswerFontScale = (answerFontScale) => {
    setSettings((s) => ({ ...s, answerFontScale }));
    saveSettings({ answerFontScale }).catch(() => {});
  };

  // Full / Medium / Mini is a layout of the page (and the size of the on-top window, if open).
  const applyViewMode = (viewMode) => {
    setSettings((s) => ({ ...s, viewMode }));
    saveSettings({ viewMode }).catch(() => {});
    resizeOnTop(viewMode);
  };

  const toggleOnTop = async (on) => {
    if (!on) return closeOnTop();
    try {
      await openOnTop(settings.viewMode || 'full', () => setOnTop(false));
      setOnTop(true);
    } catch (err) {
      setError(`Couldn't open the on-top window: ${err.message}`);
    }
  };

  // Leaving Setup with unsaved edits asks first, so nothing is lost by accident.
  const goToTab = (next) => {
    if ((tab === 'setup' || tab === 'prepare') && next !== tab && setupDirty) return setLeaveSetupTo(next);
    setTab(next);
  };

  // Full / Medium / Mini. Compact layouts always show the Live view.
  const viewMode = settings?.viewMode || 'full';
  const setViewMode = (mode) => {
    if (mode !== 'full' && tab !== 'live') goToTab('live');
    applyViewMode(mode);
  };
  const cycleView = useEvent(() => {
    const i = VIEW_MODES.findIndex((m) => m.value === viewMode);
    setViewMode(VIEW_MODES[(i + 1) % VIEW_MODES.length].value);
  });
  const compact = viewMode !== 'full';

  // Recordings are saved to Interview History in TailorBid (when the assistant was opened from TailorBid).
  const tailorbid = settings?.tailorbid && !settings.tailorbid.expired ? settings.tailorbid : null;
  const openInTailorbid = (id) => {
    setFinished(null);
    window.open(`${tailorbid.origin}/interview-history?open=${encodeURIComponent(id)}`, '_blank', 'noopener');
  };

  /* ---------- hotkeys ---------- */

  // Global hotkeys from the server: Ctrl+Shift+Space answers the latest captions, Ctrl+Shift+M switches
  // the layout (Ctrl+Shift+H hide/show is done by the server itself). They work while the meeting has focus.
  const { answerLatest } = auto;
  useEffect(
    () =>
      onHotkey(({ hotkey, notice }) => {
        if (hotkey === 'answer') answerLatest();
        if (hotkey === 'view') cycleView();
        if (notice) setError(notice); // e.g. a hotkey another program already uses
      }),
    [answerLatest, cycleView],
  );
  // The same keys inside the app (in case the global ones are taken), plus Ctrl+Enter.
  // When the global ones are registered, Windows delivers them to the server instead, so nothing runs twice.
  useEffect(() => {
    const onKey = (e) => {
      if (!e.ctrlKey) return;
      if (e.key === 'Enter' || (e.shiftKey && e.code === 'Space')) {
        e.preventDefault();
        answerLatest();
      } else if (e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        cycleView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answerLatest, cycleView]);

  if (!settings) return null;
  // Only through TailorBid: without a live connection there is nothing to use.
  if (!settings.hasApiKey)
    return <ConnectScreen site={settings.site} expired={Boolean(settings.tailorbid?.expired)} error={error} />;
  const targetLanguage = translationTarget(settings.profile.nativeLanguage);
  const transcriptText = segments
    .map((s) => s.text)
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`app mode-${viewMode}`}>
      <header className="topbar">
        <div className="brand" hidden={compact}>
          <span className="brand-mark">
            <Icon name="logo" />
          </span>
          <span className="brand-name">Interview Assistant</span>
          {settings.tailorbid?.interview && (
            <span
              className={`badge ${settings.tailorbid.expired ? 'badge-danger' : 'badge-info'} brand-tailorbid`}
              title={
                settings.tailorbid.expired
                  ? 'The TailorBid connection has expired. Click Interview Assistant in TailorBid again.'
                  : `From TailorBid: ${settings.tailorbid.interview.candidate}`
              }
            >
              {settings.tailorbid.interview.company || 'Interview'}
              {settings.tailorbid.interview.jobTitle && ` · ${settings.tailorbid.interview.jobTitle}`}
            </span>
          )}
        </div>
        <nav className="tabs" hidden={compact}>
          <button className={tab === 'live' ? 'tab active' : 'tab'} onClick={() => goToTab('live')}>
            Live
          </button>
          <button className={tab === 'prepare' ? 'tab active' : 'tab'} onClick={() => goToTab('prepare')}>
            Prepare
          </button>
          <button className={tab === 'setup' ? 'tab active' : 'tab'} onClick={() => goToTab('setup')}>
            Setup
          </button>
        </nav>

        <div className="controls">
          {!listening ? (
            <>
              <button
                className="primary start-button"
                onClick={() => setShowStart(true)}
                disabled={!settings.hasApiKey}
                title={
                  settings.hasApiKey
                    ? 'Start listening with Windows Live Captions (on this PC, free)'
                    : 'Add an API key in Setup first'
                }
              >
                <Icon name="play" className="icon icon-fill" /> Start interview
              </button>
            </>
          ) : (
            <>
              {settings.activeProjectId && !compact && (
                <span className="pill" title="Take-home project used for answers and code lookup">
                  <Icon name="folder" /> {settings.activeProjectName}
                </span>
              )}
              {answer.preparedStatus && !compact && (
                <span className="pill" title="Answers to common questions, shown instantly">
                  <Icon name="bolt" className="icon icon-fill" />
                  {answer.preparedStatus === 'ready' ? `${answer.preparedCount} prepared` : 'Preparing…'}
                </span>
              )}
              <span className={`pill status-pill ${liveCaptions.status}`}>
                <span className="live-dot" aria-hidden="true" />
                {liveCaptions.status === 'connected' ? 'Listening' : 'Connecting…'}
              </span>
              <button
                className="danger stop-button"
                onClick={stopListening}
                title="Stop listening and save this interview"
              >
                <Icon name="stop" className="icon icon-fill" /> End
              </button>
            </>
          )}
          <ViewSwitch value={viewMode} onChange={setViewMode} />
          <MoreMenu compact={compact}>
            <ToggleChip
              checked={autoAnswer}
              onChange={setAutoAnswer}
              title="Answer automatically when a question is detected"
            >
              Auto-answer
            </ToggleChip>
            <ToggleChip
              checked={settings.translateCaptions && Boolean(targetLanguage)}
              disabled={!targetLanguage}
              onChange={(v) => updateSettings({ translateCaptions: v })}
              title={
                targetLanguage
                  ? `Translate captions into ${targetLanguage}`
                  : 'Choose a language other than English in Setup to enable translation'
              }
            >
              Translate
            </ToggleChip>
            <ToggleChip
              checked={onTop}
              disabled={!onTopSupported}
              onChange={toggleOnTop}
              title={
                onTopSupported
                  ? 'Open the assistant in a small window that stays above the meeting'
                  : 'Needs Chrome or Edge (Document Picture-in-Picture)'
              }
            >
              On top
            </ToggleChip>
          </MoreMenu>
        </div>
      </header>

      {error && (
        <div className="error" role="alert" onClick={() => setError('')} title="Click to dismiss">
          <span>{error}</span>
          <span className="error-close" aria-hidden="true">
            ×
          </span>
        </div>
      )}

      {tab === 'prepare' && !compact ? (
        <Prepare
          key={settings.tailorbid?.connectedAt} // reopened from TailorBid: show the new interview's fields
          settings={settings}
          onSave={updateSettings}
          onDirtyChange={setSetupDirty}
          hasApiKey={settings.hasApiKey}
          activeProjectId={settings.activeProjectId}
          onSetActive={(project) =>
            updateSettings({ activeProjectId: project?.id || null, activeProjectName: project?.name || '' })
          }
        />
      ) : tab === 'setup' && !compact ? (
        <Setup
          settings={settings}
          onSave={updateSettings}
          onDone={() => goToTab('live')}
          onReplaceSettings={setSettings}
          onDirtyChange={setSetupDirty}
        />
      ) : (
        <main className="live">
          <AnswerPanel
            answer={answer}
            settings={settings}
            viewMode={viewMode}
            liveText={liveCaptions.liveText}
            targetLanguage={targetLanguage}
            onFontScale={setAnswerFontScale}
            onOpenPrepare={() => goToTab('prepare')}
            onRetry={() => answer.ask(answer.question, transcriptText, { key: answer.question })}
          />
          <CaptionsPanel
            segments={segments}
            liveText={liveCaptions.liveText}
            listening={listening}
            connected={liveCaptions.status === 'connected'}
            canAsk={settings.hasApiKey}
            layoutKey={viewMode}
            onAnswerLatest={answerLatest}
            onClear={() => setSegments([])}
            onAsk={(q) => answer.ask(q, transcriptText)}
          />
        </main>
      )}
      {showStart && (
        <StartSessionDialog tailorbid={tailorbid} onStart={startListening} onCancel={() => setShowStart(false)} />
      )}
      {finished && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setFinished(null)}>
          <div className="modal" role="dialog" aria-labelledby="finished-title">
            <h3 id="finished-title">{tailorbid ? 'Interview saved to TailorBid' : 'Interview not saved'}</h3>
            <p>
              {[
                finished.company,
                duration(finished),
                plural(finished.answers.length, 'question'),
                plural(finished.captions.length, 'caption line'),
              ]
                .filter(Boolean)
                .join(' · ')}
              .{' '}
              {tailorbid
                ? 'Open it in Interview History in TailorBid for the full transcript, an AI review and export.'
                : 'Interviews are saved to TailorBid. Open the assistant from TailorBid to keep the next one.'}
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setFinished(null)}>
                Close
              </button>
              {tailorbid && (
                <button type="button" className="primary" onClick={() => openInTailorbid(finished.id)}>
                  Open in TailorBid
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {leaveSetupTo && (
        <ConfirmDialog
          title="Leave without saving?"
          message={`You have unsaved changes on the ${tab === 'prepare' ? 'Prepare' : 'Setup'} page. They will be lost if you leave now.`}
          confirmLabel="Discard and leave"
          danger
          onCancel={() => setLeaveSetupTo(null)}
          onConfirm={() => {
            setSetupDirty(false);
            setTab(leaveSetupTo);
            setLeaveSetupTo(null);
          }}
        />
      )}
    </div>
  );
}
