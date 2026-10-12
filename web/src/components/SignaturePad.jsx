import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// Optional finger/mouse signature. `onChange(dataUrl | null)` fires when a stroke ends or it is cleared.
export default function SignaturePad({ onChange, height = 140 }) {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = height * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
  }, [height]);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e) => {
    drawing.current = true;
    canvasRef.current.setPointerCapture?.(e.pointerId);
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    // White background so the PNG is readable on dark themes too
    const c = canvasRef.current;
    const out = document.createElement('canvas');
    out.width = c.width; out.height = c.height;
    const octx = out.getContext('2d');
    octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(c, 0, 0);
    onChange(out.toDataURL('image/png'));
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <div style={{ position: 'relative', background: '#fff', border: '2px dashed var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
          style={{ width: '100%', height, display: 'block', touchAction: 'none' }} />
        {!hasInk && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 13, pointerEvents: 'none' }}>
            {t('signHere')}
          </span>
        )}
      </div>
      {hasInk && (
        <button type="button" className="btn" onClick={clear} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <Eraser size={14} /> {t('clearSignature')}
        </button>
      )}
    </div>
  );
}
