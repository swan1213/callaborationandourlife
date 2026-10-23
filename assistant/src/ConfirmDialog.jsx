import { useEffect, useRef } from 'react';

/**
 * A small modal for confirming destructive actions. Escape or clicking outside cancels;
 * focus starts on the safe (cancel) button so Enter never confirms by accident.
 */
export default function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" ref={cancelRef} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
