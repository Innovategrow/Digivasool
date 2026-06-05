import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { ShieldCheck, User, Mail, Phone, ChevronRight, ArrowLeft, Lock, HardHat } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [step, setStep] = useState('choose');
  const [role, setRole] = useState('');
  const [adminName, setAdminName] = useState('');
  const [collectorName, setCollectorName] = useState('');
  const [collectors, setCollectors] = useState([]);
  const [contact, setContact] = useState('');
  const [contactType, setContactType] = useState('email');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [devOtp, setDevOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const otpRefs = useRef([]);

  const ADMIN_NAMES = ['Admin 1', 'Admin 2', 'Admin 3'];

  // Load collectors from backend
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/collectors/`)
      .then(r => r.json())
      .then(data => setCollectors(data))
      .catch(() => {});
  }, []);

  const reset = () => {
    setStep('choose'); setRole(''); setAdminName(''); setCollectorName('');
    setContact(''); setOtp(['', '', '', '', '', '']);
    setDevOtp(''); setError('');
  };

  const [signupData, setSignupData] = useState({ name: '', email: '', phone: '', address: '' });

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Signup failed');
      login('member', signupData.name);
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send OTP');
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Invalid OTP');
      login(data.role, data.name, data.phone || '');
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
      label: "I'm an Admin",
      desc: 'Full control — all loans & members',
      icon: <Lock size={22} color="white" />,
      bg: 'var(--brand)',
      border: 'var(--brand)',
      soft: 'var(--brand-soft)',
    },
    {
      id: 'collector',
      label: "I'm a Collector",
      desc: 'Record daily collections & notify admin',
      icon: <HardHat size={22} color="white" />,
      bg: '#f59e0b',
      border: '#f59e0b',
      soft: 'rgba(245,158,11,0.12)',
    },
    {
      id: 'member',
      label: "I'm a Borrower",
      desc: 'Check my loan & payment history',
      icon: <User size={22} color="white" />,
      bg: 'var(--green)',
      border: 'var(--border)',
      soft: 'var(--green-soft)',
    },
  ];

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      {/* Demo Banner */}
      <div style={{ background: 'var(--amber-soft)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 12, padding: '10px 20px', marginBottom: 24, fontSize: 13, color: 'var(--amber)', fontWeight: 600, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        🚀 <strong>Demo Mode:</strong>
        {[{role:'admin',name:'Arjun Nair'},{role:'collector',name:'Collector 1'},{role:'member',name:'Rajan Kumar'}].map(d => (
          <button key={d.role} onClick={() => login(d.role, d.name)} style={{ background: 'var(--amber)', color: '#000', border: 'none', borderRadius: 8, padding: '4px 12px', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>
            Login as {d.role.charAt(0).toUpperCase()+d.role.slice(1)}
          </button>
        ))}
      </div>
      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '24px',
          background: 'linear-gradient(135deg, var(--brand) 0%, #4f46e5 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(99,102,241,0.45)',
        }}>
          <ShieldCheck size={36} color="white" />
        </div>
        <h1 style={{
          fontSize: '28px', fontWeight: 900, letterSpacing: '-0.5px',
          background: 'linear-gradient(to right, #fff 40%, #a1a1aa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>DigitKhata Pro</h1>
        <p style={{ color: 'var(--text-2)', marginTop: '6px', fontSize: '14px' }}>Secure money lending tracker</p>
      </div>

      {/* Step Indicator */}
      {step !== 'signup' && (
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
      )}

      <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '32px' }}>

        {/* ── STEP 1: Choose Role ── */}
        {step === 'choose' && (
          <>
            <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px', textAlign: 'center' }}>Welcome!</h2>
            <p style={{ color: 'var(--text-2)', textAlign: 'center', marginBottom: '28px', fontSize: '14px' }}>How do you want to log in?</p>

            {roleCards.map(rc => (
              <button
                key={rc.id}
                id={`${rc.id}-role-btn`}
                onClick={() => { setRole(rc.id); setStep('form'); setError(''); setContactType(rc.id === 'collector' ? 'phone' : 'email'); }}
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

            <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <p style={{ color: 'var(--text-2)', fontSize: '14px', marginBottom: '12px' }}>New borrower?</p>
              <button onClick={() => { setStep('signup'); setError(''); }}
                style={{ background: 'none', border: '1px solid var(--brand)', color: 'var(--brand)', padding: '10px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                Create Borrower Account
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Contact Form ── */}
        {step === 'form' && (
          <form onSubmit={handleRequestOtp}>
            <button type="button" onClick={reset}
              style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px', marginBottom: '20px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={16} /> Back
            </button>

            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>
              {role === 'admin' ? '🔐 Admin Login' : role === 'collector' ? '🦺 Collector Login' : '👤 Borrower Login'}
            </h2>
            <p style={{ color: 'var(--text-2)', fontSize: '14px', marginBottom: '24px' }}>
              We'll send an OTP to verify your identity.
            </p>

            {role === 'admin' && (
              <div className="form-group">
                <label className="form-label">Select Your Admin Name</label>
                <select required className="form-input" value={adminName} onChange={e => setAdminName(e.target.value)} style={{ cursor: 'pointer' }}>
                  <option value="">-- Choose your name --</option>
                  {ADMIN_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
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
              <label className="form-label">Login With</label>
              {role !== 'collector' && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  {['email', 'phone'].map(t => (
                    <button key={t} type="button" onClick={() => setContactType(t)} style={{
                      flex: 1, padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                      border: `2px solid ${contactType === t ? 'var(--brand)' : 'var(--border)'}`,
                      background: contactType === t ? 'var(--brand-soft)' : 'var(--bg)',
                      color: contactType === t ? 'var(--brand-light)' : 'var(--text-2)',
                    }}>
                      {t === 'email' ? <Mail size={16} /> : <Phone size={16} />}
                      {t === 'email' ? 'Email' : 'Mobile'}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                {contactType === 'email'
                  ? <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                  : <Phone size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />}
                <input required id="contact-input"
                  type={contactType === 'email' ? 'email' : 'tel'}
                  className="form-input" style={{ paddingLeft: '42px' }}
                  value={contact} onChange={e => { setContact(e.target.value); setError(''); }}
                  placeholder={contactType === 'email' ? 'yourname@gmail.com' : '+91 9876543210'}
                  autoFocus />
              </div>
              {role === 'collector' && (
                <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '6px' }}>
                  Enter the phone number registered with your collector account.
                </p>
              )}
            </div>

            {error && <div style={{ color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
            <button id="send-otp-btn" type="submit" className="save-btn" disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send OTP →'}
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

            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>Enter OTP</h2>
            <p style={{ color: 'var(--text-2)', fontSize: '14px', marginBottom: '8px' }}>
              A 6-digit code was sent to <strong style={{ color: 'var(--text)' }}>{contact}</strong>
            </p>

            {devOtp && (
              <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '12px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: 'var(--amber)' }}>
                <strong>🛠 Dev Mode:</strong> Your OTP is <strong style={{ fontSize: '18px', letterSpacing: '4px' }}>{devOtp}</strong>
                <br /><span style={{ fontSize: '11px', opacity: 0.7 }}>(In production this would be sent to your email/phone)</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '24px' }} onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i} id={`otp-box-${i}`}
                  ref={el => otpRefs.current[i] = el}
                  type="tel" maxLength={1} value={digit}
                  onChange={e => handleOtpChange(e.target.value, i)}
                  onKeyDown={e => handleOtpKey(e, i)}
                  style={{
                    width: '48px', height: '56px', textAlign: 'center', fontSize: '24px', fontWeight: 800,
                    background: digit ? 'var(--brand-soft)' : 'var(--bg)',
                    border: `2px solid ${digit ? 'var(--brand)' : 'var(--border)'}`,
                    borderRadius: '14px', color: 'var(--text)', outline: 'none', transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>

            {error && <div style={{ color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

            <button id="verify-otp-btn" className="save-btn" onClick={handleVerifyOtp} disabled={loading || otp.join('').length < 6}>
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <button type="button" onClick={handleRequestOtp}
              style={{ width: '100%', marginTop: '12px', background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
              Didn't get it? Resend OTP
            </button>
          </div>
        )}

        {/* ── STEP 4: Signup Form ── */}
        {step === 'signup' && (
          <form onSubmit={handleSignup}>
            <button type="button" onClick={reset}
              style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '13px', marginBottom: '20px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={16} /> Back
            </button>

            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>Borrower Registration</h2>
            <p style={{ color: 'var(--text-2)', fontSize: '14px', marginBottom: '24px' }}>Enter your details to request access.</p>

            {(['name', 'email', 'phone', 'address']).map(field => (
              <div className="form-group" key={field}>
                <label className="form-label">{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                {field === 'address'
                  ? <textarea required className="form-input" rows={2} style={{ resize: 'none' }}
                      placeholder="Full address..." value={signupData[field]}
                      onChange={e => setSignupData({ ...signupData, [field]: e.target.value })} />
                  : <input required type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                      className="form-input"
                      placeholder={field === 'email' ? 'email@gmail.com' : field === 'phone' ? '+91 98765 43210' : 'Your name'}
                      value={signupData[field]}
                      onChange={e => setSignupData({ ...signupData, [field]: e.target.value })} />
                }
              </div>
            ))}

            {error && <div style={{ color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
            <button type="submit" className="save-btn" disabled={loading}>
              {loading ? 'Creating Account...' : 'Sign Up Now'}
            </button>
          </form>
        )}
      </div>

      <p style={{ color: 'var(--text-2)', fontSize: '12px', marginTop: '24px', textAlign: 'center' }}>
        DigitKhata Pro · Private & Secure · LAN Only
      </p>

      <style>{`select option { background: #18181b; color: #f4f4f5; }`}</style>
    </div>
  );
}
