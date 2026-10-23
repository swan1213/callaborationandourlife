import { useEffect, useRef, useState } from 'react';

const STAGES = [
  { value: 'recruiter', label: 'Recruiter call', hint: 'Background, motivation, salary, availability.' },
  { value: 'hr', label: 'HR / behavioral', hint: 'Stories about teamwork, conflict and challenges.' },
  { value: 'technical', label: 'Technical call', hint: 'Your skills, past projects and technical questions.' },
  { value: 'takehome', label: 'Take-home review', hint: 'Presenting and defending a project you built.' },
  { value: 'final', label: 'Final / hiring manager', hint: 'Fit, goals, leadership and your questions for them.' },
  { value: 'onboarding', label: 'Onboarding call', hint: 'Your first days: understanding the team and the work.' },
];

const SOURCES = [{ value: 'windows', label: 'Windows Live Captions', hint: 'Fastest and free. Recommended.' }];

// Remembers the last company/role/stage/source so a follow-up call takes one click.
const LAST_KEY = 'lastSession';
function loadLast() {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY)) || {};
  } catch {
    return {};
  }
}

// `tailorbid`: the TailorBid connection (null when not connected). Its interview fills in company and role.
export default function StartSessionDialog({ tailorbid, onStart, onCancel }) {
  const last = loadLast();
  const interview = tailorbid?.interview;
  const [company, setCompany] = useState(interview?.company || last.company || '');
  const [role, setRole] = useState(interview?.jobTitle || last.role || '');
  const [stage, setStage] = useState(last.stage || 'recruiter');
  const [source, setSource] = useState(last.source || 'windows');
  const companyRef = useRef(null);

  useEffect(() => {
    companyRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = (e) => {
    e.preventDefault();
    const meta = { company: company.trim(), role: role.trim(), stage, source };
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(meta));
    } catch {}
    onStart(meta);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal start-modal" onSubmit={submit} aria-labelledby="start-title">
        <h3 id="start-title">Start an interview</h3>
        {tailorbid ? (
          <p>It is saved to Interview History in TailorBid, where you can review it afterwards.</p>
        ) : (
          <div className="callout callout-danger">
            Not connected to TailorBid, so this interview won&apos;t be saved. Open the assistant from TailorBid to keep
            it.
          </div>
        )}

        <div className="start-grid">
          <label className="field">
            <span className="field-label">Company</span>
            <input
              ref={companyRef}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. ShopCo"
            />
          </label>
          <label className="field">
            <span className="field-label">Role</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior React Developer" />
          </label>
        </div>

        <fieldset className="choice-group">
          <legend className="field-label">Interview stage</legend>
          <div className="choice-grid">
            {STAGES.map((s) => (
              <label key={s.value} className={`choice ${stage === s.value ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="stage"
                  value={s.value}
                  checked={stage === s.value}
                  onChange={() => setStage(s.value)}
                />
                <span className="choice-title">{s.label}</span>
                <span className="choice-hint">{s.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="choice-group">
          <legend className="field-label">Listen with</legend>
          <div className="choice-row">
            {SOURCES.map((s) => (
              <label key={s.value} className={`choice ${source === s.value ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="source"
                  value={s.value}
                  checked={source === s.value}
                  onChange={() => setSource(s.value)}
                />
                <span className="choice-title">{s.label}</span>
                <span className="choice-hint">{s.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Start listening
          </button>
        </div>
      </form>
    </div>
  );
}
