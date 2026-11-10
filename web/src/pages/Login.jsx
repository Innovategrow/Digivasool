import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { API_BASE_URL } from '../config';
import { ShieldCheck, Phone, ArrowLeft, Languages, Wrench, Building2, ChevronRight, User, Plus } from 'lucide-react';

const EMPTY_OTP = ['', '', '', '', '', ''];
const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', COLLECTOR: 'Collector', BORROWER: 'Borrower' };

async function post(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.');
  return data;
}

// Phone -> OTP -> straight in (one organisation) | choose one (several) | create yours (none).
export default function Login() {
  const { login } = useAuth();
  const { t, language, setLanguage, LANGUAGES } = useLanguage();
  const [step, setStep] = useState('phone');           // phone | otp | select | register
  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState(EMPTY_OTP);
  const [devOtp, setDevOtp] = useState('');
  const [orgs, setOrgs] = useState([]);
  const [selectionToken, setSelectionToken] = useState('');
  const [registrationToken, setRegistrationToken] = useState('');
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const otpRefs = useRef([]);

  const run = async (fn) => {
    setLoading(true); setError('');
    try { await fn(); } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const reset = () => {
    setStep('phone'); setOtp(EMPTY_OTP); setDevOtp(''); setError(''); setOrgs([]);
    setSelectionToken(''); setRegistrationToken(''); setOrgName(''); setAdminName('');
  };

  const requestOtp = (e) => {
    e?.preventDefault();
    if (!contact.trim()) return;
    run(async () => {
      const data = await post('/api/auth/request-otp', { contact: contact.trim() });
      setDevOtp(data.dev_mode ? data.dev_otp : '');
      setOtp(EMPTY_OTP);
      setStep('otp');
    });
  };

  const verifyOtp = () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Please enter all 6 digits.'); return; }
    run(async () => {
      try {
        const data = await post('/api/auth/verify-otp', { contact: contact.trim(), otp: code });
        if (data.status === 'ok') return login(data);
        if (data.status === 'select_org') { setOrgs(data.organizations); setSelectionToken(data.selection_token); setStep('select'); return; }
        setRegistrationToken(data.registration_token); setStep('register');
      } catch (err) {
        setOtp(EMPTY_OTP); otpRefs.current[0]?.focus();
        throw err;
      }
    });
  };

  const chooseOrg = (o) => run(async () => {
    login(await post('/api/organizations/select', { selection_token: selectionToken, organization_id: o.organization_id, role: o.role }));
  });

  const registerOrg = (e) => {
    e.preventDefault();
    run(async () => {
      login(await post('/api/organizations/register', {
        registration_token: registrationToken || selectionToken, organization_name: orgName.trim(), admin_name: adminName.trim(),
      }));
    });
  };

  const onOtpChange = (val, idx) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp]; next[idx] = val; setOtp(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  };
  const onOtpKey = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'Enter' && otp.join('').length === 6) verifyOtp();
  };
  const onOtpPaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) { setOtp(pasted.split('')); otpRefs.current[5]?.focus(); }
    e.preventDefault();
  };

  const back = (to, label) => (
    <button type="button" className="login-back" onClick={() => { setError(''); to(); }}>
      <ArrowLeft size={16} /> {label}
    </button>
  );
  const alert = error && <div className="login-error" role="alert">{error}</div>;
  const stepIndex = { phone: 0, otp: 1, select: 2, register: 2 }[step];

  return (
    <div className="app-scroll"><div className="login-screen">
      <div className="login-lang">
        <Languages size={14} style={{ color: 'var(--text-2)' }} />
        <select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Language">
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      <div className="login-brand">
        <div className="login-logo"><ShieldCheck size={36} color="white" /></div>
        <h1>{t('appName')}</h1>
        <p>Secure money lending tracker</p>
      </div>

      <div className="login-steps" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <div key={i} className="login-step-wrap">
            <div className={`wizard-step-dot ${stepIndex === i ? 'active' : stepIndex > i ? 'done' : 'pending'}`}>{i + 1}</div>
            {i < 2 && <div className={`login-step-line${stepIndex > i ? ' is-done' : ''}`} />}
          </div>
        ))}
      </div>

      <div className="card login-card">
        {step === 'phone' && (
          <form onSubmit={requestOtp}>
            <h2 className="login-title">{t('welcome')}</h2>
            <p className="login-sub">Enter your mobile number. New here? You can set up your own organisation in the next steps.</p>
            <div className="form-group">
              <label className="form-label" htmlFor="contact-input">Mobile number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={18} className="login-field-icon" />
                <input required id="contact-input" type="tel" inputMode="tel" autoComplete="tel" className="form-input"
                  style={{ paddingLeft: 42 }} value={contact} onChange={e => { setContact(e.target.value); setError(''); }}
                  placeholder="+91 9876543210" autoFocus />
              </div>
              <p className="login-hint">Admins, collectors and borrowers all sign in here — we'll find your organisation automatically.</p>
            </div>
            {alert}
            <button id="send-otp-btn" type="submit" className="save-btn" disabled={loading || !contact.trim()}>
              {loading ? 'Sending OTP…' : `${t('sendOtp')} →`}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <div>
            {back(() => { setStep('phone'); setOtp(EMPTY_OTP); }, 'Change number')}
            <h2 className="login-title" style={{ textAlign: 'left' }}>{t('enterOtp')}</h2>
            <p className="login-sub" style={{ textAlign: 'left', marginBottom: 8 }}>
              A 6-digit code was sent to <strong style={{ color: 'var(--text)' }}>{contact}</strong>
            </p>
            {devOtp && (
              <div className="login-devotp"><Wrench size={13} style={{ flexShrink: 0 }} />
                <span>Test OTP: <strong>{devOtp}</strong></span></div>
            )}
            <div className="otp-row" onPaste={onOtpPaste}>
              {otp.map((digit, i) => (
                <input key={i} id={`otp-box-${i}`} ref={el => { otpRefs.current[i] = el; }} aria-label={`Digit ${i + 1}`}
                  type="tel" inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1} value={digit}
                  onChange={e => onOtpChange(e.target.value, i)} onKeyDown={e => onOtpKey(e, i)}
                  style={{ background: digit ? 'var(--brand-soft)' : 'var(--bg)', border: `2px solid ${digit ? 'var(--brand)' : 'var(--border)'}`, color: 'var(--text)' }} />
              ))}
            </div>
            {alert}
            <button id="verify-otp-btn" className="save-btn" onClick={verifyOtp} disabled={loading || otp.join('').length < 6}>
              {loading ? 'Verifying…' : t('verifySignIn')}
            </button>
            <button type="button" className="login-link" onClick={requestOtp} disabled={loading}>Didn't get it? Resend OTP</button>
          </div>
        )}

        {step === 'select' && (
          <div>
            <h2 className="login-title">Choose organisation</h2>
            <p className="login-sub">Your number belongs to more than one organisation.</p>
            {orgs.map(o => (
              <button key={`${o.organization_id}-${o.role}`} type="button" className="org-row" disabled={loading} onClick={() => chooseOrg(o)}>
                <span className="org-row-icon"><Building2 size={20} /></span>
                <span className="org-row-text">
                  <span className="org-row-name">{o.organization_name}</span>
                  <span className="org-row-role">{ROLE_LABEL[o.role] || o.role}</span>
                </span>
                <ChevronRight size={18} style={{ color: 'var(--text-2)' }} />
              </button>
            ))}
            <button type="button" className="login-link" onClick={() => setStep('register')}><Plus size={14} /> Create a new organisation</button>
            {alert}
          </div>
        )}

        {step === 'register' && (
          <form onSubmit={registerOrg}>
            {back(() => (selectionToken ? setStep('select') : reset()), 'Back')}
            <h2 className="login-title" style={{ textAlign: 'left' }}>Set up your organisation</h2>
            <p className="login-sub" style={{ textAlign: 'left' }}>
              {selectionToken ? 'Create another organisation.' : "This number isn't part of an organisation yet."} You'll be its owner and first admin, with your own private borrowers, loans and staff.
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="org-name">Organisation name</label>
              <div style={{ position: 'relative' }}>
                <Building2 size={18} className="login-field-icon" />
                <input required id="org-name" className="form-input" style={{ paddingLeft: 42 }} minLength={2} maxLength={80}
                  value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="e.g. Sri Lakshmi Finance" autoFocus />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="admin-name">Your name</label>
              <div style={{ position: 'relative' }}>
                <User size={18} className="login-field-icon" />
                <input required id="admin-name" className="form-input" style={{ paddingLeft: 42 }} minLength={2} maxLength={100}
                  value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="e.g. Rahul" />
              </div>
            </div>
            <p className="login-hint" style={{ marginBottom: 14 }}>
              Collector or borrower? Your lender adds your number — ask them, then sign in again.
            </p>
            {alert}
            <button id="register-org-btn" type="submit" className="save-btn" disabled={loading || orgName.trim().length < 2 || adminName.trim().length < 2}>
              {loading ? 'Creating…' : 'Create organisation →'}
            </button>
          </form>
        )}
      </div>

      <nav className="login-legal" aria-label="Legal">
        <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>
        <span aria-hidden="true">·</span>
        <a href="/terms.html" target="_blank" rel="noreferrer">Terms</a>
        <span aria-hidden="true">·</span>
        <a href="/delete-account.html" target="_blank" rel="noreferrer">Delete account</a>
      </nav>
      <p className="login-foot">{t('appName')} · Private &amp; Secure</p>
    </div></div>
  );
}
