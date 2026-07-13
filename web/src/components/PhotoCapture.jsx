import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Camera, Upload, X, RefreshCw, Check } from 'lucide-react';

// Reusable photo input that supports both file upload and live camera capture.
// `value` is a base64 data URL (or null). `onChange(dataUrl)` is called on change.
export default function PhotoCapture({ value, onChange, size = 72, label }) {
  const { t } = useLanguage();
  const displayLabel = label ?? t('addPhotoDefault');
  const fileRef = useRef(null);
  const [camOpen, setCamOpen] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div
        onClick={() => (value ? null : fileRef.current?.click())}
        style={{
          width: size, height: size, borderRadius: 18, background: 'var(--surface-2)',
          border: '2px dashed var(--border)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', overflow: 'hidden', cursor: value ? 'default' : 'pointer',
          position: 'relative', flexShrink: 0,
        }}
      >
        {value
          ? <img src={value} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Camera size={Math.round(size / 2.6)} style={{ color: 'var(--text-2)' }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: value ? 0 : 6 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> {t('uploadBtn')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCamOpen(true)}>
            <Camera size={14} /> {t('cameraBtn')}
          </button>
          {value && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(null)}
              style={{ color: 'var(--red)' }}>
              <X size={14} /> {t('removeBtn')}
            </button>
          )}
        </div>
        {!value && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{displayLabel}</div>}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />

      {camOpen && (
        <CameraModal
          onClose={() => setCamOpen(false)}
          onCapture={(dataUrl) => { onChange(dataUrl); setCamOpen(false); }}
        />
      )}
    </div>
  );
}

function CameraModal({ onClose, onCapture }) {
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [facing, setFacing] = useState('user');

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startStream = async (mode) => {
    setError('');
    stopStream();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('cameraNotSupported'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setError(
        e?.name === 'NotAllowedError'
          ? t('cameraPermissionDenied')
          : t('cameraAccessError')
      );
    }
  };

  useEffect(() => {
    if (!snapshot) startStream(facing);
    return stopStream;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSnapshot(canvas.toDataURL('image/jpeg', 0.85));
    stopStream();
  };

  const retake = () => { setSnapshot(null); startStream(facing); };

  const close = () => { stopStream(); onClose(); };

  return (
    <div className="modal-backdrop" onClick={close} style={{ zIndex: 600 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
        <div className="modal-header">
          <div className="modal-title">{t('takePhoto')}</div>
          <button className="modal-close" onClick={close}><X size={16} /></button>
        </div>

        {error ? (
          <div style={{ padding: 24, color: 'var(--red)', fontSize: 14 }}>{error}</div>
        ) : (
          <div style={{ borderRadius: 16, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {snapshot
              ? <img src={snapshot} alt="snapshot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
          {snapshot ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={retake}>
                <RefreshCw size={16} /> {t('retake')}
              </button>
              <button type="button" className="btn btn-success" onClick={() => onCapture(snapshot)}>
                <Check size={16} /> {t('usePhoto')}
              </button>
            </>
          ) : !error ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
                <RefreshCw size={16} /> {t('flip')}
              </button>
              <button type="button" className="btn btn-primary" onClick={capture}>
                <Camera size={16} /> {t('capture')}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
