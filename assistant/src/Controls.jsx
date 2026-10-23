import Icon from './Icons.jsx';

export const VIEW_MODES = [
  { value: 'full', label: 'Full', hint: 'Answer, captions and all controls' },
  { value: 'medium', label: 'Medium', hint: 'Answer and the latest captions' },
  { value: 'mini', label: 'Mini', hint: 'Only the answer, in a small window' },
];
// Suggested answer text size (A− / A+), as a multiple of the normal size.
const FONT_SCALE_MIN = 0.7;
const FONT_SCALE_MAX = 2;
const FONT_SCALE_STEP = 0.1;

// Full / Medium / Mini layout switch (also Ctrl+Shift+M).
export function ViewSwitch({ value, onChange }) {
  return (
    <div className="segmented view-switch" role="radiogroup" aria-label="Window size">
      {VIEW_MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          className={value === m.value ? 'active' : ''}
          onClick={() => onChange(m.value)}
          title={`${m.hint} (Ctrl+Shift+M to switch)`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// A− 100% A+ for the suggested answer. Clicking the percentage resets it.
export function FontSize({ value, onChange }) {
  const set = (v) => onChange(Math.round(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, v)) * 10) / 10);
  return (
    <div className="font-size" role="group" aria-label="Answer text size">
      <button
        type="button"
        onClick={() => set(value - FONT_SCALE_STEP)}
        disabled={value <= FONT_SCALE_MIN}
        title="Smaller text"
      >
        A−
      </button>
      <button type="button" className="font-size-value" onClick={() => set(1)} title="Reset to normal size">
        {Math.round(value * 100)}%
      </button>
      <button
        type="button"
        onClick={() => set(value + FONT_SCALE_STEP)}
        disabled={value >= FONT_SCALE_MAX}
        title="Bigger text"
      >
        A+
      </button>
    </div>
  );
}

// An on/off option in the top bar (Auto-answer, Translate, On top), shown as a small switch.
export function ToggleChip({ checked, onChange, disabled, title, children }) {
  return (
    <label className={`chip-toggle ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="chip-switch" aria-hidden="true" />
      {children}
    </label>
  );
}

// In compact layouts the secondary controls (Auto, Translate, On top) live in a ⋯ menu.
export function MoreMenu({ compact, children }) {
  if (!compact) return children;
  return (
    <details className="more-menu">
      <summary title="More options" aria-label="More options">
        <Icon name="more" />
      </summary>
      <div className="more-menu-panel">{children}</div>
    </details>
  );
}
