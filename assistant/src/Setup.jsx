import { useEffect, useMemo, useState } from 'react';
import {
  deleteAllData,
  disconnectTailorbid,
  importTextFile,
  refreshTailorbid,
  saveConnection,
  showDataFolder,
  testConnection,
} from './api.js';
import { findById } from './onTop.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import { CUES } from './AnswerText.jsx';

// English means "no translation"; an empty value from older settings counts as English too.
export function translationTarget(language) {
  const l = (language || '').trim();
  return /^english$/i.test(l) ? '' : l;
}

const LANGUAGES = [
  'Arabic',
  'Bengali',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'French',
  'German',
  'Hindi',
  'Indonesian',
  'Italian',
  'Japanese',
  'Korean',
  'Persian',
  'Polish',
  'Portuguese',
  'Russian',
  'Spanish',
  'Tagalog',
  'Tamil',
  'Thai',
  'Turkish',
  'Ukrainian',
  'Urdu',
  'Vietnamese',
];

// Keep in sync with the data-accent rules in styles.css.
const ACCENTS = [
  { value: 'blue', label: 'Blue', color: '#2563eb' },
  { value: 'purple', label: 'Purple', color: '#7c3aed' },
  { value: 'teal', label: 'Teal', color: '#0d9488' },
  { value: 'green', label: 'Green', color: '#16a34a' },
  { value: 'orange', label: 'Orange', color: '#ea580c' },
  { value: 'pink', label: 'Pink', color: '#db2777' },
];

const TEXT_LIMIT = 20000; // matches the import limit in server/importers.cjs
export const INSTRUCTIONS_LIMIT = 2000;

// Profile fields edited on the Prepare page (resume, job, custom instructions). Setup edits the rest,
// and each page saves only its own fields so neither overwrites the other.
export const PREPARE_FIELDS = ['resume', 'jobDescription', 'customPrompt'];
const setupFields = (profile) =>
  Object.fromEntries(Object.entries(profile).filter(([key]) => !PREPARE_FIELDS.includes(key)));

const SECTIONS = [
  { id: 'connection', title: 'Connection' },
  { id: 'style', title: 'Answer style' },
  { id: 'features', title: 'Live features' },
  { id: 'appearance', title: 'Appearance' },
  { id: 'privacy', title: 'Privacy & data' },
];

const cleanError = (err) => err.message;

// Personal contact details the AI never needs. Removed locally, before anything is sent anywhere.
const CONTACT_PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // email
  /\+?\d[\d\s().-]{7,}\d/g, // phone numbers
  /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com)\/\S+/gi, // profile links
];

export function removeContactDetails(text) {
  let count = 0;
  let result = text;
  for (const re of CONTACT_PATTERNS) {
    result = result.replace(re, () => {
      count++;
      return '';
    });
  }
  // Drop lines left with only separators, e.g. "jane@x.com | +1 555…" becomes " | ".
  const cleaned = result
    .split('\n')
    .filter((line) => !line.trim() || !/^[\s|•·,;/–—-]+$/.test(line))
    .join('\n');
  return { text: cleaned.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'), count };
}

/* ---------- small building blocks ---------- */

export function Icon({ name }) {
  const paths = {
    lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
    check: 'M5 12l5 5 9-11',
    alert: 'M12 8v5M12 16.5v.5M10.3 3.9L2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    eyeOff:
      'M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    folder: 'M3 6h6l2 2h10v11H3z',
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Section({ id, title, description, children }) {
  return (
    <section id={id} className="card">
      <div className="card-head">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Switch({ checked, onChange, title, description }) {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span className="switch-title">{title}</span>
        <span className="switch-desc">{description}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

// A row of buttons that behaves like a radio group, with the chosen option's description below.
function Segmented({ label, value, options, onChange }) {
  const current = options.find((o) => o.value === value) || options[0];
  return (
    <div className="segmented-field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === current.value}
            className={o.value === current.value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="field-hint">{current.hint}</span>
    </div>
  );
}

// A textarea that can also be filled from a PDF, Word or text file.
export function ImportableText({ label, hint, value, onChange, placeholder, rows, onAskConfirm, extraAction }) {
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const tooLong = value.length > TEXT_LIMIT;

  const importFile = async () => {
    setError('');
    try {
      const file = await importTextFile(`Import ${label.toLowerCase()}`);
      if (!file) return;
      onChange(file.text);
      setSource(file.name);
    } catch (err) {
      setError(cleanError(err));
    }
  };

  const clear = () =>
    onAskConfirm({
      title: `Clear ${label.toLowerCase()}?`,
      message: `This removes the ${label.toLowerCase()} text from the form. Nothing is deleted until you save.`,
      confirmLabel: 'Clear',
      danger: true,
      onConfirm: () => {
        onChange('');
        setSource('');
      },
    });

  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">
          {label}
          {source && <Badge tone="ok">Imported from {source}</Badge>}
        </span>
        <span className="field-actions">
          {extraAction}
          <button type="button" className="ghost" onClick={importFile}>
            <Icon name="upload" /> Import file…
          </button>
          {value && (
            <button type="button" className="ghost" onClick={clear}>
              <Icon name="trash" /> Clear
            </button>
          )}
        </span>
      </div>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setSource('');
        }}
        placeholder={placeholder}
        aria-invalid={tooLong}
      />
      <div className="field-foot">
        <span className={error || tooLong ? 'field-error' : 'field-hint'}>
          {error || (tooLong ? `Too long: only the first ${TEXT_LIMIT.toLocaleString()} characters are used.` : hint)}
        </span>
        <span className="counter">{value.length.toLocaleString()} characters</span>
      </div>
    </div>
  );
}

/* ---------- Connection: API key and models ---------- */

// Choices shown in the dropdowns. "Other…" allows any model name.
const CONNECTION_FIELDS = [
  {
    key: 'model',
    label: 'Answer model',
    options: [
      { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', hint: 'Recommended: starts answering fastest.' },
      {
        value: 'gpt-6.1-sol',
        label: 'GPT-6.1 Sol',
        hint: 'Strong answers; the only one here with the ultrafast tier.',
      },
      { value: 'gpt-6-sol', label: 'GPT-6 Sol', hint: 'Strong answers, a little slower to start.' },
      { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', hint: 'Cheaper; plainer answers.' },
      { value: 'gpt-6-luna', label: 'GPT-6 Luna', hint: 'Cheapest; plainer answers.' },
    ],
  },
  {
    key: 'serviceTier',
    label: 'Speed tier',
    options: [
      {
        value: 'priority',
        label: 'Fast (priority)',
        hint: 'Answers start in about 1 second. Costs about 2× standard.',
      },
      { value: 'default', label: 'Standard', hint: 'Normal price. Answers start a bit later.' },
      { value: 'ultrafast', label: 'Ultrafast', hint: 'Only for GPT-6.1 Sol. Highest price.' },
    ],
  },
  {
    key: 'reasoningEffort',
    label: 'Reasoning effort',
    options: [
      { value: 'low', label: 'Low', hint: 'Recommended: fastest, natural answers.' },
      { value: 'medium', label: 'Medium', hint: 'For harder technical questions. Slower.' },
      { value: 'high', label: 'High', hint: 'Slowest. Rarely needed in a live interview.' },
    ],
  },
  {
    key: 'translateModel',
    label: 'Translation model',
    options: [
      { value: 'gpt-6-luna', label: 'GPT-6 Luna', hint: 'Recommended: fast and cheap for translating captions.' },
      { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', hint: 'Fast and cheap.' },
      { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', hint: 'Better wording, costs more.' },
    ],
  },
];

const SOURCE_BADGE = {
  app: <Badge tone="info">Set in app</Badge>,
  env: <Badge>From .env.local</Badge>,
  default: <Badge>Default</Badge>,
};

// Opened from TailorBid: answers use TailorBid's OpenAI key (through TailorBid), and the resume and job
// description come from the interview the assistant was opened for.
function TailorbidField({ tailorbid, onChanged, askConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { interview, expired } = tailorbid;
  const site = new URL(tailorbid.origin).host;

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      onChanged(await action());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () =>
    askConfirm({
      title: 'Disconnect from TailorBid?',
      message:
        'Answers will use your own OpenAI API key (Setup or .env.local). The resume and job description stay as they are.',
      confirmLabel: 'Disconnect',
      danger: true,
      onConfirm: () => run(disconnectTailorbid),
    });

  return (
    <div className="field">
      <span className="field-label">
        TailorBid {expired ? <Badge tone="danger">Expired</Badge> : <Badge tone="info">Connected</Badge>}
      </span>
      <div className="key-row">
        <span className="readonly key-current">
          <Icon name="lock" />{' '}
          {interview
            ? `${interview.company || 'Interview'}${interview.jobTitle ? ` · ${interview.jobTitle}` : ''} (${interview.candidate})`
            : 'No interview'}
          , {tailorbid.user} on {site}
        </span>
        {interview && !expired && (
          <button type="button" onClick={() => run(refreshTailorbid)} disabled={busy}>
            Reload resume &amp; job
          </button>
        )}
        <button type="button" className="ghost danger-text" onClick={disconnect} disabled={busy}>
          Disconnect
        </button>
      </div>
      <span className={error ? 'field-error' : 'field-hint'}>
        {error ||
          (expired
            ? 'Click Interview Assistant in TailorBid to connect again.'
            : `Answers use TailorBid's OpenAI key until ${new Date(tailorbid.expiresAt).toLocaleString()}.${
                interview ? " The resume and job description on the Prepare page are this interview's." : ''
              }`)}
      </span>
    </div>
  );
}

function ModelField({ field, value, source, onChange, onReset }) {
  const known = field.options.find((o) => o.value === value);
  const [custom, setCustom] = useState(!known);
  useEffect(() => {
    if (known) setCustom(false); // e.g. after "Undo changes" or "Reset"
  }, [known]);
  return (
    <div className="field">
      <span className="field-label">
        {field.label} {SOURCE_BADGE[source]}
        {source === 'app' && (
          <button
            type="button"
            className="link small"
            onClick={onReset}
            title="Use the .env.local or default value again"
          >
            Reset
          </button>
        )}
      </span>
      <select
        value={custom ? '__other' : value}
        onChange={(e) => {
          if (e.target.value === '__other') return setCustom(true);
          setCustom(false);
          onChange(e.target.value);
        }}
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value="__other">Other…</option>
      </select>
      {custom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Exact model name, e.g. gpt-6-sol"
          spellCheck={false}
        />
      )}
      <span className="field-hint">{custom ? 'Any OpenAI model name. Use Test to check it works.' : known?.hint}</span>
    </div>
  );
}

// The TailorBid connection (it provides the OpenAI access) and the models. Saved separately from the
// profile, with its own Test and Save buttons.
function ConnectionCard({ settings, onSaved, onTailorbidChanged, askConfirm }) {
  const current = useMemo(() => Object.fromEntries(CONNECTION_FIELDS.map((f) => [f.key, settings[f.key]])), [settings]);
  const [draft, setDraft] = useState(current);
  const [status, setStatus] = useState(null); // null | 'testing' | 'saving' | { ok, error, ms, saved }

  useEffect(() => setDraft(current), [current]);

  const sources = settings.sources || {};
  const changed = Object.fromEntries(
    CONNECTION_FIELDS.filter((f) => draft[f.key] !== current[f.key]).map((f) => [f.key, draft[f.key].trim()]),
  );
  const dirty = Object.keys(changed).length > 0;
  const busy = status === 'testing' || status === 'saving';

  const test = async () => {
    setStatus('testing');
    setStatus(await testConnection(changed));
  };

  const save = async () => {
    if (Object.values(changed).some((v) => !v)) return;
    setStatus('saving');
    const fresh = await saveConnection(changed);
    onSaved(fresh);
    // Check right away that the saved combination really works.
    setStatus({ ...(await testConnection({})), saved: true });
  };

  const reset = (key) => saveConnection({ [key]: '' }).then(onSaved);

  // Enter inside this card must not submit the profile form around it.
  const stopEnter = (e) => e.key === 'Enter' && e.preventDefault();

  return (
    <Section
      id="connection"
      title="Connection"
      description="Your TailorBid connection (it provides the OpenAI access), and the models used for answers and translation."
    >
      <div className="connection" onKeyDown={stopEnter}>
        {settings.tailorbid && (
          <TailorbidField tailorbid={settings.tailorbid} onChanged={onTailorbidChanged} askConfirm={askConfirm} />
        )}
        <div className="model-grid">
          {CONNECTION_FIELDS.map((f) => (
            <ModelField
              key={f.key}
              field={f}
              value={draft[f.key]}
              source={sources[f.key]}
              onChange={(v) => {
                setDraft((d) => ({ ...d, [f.key]: v }));
                setStatus(null);
              }}
              onReset={() => reset(f.key)}
            />
          ))}
        </div>

        <div className="button-row">
          <button type="button" onClick={test} disabled={busy || !settings.hasApiKey}>
            {status === 'testing' ? 'Testing…' : 'Test'}
          </button>
          <button type="button" className="primary" onClick={save} disabled={busy || !dirty}>
            {status === 'saving' ? 'Saving…' : 'Save connection'}
          </button>
          {dirty && !busy && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setDraft(current);
                setStatus(null);
              }}
            >
              Undo changes
            </button>
          )}
          {status && !busy && (
            <span className={status.ok ? 'field-ok' : 'field-error'}>
              {status.ok ? (
                <>
                  <Icon name="check" /> {status.saved ? 'Saved. ' : ''}Connection works ({(status.ms / 1000).toFixed(1)}
                  s).
                </>
              ) : (
                <>
                  {status.saved ? 'Saved, but the test failed: ' : ''}
                  {status.error}
                </>
              )}
            </span>
          )}
        </div>
        <p className="field-hint">
          Test sends one tiny request (a fraction of a cent) to check the key and every model together.
        </p>
      </div>
    </Section>
  );
}

/* ---------- the page ---------- */

export default function Setup({ settings, onSave, onDone, onReplaceSettings, onDirtyChange }) {
  // Only this page's profile fields; resume, job and custom instructions live on the Prepare page.
  const initial = useMemo(() => setupFields(settings.profile), [settings]);
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(''); // short-lived confirmation after saving
  const [confirm, setConfirm] = useState(null); // ConfirmDialog props

  const dirty = JSON.stringify(profile) !== JSON.stringify(initial);

  // The section in view is highlighted in the side menu.
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  useEffect(() => {
    const visible = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = SECTIONS.find((s) => visible.get(s.id));
        if (first) setActiveSection(first.id);
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    for (const s of SECTIONS) {
      const el = findById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(id);
  }, [notice]);

  const setField = (key, value) => setProfile((p) => ({ ...p, [key]: value }));
  const askConfirm = (props) => setConfirm(props);

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await onSave({ profile });
      setNotice('Changes saved');
    } finally {
      setSaving(false);
    }
  };

  const discard = () =>
    askConfirm({
      title: 'Discard unsaved changes?',
      message: 'Your edits since the last save will be lost.',
      confirmLabel: 'Discard changes',
      danger: true,
      onConfirm: () => {
        setProfile(initial);
      },
    });

  const deleteEverything = () =>
    askConfirm({
      title: 'Delete all your data?',
      message:
        'This permanently deletes your resume, job description, instructions, saved API key and prepared answers from this PC. Your .env.local file is not changed. This cannot be undone.',
      confirmLabel: 'Delete everything',
      danger: true,
      onConfirm: async () => {
        const fresh = await deleteAllData();
        onReplaceSettings(fresh);
        setProfile(setupFields(fresh.profile));
        setNotice('All data deleted');
      },
    });

  // Connection status shown at the top of the page.
  const keyBadge = settings.hasApiKey ? (
    <Badge tone="info">
      <Icon name="lock" /> Connected to TailorBid
    </Badge>
  ) : (
    <Badge tone="danger">
      <Icon name="alert" /> Not connected to TailorBid
    </Badge>
  );

  const languageValue = profile.nativeLanguage || 'English';

  return (
    <div className="setup-page">
      <nav className="setup-nav" aria-label="Setup sections">
        <span className="setup-nav-title">Settings</span>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={activeSection === s.id ? 'active' : ''}
            aria-current={activeSection === s.id ? 'true' : undefined}
            onClick={(e) => {
              e.preventDefault();
              setActiveSection(s.id);
              findById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {s.title}
          </a>
        ))}
      </nav>

      <form className="setup-content" onSubmit={save} noValidate>
        <header className="setup-header">
          <div>
            <h1>Setup</h1>
            <p>How the assistant works: connection, answer style, live features and appearance.</p>
          </div>
          {keyBadge}
        </header>

        <ConnectionCard
          settings={settings}
          onSaved={onReplaceSettings}
          onTailorbidChanged={(fresh) => {
            onReplaceSettings(fresh);
            setProfile(setupFields(fresh.profile));
          }}
          askConfirm={askConfirm}
        />

        <Section id="style" title="Answer style" description="How your suggested answers should sound.">
          <div className="style-grid">
            <Segmented
              label="Tone"
              value={profile.tone || 'casual'}
              onChange={(v) => setField('tone', v)}
              options={[
                { value: 'casual', label: 'Casual', hint: 'Relaxed, like talking to a friendly teammate.' },
                { value: 'balanced', label: 'Balanced', hint: 'Friendly but professional.' },
                { value: 'formal', label: 'Formal', hint: 'Polite and professional.' },
              ]}
            />
            <Segmented
              label="English level"
              value={profile.englishLevel}
              onChange={(v) => setField('englishLevel', v)}
              options={[
                { value: 'beginner', label: 'Simple', hint: 'Very simple words and short sentences.' },
                { value: 'intermediate', label: 'Intermediate', hint: 'Clear, common words. Easy to say.' },
                { value: 'advanced', label: 'Advanced', hint: 'Natural, fluent professional English.' },
              ]}
            />
            <Segmented
              label="Answer length"
              value={profile.answerLength}
              onChange={(v) => setField('answerLength', v)}
              options={[
                { value: 'short', label: 'Short', hint: 'About 20–30 seconds to say.' },
                { value: 'medium', label: 'Medium', hint: 'About 45–60 seconds to say.' },
                { value: 'long', label: 'Long', hint: 'About 90 seconds, with a full example.' },
              ]}
            />
            <label className="field">
              <span className="field-label">Your language</span>
              <select value={languageValue} onChange={(e) => setField('nativeLanguage', e.target.value)}>
                <option value="English">English (no translation)</option>
                {/* Keep a previously typed language that isn't in the list. */}
                {translationTarget(profile.nativeLanguage) && !LANGUAGES.includes(profile.nativeLanguage) && (
                  <option value={profile.nativeLanguage}>{profile.nativeLanguage}</option>
                )}
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <span className="field-hint">Used to translate captions and answers, and to explain each question.</span>
            </label>
          </div>
        </Section>

        <Section id="features" title="Live features" description="What happens during the interview.">
          <Switch
            checked={profile.preparedAnswers ?? true}
            onChange={(v) => setField('preparedAnswers', v)}
            title="Instant answers to common questions"
            description="Prepares answers to questions like “Tell me about yourself” when you start, and shows them instantly. Costs about 10 cents once, reused until your profile changes."
          />
          <Switch
            checked={profile.earlyAnswers ?? true}
            onChange={(v) => setField('earlyAnswers', v)}
            title="Start answering before the interviewer finishes"
            description="Fastest answers. Uses a few extra API calls per question."
          />
          <Switch
            checked={profile.deliveryCues ?? true}
            onChange={(v) => setField('deliveryCues', v)}
            title="Emotion and gesture cues"
            description="Small hints in the answer like 🙂 smile, 👐 open hands or ⏸️ pause."
          />
          {(profile.deliveryCues ?? true) && (
            <div className="cue-settings">
              <Segmented
                label="How many cues"
                value={profile.cueAmount || 'some'}
                onChange={(v) => setField('cueAmount', v)}
                options={[
                  { value: 'few', label: 'Few', hint: '1–2 per answer. Just the key moments.' },
                  { value: 'some', label: 'Some', hint: '2–4 per answer.' },
                  { value: 'many', label: 'Many', hint: '4–6 per answer. Good for practising delivery.' },
                ]}
              />
              <details className="cue-legend">
                <summary>All {Object.keys(CUES).length} cues</summary>
                <div className="chips">
                  {Object.entries(CUES).map(([name, icon]) => (
                    <span key={name} className="cue">
                      {icon} {name}
                    </span>
                  ))}
                </div>
              </details>
            </div>
          )}
        </Section>

        <Section id="appearance" title="Appearance" description="How the app looks. Changes apply right away.">
          <div className="style-grid">
            <Segmented
              label="Theme"
              value={settings.theme || 'system'}
              onChange={(theme) => onSave({ theme })}
              options={[
                { value: 'system', label: 'System', hint: 'Follows your Windows light or dark setting.' },
                { value: 'light', label: 'Light', hint: 'Always light.' },
                { value: 'dark', label: 'Dark', hint: 'Always dark. Easier on the eyes in a dim room.' },
              ]}
            />
            <div className="segmented-field">
              <span className="field-label">Accent color</span>
              <div className="swatches" role="radiogroup" aria-label="Accent color">
                {ACCENTS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={(settings.accent || 'blue') === a.value}
                    aria-label={a.label}
                    title={a.label}
                    className="swatch"
                    style={{ '--swatch': a.color }}
                    onClick={() => onSave({ accent: a.value })}
                  />
                ))}
              </div>
              <span className="field-hint">Used for buttons, highlights and the answer paragraphs.</span>
            </div>
          </div>
        </Section>

        <Section id="privacy" title="Privacy & data" description="What is stored, where it goes, and how to remove it.">
          <ul className="privacy-list">
            <li>
              <Icon name="lock" />
              <div>
                <strong>Stored only on this PC.</strong> Your profile and settings are saved in a local file. A key
                entered here is encrypted with Windows protection.{' '}
                <button type="button" className="link" onClick={showDataFolder}>
                  Show file
                </button>
              </div>
            </li>
            <li>
              <Icon name="shield" />
              <div>
                <strong>Sent to OpenAI only to write answers:</strong> your resume, job description, custom instructions
                and the recent interview captions. OpenAI states that API data is not used to train its models by
                default.
              </div>
            </li>
            <li>
              <Icon name="check" />
              <div>
                <strong>Captions are made on your PC.</strong> Windows Live Captions runs locally; only the caption text
                is sent when an answer is needed.
              </div>
            </li>
          </ul>
          <div className="danger-zone">
            <div>
              <strong>Delete all my data</strong>
              <span>Removes your profile, saved key and prepared answers from this PC.</span>
            </div>
            <button type="button" className="danger-outline" onClick={deleteEverything}>
              <Icon name="trash" /> Delete all data
            </button>
          </div>
        </Section>

        <div className={`save-bar ${dirty ? 'dirty' : ''}`} role="status">
          {dirty ? (
            <>
              <span className="save-bar-text">
                <Icon name="alert" /> You have unsaved changes
              </span>
              <button type="button" className="ghost" onClick={discard} disabled={saving}>
                Discard
              </button>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            <>
              <span className="save-bar-text muted-text">
                {notice ? (
                  <span className="field-ok">
                    <Icon name="check" /> {notice}
                  </span>
                ) : (
                  'All changes saved'
                )}
              </span>
              <button
                type="button"
                className="primary"
                onClick={onDone}
                disabled={!settings.hasApiKey}
                title={settings.hasApiKey ? '' : 'Connect through TailorBid first'}
              >
                Go to Live →
              </button>
            </>
          )}
        </div>
      </form>

      {confirm && (
        <ConfirmDialog
          {...confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const action = confirm.onConfirm;
            setConfirm(null);
            await action();
          }}
        />
      )}
    </div>
  );
}
