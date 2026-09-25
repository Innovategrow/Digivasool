import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { API_BASE_URL } from '../config';
import { ShieldCheck, Phone, ChevronRight, ArrowLeft, Lock, HardHat, Zap, Wrench, Languages, Clock3, User, Wallet } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const { t, language, setLanguage, LANGUAGES } = useLanguage();
  const [step, setStep] = useState('choose');
  const [role, setRole] = useState('');
  const [adminName, setAdminName] = useState('');
  const [collectorName, setCollectorName] = useState('');
  const [collectors, setCollectors] = useState([]);
  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [devOtp, setDevOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const otpRefs = useRef([]);

  // Load collectors from backend
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/collectors/`)
      .then(r => (r.ok ? r.json() : []))
      .then(data => setCollectors(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const reset = () => {
    setStep('choose'); setRole(''); setAdminName(''); setCollectorName('');
    setContact(''); setOtp(['', '', '', '', '', '']);
    setDevOtp(''); setError('');
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!contact.trim()) return;
    setLoading(true); setError('');
    try {
      const body = {
        contact: contact.trim(),
        role,
        admin_name: role === 'admin' ? adminName : undefined,
        collector_name: role === 'collector' ? collectorName : undefined,
      };
      const res = await fetch(`${API_BASE_URL}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to send OTP');
      if (data.status === 'pending_approval') {
        setStep('pending');
        return;
      }
      if (data.dev_mode) setDevOtp(data.dev_otp);
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    const otpStr = otp.join('');
    if (otpStr.length < 6) { setError('Please enter all 6 digits.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: contact.trim(),
          otp: otpStr,
          role,
          admin_name: role === 'admin' ? adminName : undefined,
          collector_name: role === 'collector' ? collectorName : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Invalid OTP');
      login(data.role, data.name, data.phone || contact.trim(), false, data.token);
    } catch (err) {
      setError(err.message);
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally { setLoading(false); }
  };

  const handleOtpChange = (val, idx) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKey = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'Enter' && otp.join('').length === 6) handleVerifyOtp();
  };

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const roleCards = [
    {
      id: 'admin',
      label: t('imAdmin'),
      desc: 'Full control — all loans & members',
      icon: <Lock size={22} color="white" />,
      bg: 'var(--brand)',
      border: 'var(--brand)',
      soft: 'var(--brand-soft)',
    },
    {
      id: 'collector',
      label: t('imCollector'),
      desc: 'Record daily collections & notify admin',
      icon: <HardHat size={22} color="white" />,
      bg: '#f59e0b',
      border: '#f59e0b',
      soft: 'rgba(245,158,11,0.12)',
    },
    {
      id: 'borrower',
      label: "I'm a Borrower",
      desc: 'See my loan, balance & payments',
      icon: <Wallet size={22} color="white" />,
      bg: 'var(--green)',
      border: 'var(--green)',
      soft: 'var(--green-soft)',
    },
  ];

  return (
    <div className="app-scroll"><div className="login-screen">
      {/* Language Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, padding: '6px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <Languages size={14} style={{ color: 'var(--text-2)' }} />
        <select value={language} onChange={e => setLanguage(e.target.value)}
          style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      {/* Demo Banner */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 14px', marginBottom: 24, fontSize: 12, color: 'var(--text-2)', fontWeight: 500, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Zap size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700 }}>Quick demo login:</span>
        {[{role:'admin',name:'Rahul',label:'Admin'},{role:'collector',name:'Collector 1',label:'Collector'},{role:'borrower',name:'Rajan Kumar',phone:'9876543210',label:'Borrower'}].map(d => (
          <button key={d.role} onClick={() => login(d.role, d.name, d.phone || '', true)} style={{ background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '6px 12px', minHeight: 32, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
            {d.label}
          </button>
        ))}
      </div>
      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '24px',
          background: 'linear-gradient(135deg, var(--brand) 0%, var(--violet) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', boxShadow: '0 8px 32px var(--brand-glow)',
        }}>
          <ShieldCheck size={36} color="white" />
        </div>
        <h1 style={{
          fontSize: '28px', fontWeight: 900, letterSpacing: '-0.5px',
          background: 'linear-gradient(to right, var(--text) 40%, var(--brand))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>{t('appName')}</h1>
        <p style={{ color: 'var(--text-2)', marginTop: '6px', fontSize: '14px' }}>Secure money lending tracker</p>
      </div>

      {/* Step Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        {['choose', 'form', 'otp'].map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 800,
              background: step === s ? 'var(--brand)' : (['choose', 'form', 'otp'].indexOf(step) > i ? 'var(--green)' : 'var(--surface-3)'),
              color: step === s || ['choose', 'form', 'otp'].indexOf(step) > i ? 'white' : 'var(--text-2)',
              transition: 'all 0.3s',
            }}>{i + 1}</div>
            {i < 2 && <div style={{ width: '24px', height: '2px', background: ['choose', 'form', 'otp'].indexOf(step) > i ? 'var(--green)' : 'var(--border)', borderRadius: '2px', transition: 'all 0.3s' }} />}
          </div>
        ))}
      </div>

      <div className="card login-card">

        {/* ── STEP 1: Choose Role ── */}
        {step === 'choose' && (
          <>
            <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px', textAlign: 'center' }}>{t('welcome')}</h2>
            <p style={{ color: 'var(--text-2)', textAlign: 'center', marginBottom: '28px', fontSize: '14px' }}>{t('howLogin')}</p>

            {roleCards.map(rc => (
              <button
                key={rc.id}
                id={`${rc.id}-role-btn`}
                onClick={() => { setRole(rc.id); setStep('form'); setError(''); }}
                style={{
                  width: '100%', padding: '18px 16px', borderRadius: '16px', marginBottom: '12px',
                  background: rc.soft, border: `2px solid ${rc.id === role ? rc.border : 'transparent'}`,
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '48px', height: '48px', background: rc.bg, borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {rc.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '16px' }}>{rc.label}</div>
                    <div style={{ color: 'var(--text-2)', fontSize: '13px', marginTop: '2px' }}>{rc.desc}</div>
                  </div>
                  <ChevronRight size={20} style={{ marginLeft: 'auto', color: 'var(--text-2)' }} />
                </div>
              </button>
            ))}
          </>
        )}

        {/* ── STEP 2: Contact Form ── */}
        {step === 'form' && (
          <form onSubmit={handleRequestOtp}>
            <button type="button" onClick={reset}
              style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px', marginBottom: '20px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={16} /> {t('back')}
            </button>

            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {role === 'admin' ? <Lock size={18} /> : role === 'collector' ? <HardHat size={18} /> : <Wallet size={18} />}
              {role === 'admin' ? 'Admin Login' : role === 'collector' ? 'Collector Login' : 'Borrower Login'}
            </h2>
            <p style={{ color: 'var(--text-2)', fontSize: '14px', marginBottom: '24px' }}>
              We'll send an OTP to verify your identity.
            </p>

            {role === 'admin' && (
              <div className="form-group">
                <label className="form-label">Your Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                  <input required type="text" className="form-input" style={{ paddingLeft: '42px' }}
                    value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="e.g. Rahul" />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>
                  Only approved admin numbers get in instantly — anyone else is sent to the admin for approval.
                </p>
              </div>
            )}

            {role === 'collector' && (
              <div className="form-group">
                <label className="form-label">Select Your Name</label>
                <select required className="form-input" value={collectorName} onChange={e => setCollectorName(e.target.value)} style={{ cursor: 'pointer' }}>
                  <option value="">-- Choose your name --</option>
                  {collectors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                <input required id="contact-input"
                  type="tel"
                  className="form-input" style={{ paddingLeft: '42px' }}
                  value={contact} onChange={e => { setContact(e.target.value); setError(''); }}
                  placeholder="+91 9876543210"
                  autoFocus />
              </div>
              {role === 'collector' && (
                <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>
                  Enter the phone number registered with your collector account.
                </p>
              )}
              {role === 'borrower' && (
                <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>
                  Use the mobile number you gave when your loan was created.
                </p>
              )}
            </div>

            {error && <div style={{ color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
            <button id="send-otp-btn" type="submit" className="save-btn" disabled={loading}>
              {loading ? 'Sending OTP...' : `${t('sendOtp')} →`}
            </button>
          </form>
        )}

        {/* ── STEP 3: OTP Entry ── */}
        {step === 'otp' && (
          <div>
            <button onClick={() => { setStep('form'); setError(''); setOtp(['', '', '', '', '', '']); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px', marginBottom: '20px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={16} /> Change contact
            </button>

            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>{t('enterOtp')}</h2>
            <p style={{ color: 'var(--text-2)', fontSize: '14px', marginBottom: '8px' }}>
              A 6-digit code was sent to <strong style={{ color: 'var(--text)' }}>{contact}</strong>
            </p>

            {devOtp && (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 14px', marginBottom: '20px', fontSize: '12px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wrench size={13} style={{ flexShrink: 0 }} />
                <span>Test OTP: <strong style={{ fontSize: '14px', letterSpacing: '3px', color: 'var(--text)' }}>{devOtp}</strong></span>
              </div>
            )}

            <div className="otp-row" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i} id={`otp-box-${i}`}
                  ref={el => otpRefs.current[i] = el}
                  type="tel" inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1} value={digit}
                  onChange={e => handleOtpChange(e.target.value, i)}
                  onKeyDown={e => handleOtpKey(e, i)}
                  style={{
                    background: digit ? 'var(--brand-soft)' : 'var(--bg)',
                    border: `2px solid ${digit ? 'var(--brand)' : 'var(--border)'}`,
                    color: 'var(--text)',
                  }}
                />
              ))}
            </div>

            {error && <div style={{ color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

            <button id="verify-otp-btn" className="save-btn" onClick={handleVerifyOtp} disabled={loading || otp.join('').length < 6}>
              {loading ? 'Verifying...' : t('verifySignIn')}
            </button>
            <button type="button" onClick={handleRequestOtp}
              style={{ width: '100%', marginTop: '12px', background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
              Didn't get it? Resend OTP
            </button>
          </div>
        )}

        {/* ── Waiting for admin approval ── */}
        {step === 'pending' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(245,158,11,0.12)', border: '2px solid #f59e0b',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <Clock3 size={28} color="#f59e0b" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>Waiting for approval</h2>
            <p style={{ color: 'var(--text-2)', fontSize: '14px', marginBottom: '24px' }}>
              This number isn't an approved admin yet. Your request has been sent to the admin —
              once they approve it, come back and log in with the same number.
            </p>
            <button type="button" className="save-btn" onClick={reset}>Back to login</button>
          </div>
        )}

      </div>

      <p style={{ color: 'var(--text-2)', fontSize: '12px', marginTop: '24px', textAlign: 'center' }}>
        {t('appName')} · Private & Secure
      </p>

      <style>{`select option { background: #ffffff; color: #111827; }`}</style>
    </div></div>
  );
}
