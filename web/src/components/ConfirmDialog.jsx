import { AlertTriangle } from 'lucide-react';

// Centered mobile confirmation dialog. `busy` locks it while the action runs.
export default function ConfirmDialog({
  open, title, children, confirmLabel = 'Confirm', busyLabel = 'Working…', cancelLabel = 'Cancel',
  tone = 'danger', busy = false, confirmDisabled = false, onConfirm, onCancel,
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={() => !busy && onCancel?.()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className={`dialog-icon ${tone}`}><AlertTriangle size={24} /></div>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy || confirmDisabled} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
