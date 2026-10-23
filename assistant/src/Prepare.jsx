import { useEffect, useMemo, useState } from 'react';
import { analyzeProject, deleteProject, listProjects, pickProject } from './api.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import Icon from './Icons.jsx';
import {
  INSTRUCTIONS_LIMIT,
  ImportableText,
  PREPARE_FIELDS,
  Section,
  Icon as SetupIcon,
  removeContactDetails,
} from './Setup.jsx';

const cleanError = (err) => err.message;
const kb = (chars) => `${Math.max(1, Math.round(chars / 1024))} KB`;

function PrepSheet({ item, active, onToggleActive }) {
  const a = item.analysis;
  return (
    <div className="prep-sheet">
      <section className="card">
        <div className="card-head sheet-head">
          <div>
            <h3>{item.name}</h3>
            <p>
              Prep sheet from {new Date(item.createdAt).toLocaleString()} · {item.folder}
            </p>
          </div>
          <UseButton active={active} onClick={onToggleActive} />
        </div>
        {active && (
          <div className="callout">
            In use: during interviews, answers about this project use its real files and decisions, and the code they
            mention is shown under the answer. The code is read from this folder on your PC and is not sent.
          </div>
        )}
        <p className="prep-text">{a.overview}</p>
        <div className="chips">
          {a.techStack.map((t) => (
            <span key={t} className="badge">
              {t}
            </span>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>How it fits together</h3>
        </div>
        <p className="prep-text">{a.architecture}</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Decisions you'll be asked about</h3>
          <p>Why you built it this way, and an easy way to say it.</p>
        </div>
        <div className="prep-list">
          {a.keyDecisions.map((d, i) => (
            <div key={i} className="prep-item">
              <strong>{d.decision}</strong>
              <p>{d.why}</p>
              <blockquote>“{d.howToSay}”</blockquote>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Likely questions</h3>
          <p>Click a question to see a suggested answer. Practice saying them out loud.</p>
        </div>
        {a.likelyQuestions.map((q, i) => (
          <details key={i} className="prep-question">
            <summary>{q.question}</summary>
            <blockquote>“{q.answer}”</blockquote>
          </details>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Weak spots, and how to talk about them</h3>
          <p>Interviewers respect honesty. Mention these calmly, with your plan to fix them.</p>
        </div>
        <div className="prep-list">
          {a.weakSpots.map((w, i) => (
            <div key={i} className="prep-item">
              <strong>{w.issue}</strong>
              <blockquote>{w.howToAddress}</blockquote>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>"With more time, I would…"</h3>
        </div>
        <ul className="prep-bullets">
          {a.improvements.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Words to practice</h3>
          <p>Stressed syllables are in CAPITALS.</p>
        </div>
        <table className="terms">
          <thead>
            <tr>
              <th>Word</th>
              <th>Say it</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {a.terms.map((t, i) => (
              <tr key={i}>
                <td>{t.term}</td>
                <td className="say">{t.pronunciation}</td>
                <td>{t.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function UseButton({ active, onClick }) {
  return (
    <button type="button" className={active ? 'in-use' : ''} onClick={onClick} aria-pressed={active}>
      {active ? '✓ In use for interviews' : 'Use in interview'}
    </button>
  );
}

// Resume, job description and custom instructions: what every answer is based on.
// Saves only these fields; the rest of the profile is edited in Setup.
function ProfileEditor({ settings, onSave, onDirtyChange, askConfirm }) {
  const saved = useMemo(
    () => Object.fromEntries(PREPARE_FIELDS.map((k) => [k, settings.profile[k] || ''])),
    [settings],
  );
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [contactNote, setContactNote] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]); // leaving the page clears it
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(id);
  }, [notice]);

  const setField = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await onSave({ profile: draft });
      setNotice('Saved. New answers use it right away.');
    } finally {
      setSaving(false);
    }
  };

  const discard = () =>
    askConfirm({
      title: 'Discard unsaved changes?',
      message: 'Your edits to the resume, job description and instructions since the last save will be lost.',
      confirmLabel: 'Discard changes',
      danger: true,
      onConfirm: () => setDraft(saved),
    });

  const stripContacts = () => {
    const { text, count } = removeContactDetails(draft.resume);
    setField('resume', text);
    setContactNote(
      count
        ? `Removed ${count} contact detail${count > 1 ? 's' : ''}. Save to keep the change.`
        : 'No emails, phone numbers or profile links found.',
    );
  };

  return (
    <form className="profile-editor" onSubmit={save} noValidate>
      <Section
        id="profile"
        title="Your profile"
        description="Answers are based only on what you write here, so the AI never invents jobs or degrees."
      >
        <ImportableText
          label="Resume"
          rows={9}
          value={draft.resume}
          onChange={(v) => {
            setField('resume', v);
            setContactNote('');
          }}
          onAskConfirm={askConfirm}
          placeholder="Import your resume (PDF, Word or text), or paste it here…"
          hint={
            contactNote || "Tip: your email, phone number and address aren't needed. Remove them to keep them private."
          }
          extraAction={
            draft.resume && (
              <button
                type="button"
                className="ghost"
                onClick={stripContacts}
                title="Remove emails, phone numbers and profile links"
              >
                <SetupIcon name="shield" /> Remove contact details
              </button>
            )
          }
        />
        <ImportableText
          label="Job description"
          rows={6}
          value={draft.jobDescription}
          onChange={(v) => setField('jobDescription', v)}
          onAskConfirm={askConfirm}
          placeholder="Import the job posting from a file, or type / paste it here…"
          hint="Helps the AI connect your experience to what this job needs."
        />
      </Section>

      <Section
        id="instructions"
        title="Custom instructions"
        description="Optional. Tell the AI anything it should always (or never) do. Used for every answer."
      >
        <div className="field">
          <textarea
            rows={5}
            value={draft.customPrompt}
            maxLength={INSTRUCTIONS_LIMIT}
            onChange={(e) => setField('customPrompt', e.target.value)}
            placeholder={`For example:
- Always mention my AWS certification when relevant.
- I'm applying for a team lead role, so highlight leadership.
- Never say I have used Kubernetes.`}
          />
          <div className="field-foot">
            <span className="field-hint">Answers keep the same layout and never invent facts.</span>
            <span className="counter">
              {draft.customPrompt.length} / {INSTRUCTIONS_LIMIT}
            </span>
          </div>
        </div>
      </Section>

      {(dirty || notice) && (
        <div className={`save-bar ${dirty ? 'dirty' : ''}`} role="status">
          {dirty ? (
            <>
              <span className="save-bar-text">You have unsaved changes</span>
              <button type="button" className="ghost" onClick={discard} disabled={saving}>
                Discard
              </button>
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            <span className="save-bar-text field-ok">
              <Icon name="check" /> {notice}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

export default function Prepare({ settings, onSave, onDirtyChange, hasApiKey, activeProjectId, onSetActive }) {
  const [saved, setSaved] = useState([]);
  const [scan, setScan] = useState(null); // folder waiting for confirmation
  const [status, setStatus] = useState(''); // '' | 'scanning' | 'analyzing'
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    listProjects().then(setSaved);
  }, []);

  const choose = async () => {
    setError('');
    setStatus('scanning');
    try {
      const result = await pickProject();
      if (result && result.fileCount === 0) setError('No source files were found in that folder.');
      else setScan(result);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setStatus('');
    }
  };

  const analyze = async () => {
    const token = scan.token;
    setScan(null);
    setError('');
    setStatus('analyzing');
    try {
      const item = await analyzeProject(token);
      setSaved((s) => [item, ...s]);
      setOpenId(item.id);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setStatus('');
    }
  };

  const remove = (item) =>
    setConfirm({
      title: `Delete the prep sheet for "${item.name}"?`,
      message: 'This removes it from this PC. Your project files are not touched.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        await deleteProject(item.id);
        setSaved((s) => s.filter((x) => x.id !== item.id));
        if (openId === item.id) setOpenId(null);
      },
    });

  const open = saved.find((s) => s.id === openId);

  return (
    <div className="setup-page">
      <div className="setup-content prepare">
        <header className="setup-header page-header">
          <div>
            <h1>Prepare</h1>
            <p>
              Your background, the job you're applying for, and your take-home project. Answers use only what's here.
            </p>
          </div>
        </header>

        {!open && (
          <ProfileEditor settings={settings} onSave={onSave} onDirtyChange={onDirtyChange} askConfirm={setConfirm} />
        )}

        {!open && (
          <div className="section-title">
            <div>
              <h2>Take-home project</h2>
              <p>Optional. Get ready to present and defend a project you built, in simple English.</p>
            </div>
            {(saved.length > 0 || status !== '' || scan) && (
              <button className="primary" onClick={choose} disabled={!hasApiKey || status !== ''}>
                <Icon name="folder" /> {status === 'scanning' ? 'Reading folder…' : 'New prep sheet…'}
              </button>
            )}
          </div>
        )}

        {!hasApiKey && (
          <div className="callout">Open the assistant from TailorBid first (Interview Assistant button).</div>
        )}
        {error && <div className="callout callout-danger">{error}</div>}

        {scan && (
          <section className="card confirm-card">
            <div className="card-head">
              <h3>Send “{scan.name}” for analysis?</h3>
              <p>
                {scan.fileCount} files ({kb(scan.totalChars)}) will be sent to OpenAI to write your prep sheet. Make
                sure the project contains nothing private.
              </p>
            </div>
            <details>
              <summary>Files that will be sent</summary>
              <ul className="file-list">
                {scan.files.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
            {scan.skipped.length > 0 && (
              <details>
                <summary>Not sent ({scan.skipped.length})</summary>
                <ul className="file-list">
                  {scan.skipped.map((f) => (
                    <li key={f.path}>
                      {f.path} <span className="muted">· {f.reason}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="button-row">
              <button type="button" onClick={() => setScan(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={analyze}>
                Analyze project
              </button>
            </div>
          </section>
        )}

        {status === 'analyzing' && (
          <section className="card">
            <p className="prep-text">
              Reading your code and writing your prep sheet… This usually takes 20–60 seconds.
            </p>
          </section>
        )}

        {open ? (
          <>
            <div className="button-row">
              <button type="button" className="ghost back-link" onClick={() => setOpenId(null)}>
                <Icon name="back" /> All prep sheets
              </button>
            </div>
            <PrepSheet
              item={open}
              active={open.id === activeProjectId}
              onToggleActive={() => onSetActive(open.id === activeProjectId ? null : open)}
            />
          </>
        ) : (
          saved.length > 0 && (
            <ul className="history-list">
              {saved.map((item) => (
                <li key={item.id} className="history-row">
                  <button type="button" className="history-open" onClick={() => setOpenId(item.id)}>
                    <span className="avatar" aria-hidden="true">
                      <Icon name="code" />
                    </span>
                    <span className="history-main">
                      <span className="history-title">
                        {item.name}
                        {item.id === activeProjectId && <span className="tag tag-ok">In use</span>}
                      </span>
                      <span className="meta-line">
                        <span>Prepared {new Date(item.createdAt).toLocaleDateString()}</span>
                        {item.folder && <span className="meta-path">{item.folder}</span>}
                      </span>
                    </span>
                    <Icon name="chevron" className="icon chevron" />
                  </button>
                  <button
                    type="button"
                    className="ghost icon-button danger-text"
                    onClick={() => remove(item)}
                    title="Delete this prep sheet"
                    aria-label={`Delete ${item.name}`}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        {!open && !scan && status === '' && saved.length === 0 && hasApiKey && (
          <section className="card">
            <div className="empty-state">
              <div className="empty-icon">
                <Icon name="code" />
              </div>
              <h3>Prepare for your take-home review</h3>
              <p>Choose the folder of the project you built. You get a prep sheet in simple English with:</p>
              <ul className="feature-list">
                <li>
                  <Icon name="check" /> An overview and how the parts fit together
                </li>
                <li>
                  <Icon name="check" /> The decisions you'll be asked about, and how to explain them
                </li>
                <li>
                  <Icon name="check" /> Likely questions with suggested answers
                </li>
                <li>
                  <Icon name="check" /> Weak spots to address honestly, and words to practise
                </li>
              </ul>
              <button className="primary" onClick={choose} disabled={status !== ''}>
                <Icon name="folder" /> Choose project folder…
              </button>
            </div>
          </section>
        )}
      </div>

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
