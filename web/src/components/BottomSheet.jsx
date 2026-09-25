import { useEffect } from 'react';
import { X } from 'lucide-react';

// Slide-up panel anchored to the bottom of the app frame.
export default function BottomSheet({ open, title, onClose, children, dismissible = true }) {
  useEffect(() => {
    if (!open || !dismissible) return undefined;
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={() => dismissible && onClose?.()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        {title && (
          <div className="sheet-header">
            <div className="sheet-title">{title}</div>
            {dismissible && (
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
            )}
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
