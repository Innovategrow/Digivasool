import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  UserPlus, IndianRupee, ShieldCheck, Mail, Phone, MapPin,
  CheckCircle, Building2, Users, Wallet,
  Key, PhoneCall, User, Shield, ChevronDown, ChevronUp, GitMerge,
  Calendar, CalendarDays, CalendarRange, Settings2, Check, X, Wrench,
  MessageSquare, Languages, Hash, ExternalLink, CheckCircle2, Search,
  ArrowUpDown, Eye, Trash2, Pencil, MoreVertical, ArrowLeft, History, Store,
} from 'lucide-react';
import { apiFetch, newIdempotencyKey, readError } from '../../utils/api';
import { API_BASE_URL } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { ZONES } from '../../context/AppDataContext';
import PhotoCapture from '../../components/PhotoCapture';
import BottomSheet from '../../components/BottomSheet';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';

function resolveProofUrl(url) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return `${API_BASE_URL}${url}`;
}

// SMS to the borrower can be sent in any of these Indian languages
const SMS_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi हिन्दी' },
  { value: 'ta', label: 'Tamil தமிழ்' },
  { value: 'te', label: 'Telugu తెలుగు' },
  { value: 'kn', label: 'Kannada ಕನ್ನಡ' },
  { value: 'ml', label: 'Malayalam മലയാളം' },
];

const money = value => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const digitsOnly = value => String(value || '').replace(/\D/g, '');
const samePhone = (a, b) => {
  const clean = v => { const d = digitsOnly(v); return d.length === 12 && d.startsWith('91') ? d.slice(2) : d; };
  return Boolean(clean(a)) && clean(a) === clean(b);
};
const formatDate = value => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ── OTP Verifier sub-component ─────────────────────────────────────────────
function OtpVerifier({ phone, onVerified }) {
  const { t } = useLanguage();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [devOtp, setDevOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const refs = useRef([]);

  const sendOtp = async () => {
    if (!phone) return;
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/auth/borrower/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send OTP');
      if (data.dev_otp) setDevOtp(data.dev_otp);
      setSent(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/auth/borrower/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: otp.join('') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Wrong OTP');
      setVerified(true);
      onVerified();
    } catch (e) { setError(e.message); setOtp(['', '', '', '', '', '']); }
    finally { setLoading(false); }
  };

  const handleChange = (val, i) => {
    if (!/^\d?$/.test(val)) return;
    const n = [...otp]; n[i] = val; setOtp(n);
    if (val && i < 5) refs.current[i + 1]?.focus();
  };
  const handleKey = (e, i) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs.current[i - 1]?.focus();
  };

  if (verified) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(16,185,129,.1)', borderRadius: 10, border: '1px solid rgba(16,185,129,.3)' }}>
      <CheckCircle size={16} style={{ color: 'var(--green)' }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{t('phoneVerified')}</span>
    </div>
  );

  return (
    <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', marginTop: 8 }}>
      {!sent ? (
        <button type="button" onClick={sendOtp} disabled={!phone || loading}
          style={{ width: '100%', padding: '10px', background: 'var(--brand-soft)', border: '1px solid var(--brand)', color: 'var(--brand-light)', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Phone size={14} /> {loading ? t('otpSending') : t('sendOtpToVerifyPhone')}
        </button>
      ) : (
        <div>
          {devOtp && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={12} /> {t('testOtpLabel')} <strong style={{ letterSpacing: 3 }}>{devOtp}</strong></div>}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {otp.map((d, i) => (
              <input key={i} ref={el => refs.current[i] = el} type="tel" maxLength={1} value={d}
                onChange={e => handleChange(e.target.value, i)} onKeyDown={e => handleKey(e, i)}
                style={{ width: 36, height: 42, textAlign: 'center', fontSize: 18, fontWeight: 800, background: d ? 'var(--brand-soft)' : 'var(--surface-2)', border: `2px solid ${d ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10, color: 'var(--text)', outline: 'none' }} />
            ))}
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button type="button" onClick={verifyOtp} disabled={otp.join('').length < 6 || loading}
            style={{ width: '100%', padding: '10px', background: 'var(--green)', border: 'none', color: 'white', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Check size={14} /> {loading ? t('otpVerifying') : t('verifyOtpBtn')}
          </button>
        </div>
      )}
      {error && !sent && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function MergeModal({ loans, onClose, onMerge }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState([]);
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < 2 ? [...s, id] : s);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(6px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', padding: 24, animation: 'slideUp 0.3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{t('mergeBorrowers')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'flex' }}><X size={22} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>{t('mergeBorrowersDesc')}</p>
        <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
          {loans.map(b => (
            <div key={b.id} onClick={() => toggle(b.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `2px solid ${selected.includes(b.id) ? 'var(--brand)' : 'var(--border)'}`, background: selected.includes(b.id) ? 'var(--brand-soft)' : 'var(--surface-2)', cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--brand-light)' }}>{b.customer_name.charAt(0)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{b.customer_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{b.customer_phone || t('noPhone')} · {t('outstandingColon')} ₹{b.pending_amount.toLocaleString()}</div>
              </div>
              {selected.includes(b.id) && <Check size={18} style={{ color: 'var(--green)' }} />}
            </div>
          ))}
        </div>
        <button className="save-btn" style={{ width: '100%' }} disabled={selected.length !== 2}
          onClick={() => { onMerge(selected[0], selected[1]); onClose(); }}>
          <GitMerge size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> {t('mergeSelected')}
        </button>
      </div>
    </div>
  );
}


const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'settled', label: 'Settled' },
];

function getLoanMetrics(loan) {
  const dueAmount = loan.due_amount || 0;
  const pendingAmount = loan.pending_amount || 0;
  const collectedAmount = loan.collected_amount || 0;
  const progress = dueAmount > 0 ? Math.min((collectedAmount / dueAmount) * 100, 100) : 0;
  const isSettled = pendingAmount <= 0;
  const dueDate = loan.closing_date ? new Date(loan.closing_date) : null;
  const isOverdue = !isSettled && dueDate && !Number.isNaN(dueDate.getTime()) && dueDate < new Date();
  const status = isSettled ? 'settled' : isOverdue ? 'overdue' : loan.status || 'active';
  return { dueAmount, pendingAmount, collectedAmount, progress, status };
}

function StatusBadge({ status }) {
  const cls = status === 'settled' ? 'badge-green' : status === 'overdue' ? 'badge-red' : status === 'active' ? 'badge-indigo' : 'badge-gray';
  return <span className={`badge ${cls}`}>{status}</span>;
}


function PaymentHistorySection({ loanId }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/loans/${loanId}/payments`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setPayments(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setPayments([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loanId]);

  if (loading) {
    return (
      <div className="customer-payment-history">
        <SectionLabel>Payment History</SectionLabel>
        <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
      </div>
    );
  }
  if (payments.length === 0) {
    return (
      <div className="customer-payment-history">
        <SectionLabel>Payment History</SectionLabel>
        <div className="muted-note">No payments recorded yet.</div>
      </div>
    );
  }

  return (
    <div className="customer-payment-history">
      <SectionLabel>Payment History</SectionLabel>
      {payments.map(p => {
        const isGPay = p.payment_method === 'GPay';
        const isNotPaid = Number(p.amount || 0) <= 0;
        const expanded = expandedId === p.id;
        const paymentDate = new Date(p.payment_date);
        const dateLabel = Number.isNaN(paymentDate.getTime()) ? '' : paymentDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        return (
          <div key={p.id} className="payment-history-row">
            <button
              type="button"
              className="payment-history-row-main"
              onClick={() => isGPay && setExpandedId(expanded ? null : p.id)}
              style={{ cursor: isGPay ? 'pointer' : 'default' }}
            >
              <div>
                <strong>{isNotPaid ? 'Not paid' : `₹${Number(p.amount || 0).toLocaleString('en-IN')}`}</strong>
                <span>{dateLabel} {p.collector_name ? `· ${p.collector_name}` : ''}</span>
              </div>
              <span className={`badge ${isGPay ? 'badge-indigo' : 'badge-gray'}`}>{p.payment_method}</span>
            </button>
            {expanded && isGPay && (
              <div className="payment-receipt-mini">
                <div><span>Receipt No.</span><strong>{String(p.id).slice(-8).toUpperCase()}</strong></div>
                <div><span>Collected by</span><strong>{p.collector_name || '—'}</strong></div>
                <div><span>Notes</span><strong>{p.notes || '—'}</strong></div>
                <div>
                  <span>Payment proof</span>
                  {p.proof_url ? (
                    <a href={resolveProofUrl(p.proof_url)} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-light)', fontWeight: 700 }}>
                      View {p.proof_filename || 'proof'}
                    </a>
                  ) : (
                    <strong style={{ color: 'var(--text-3)' }}>Not uploaded yet</strong>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ── Borrower list card ──────────────────────────────────────────────────────
function BorrowerCard({ loan, onOpen, onMenu }) {
  const metrics = getLoanMetrics(loan);
  return (
    <article className="borrower-row" onClick={() => onOpen(loan)}>
      <div className="customer-avatar">{loan.photo_url ? <img src={loan.photo_url} alt="" /> : loan.customer_name.charAt(0).toUpperCase()}</div>
      <div className="borrower-row-main">
        <h3>{loan.customer_name}</h3>
        <p>{[loan.customer_phone, loan.zone].filter(Boolean).join(' · ') || 'No phone'}</p>
        <div className="borrower-row-amount">
          <span>Outstanding</span>
          <strong className={metrics.pendingAmount <= 0 ? 'settled' : ''}>{money(metrics.pendingAmount)}</strong>
          <StatusBadge status={metrics.status} />
        </div>
        <div className="customer-progress">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${metrics.progress}%`, background: 'var(--green)' }} /></div>
          <span>{Math.round(metrics.progress)}%</span>
        </div>
      </div>
      {onMenu && (
        <button type="button" className="icon-btn row-menu-btn" aria-label={`Actions for ${loan.customer_name}`}
          onClick={e => { e.stopPropagation(); onMenu(loan); }}>
          <MoreVertical size={20} />
        </button>
      )}
    </article>
  );
}

// ── Borrower details screen ─────────────────────────────────────────────────
function BorrowerDetails({ loan, relatedLoans, canManage, onBack, onEdit, onDelete, onCloseLoan, onOpenLoan }) {
  const metrics = getLoanMetrics(loan);
  const cashDisbursed = Math.max(0, (loan.loan_amount || 0) - (loan.monthly_interest_amount || 0));
  const activeLoans = relatedLoans.filter(l => getLoanMetrics(l).pendingAmount > 0 && l.status !== 'closed');

  return (
    <div className="screen animate-fadeUp">
      <div className="screen-header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to borrowers"><ArrowLeft size={20} /></button>
        <div className="screen-header-title">Borrower Details</div>
      </div>

      <section className="detail-hero">
        <div className="customer-avatar lg">{loan.photo_url ? <img src={loan.photo_url} alt="" /> : loan.customer_name.charAt(0).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <h2>{loan.customer_name}</h2>
          <p>{loan.shop_name || loan.zone || 'Borrower'}</p>
          {loan.account_number && <span className="badge badge-gray"><Hash size={11} /> A/C {loan.account_number}</span>}
        </div>
      </section>

      <section className="customer-detail-balance">
        <div>
          <span>Outstanding</span>
          <strong>{money(metrics.pendingAmount)}</strong>
        </div>
        <StatusBadge status={metrics.status} />
      </section>
      <div className="progress-bar" style={{ marginBottom: 14 }}>
        <div className="progress-fill" style={{ width: `${metrics.progress}%`, background: 'var(--green)' }} />
      </div>

      {canManage && (
        <div className="detail-actions">
          <button type="button" className="btn btn-secondary" onClick={() => onEdit(loan)}><Pencil size={16} /> Edit</button>
          <button type="button" className="btn btn-danger-soft" onClick={() => onDelete(loan)}><Trash2 size={16} /> Delete</button>
        </div>
      )}

      <div className="section-card">
        <div className="section-card-title">Borrower Information</div>
        <dl className="info-list">
          <InfoRow icon={Phone} label="Primary mobile" value={loan.customer_phone} href={loan.customer_phone && `tel:${loan.customer_phone}`} />
          <InfoRow icon={PhoneCall} label="Alternate mobile" value={loan.alternate_phone} href={loan.alternate_phone && `tel:${loan.alternate_phone}`} />
          <InfoRow icon={Mail} label="Email" value={loan.customer_email} />
          <InfoRow icon={Store} label="Shop / business" value={loan.shop_name} />
          <InfoRow icon={MapPin} label="Area" value={loan.zone} />
          <InfoRow icon={MapPin} label="Address" value={loan.customer_address} />
          <InfoRow icon={Key} label="Aadhaar" value={loan.aadhaar_number ? `XXXX XXXX ${digitsOnly(loan.aadhaar_number).slice(-4)}` : ''} />
          <InfoRow icon={Languages} label="SMS language" value={SMS_LANGUAGES.find(l => l.value === loan.preferred_language)?.label} />
        </dl>
      </div>

      <div className="section-card">
        <div className="section-card-title">Guarantor</div>
        <dl className="info-list">
          <InfoRow icon={User} label="Name" value={loan.guarantor_name} />
          <InfoRow icon={Phone} label="Phone" value={loan.guarantor_phone} href={loan.guarantor_phone && `tel:${loan.guarantor_phone}`} />
          <InfoRow icon={MapPin} label="Address" value={loan.guarantor_address} />
        </dl>
      </div>

      <div className="section-card">
        <div className="section-card-title">Loan</div>
        <div className="customer-detail-grid">
          <div><span>Loan amount</span><strong>{money(loan.loan_amount)}</strong></div>
          <div><span>Disbursed</span><strong>{money(cashDisbursed)}</strong></div>
          <div><span>Total due</span><strong>{money(metrics.dueAmount)}</strong></div>
          <div><span>Collected</span><strong>{money(metrics.collectedAmount)}</strong></div>
          <div><span>Installment</span><strong>{money(loan.repayment_amount)} <em>{loan.repayment_frequency}</em></strong></div>
          <div><span>Paid / missed days</span><strong>{loan.total_days_paid || 0} / {loan.total_days_not_paid || 0}</strong></div>
          <div><span>Start date</span><strong>{formatDate(loan.start_date)}</strong></div>
          <div><span>Due date</span><strong>{formatDate(loan.closing_date)}</strong></div>
        </div>
        {canManage && metrics.pendingAmount <= 0 && (
          <div className="customer-close-loan">
            <button type="button" className={`btn ${loan.status === 'closed' ? 'btn-secondary' : 'btn-success'}`}
              disabled={loan.status === 'closed'} onClick={() => onCloseLoan(loan)}>
              <CheckCircle2 size={15} /> {loan.status === 'closed' ? 'Loan closed' : 'Mark loan as closed'}
            </button>
            <span>Payment is complete. The loan history will remain saved.</span>
          </div>
        )}
      </div>

      <div className="section-card">
        <div className="section-card-title">Active Loans ({activeLoans.length})</div>
        {activeLoans.length === 0 ? <div className="muted-note">No active loans — everything is settled.</div> : (
          <LoanList loans={activeLoans} currentId={loan.id} onOpenLoan={onOpenLoan} />
        )}
      </div>

      <div className="section-card">
        <div className="section-card-title"><History size={14} /> Loan History ({relatedLoans.length})</div>
        <LoanList loans={relatedLoans} currentId={loan.id} onOpenLoan={onOpenLoan} />
      </div>

      <div className="section-card">
        <PaymentHistorySection key={loan.id} loanId={loan.id} />
      </div>
    </div>
  );
}

function LoanList({ loans, currentId, onOpenLoan }) {
  return (
    <div className="loan-list">
      {loans.map(l => {
        const m = getLoanMetrics(l);
        return (
          <button type="button" key={l.id} className={`loan-list-row${l.id === currentId ? ' current' : ''}`}
            onClick={() => l.id !== currentId && onOpenLoan(l)}>
            <div>
              <strong>{money(l.loan_amount)}</strong>
              <span>{formatDate(l.start_date || l.created_at)} → {formatDate(l.closing_date)}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <StatusBadge status={m.status} />
              <span>{money(m.pendingAmount)} left</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function InfoRow({ icon, label, value, href }) {
  return (
    <div className="info-row">
      <dt>{React.createElement(icon, { size: 14 })} {label}</dt>
      <dd>{value ? (href ? <a href={href}>{value}</a> : value) : <span className="text-muted">—</span>}</dd>
    </div>
  );
}

// ── Edit borrower screen ────────────────────────────────────────────────────
const EDIT_FIELDS = [
  'customer_name', 'shop_name', 'customer_phone', 'alternate_phone', 'zone', 'customer_email',
  'aadhaar_number', 'customer_address', 'guarantor_name', 'guarantor_phone', 'guarantor_address',
  'preferred_language', 'photo_url',
];

function validateBorrower(form) {
  const errors = {};
  const phoneOk = v => /^\+?[0-9]{10,15}$/.test(String(v).replace(/[\s\-()]/g, ''));
  if (form.customer_name.trim().length < 2) errors.customer_name = 'Enter the full name (at least 2 characters).';
  if (!form.customer_phone.trim()) errors.customer_phone = 'Primary mobile is required.';
  else if (!phoneOk(form.customer_phone)) errors.customer_phone = 'Enter a valid mobile number (10–15 digits).';
  if (form.alternate_phone.trim() && !phoneOk(form.alternate_phone)) errors.alternate_phone = 'Enter a valid mobile number.';
  if (form.guarantor_phone.trim() && !phoneOk(form.guarantor_phone)) errors.guarantor_phone = 'Enter a valid mobile number.';
  if (form.customer_email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.customer_email.trim())) errors.customer_email = 'Enter a valid email address.';
  const aadhaar = form.aadhaar_number.replace(/[\s-]/g, '');
  if (aadhaar && !/^[0-9]{12}$/.test(aadhaar)) errors.aadhaar_number = 'Aadhaar number must be 12 digits.';
  return errors;
}

function EditBorrowerScreen({ loan, onCancel, onSave }) {
  const { t } = useLanguage();
  const initial = useMemo(() => Object.fromEntries(EDIT_FIELDS.map(k => [k, loan[k] ?? (k === 'preferred_language' ? 'en' : '')])), [loan]);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(false);
  const invalid = Object.values(errors).some(Boolean);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };
  const field = key => ({ value: form[key] ?? '', onChange: e => set(key, e.target.value), 'aria-invalid': Boolean(errors[key]) });
  const changed = EDIT_FIELDS.filter(k => (form[k] ?? '') !== (initial[k] ?? ''));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const found = validateBorrower(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (changed.length === 0) { onCancel(); return; }
    setSaving(true); setError(''); setFailed(false);
    try {
      await onSave(Object.fromEntries(changed.map(k => [k, typeof form[k] === 'string' && k !== 'photo_url' ? form[k].trim() : form[k]])));
    } catch (err) {
      setError(err.message || '');
      setFailed(true);
      setSaving(false);
    }
  };

  const fieldError = name => (errors[name] ? <div className="field-error">{errors[name]}</div> : null);

  return (
    <form className="screen edit-screen animate-fadeUp" onSubmit={handleSubmit} noValidate>
      <div className="screen-header">
        <button type="button" className="icon-btn" onClick={onCancel} disabled={saving} aria-label="Cancel"><ArrowLeft size={20} /></button>
        <div>
          <div className="screen-header-title">Edit Borrower</div>
          <div className="screen-header-sub">{loan.customer_name}{loan.account_number ? ` · A/C ${loan.account_number}` : ''}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <PhotoCapture value={form.photo_url || null} onChange={v => set('photo_url', v || '')} label={t('addPhotoUploadCamera')} />
      </div>

      <SectionLabel>{t('personalDetails')}</SectionLabel>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-name">{t('fullName')}</label>
        <IconInput icon={<User size={16} />}><input id="eb-name" type="text" className="form-input" autoComplete="off" {...field('customer_name')} /></IconInput>
        {fieldError('customer_name')}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-shop">{t('shopBusinessName')}</label>
        <IconInput icon={<Building2 size={16} />}><input id="eb-shop" type="text" className="form-input" {...field('shop_name')} /></IconInput>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-phone">{t('primaryMobile')}</label>
        <IconInput icon={<Phone size={16} />}><input id="eb-phone" type="tel" inputMode="tel" className="form-input" {...field('customer_phone')} /></IconInput>
        {fieldError('customer_phone')}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-alt">{t('alternateMobile')}</label>
        <IconInput icon={<PhoneCall size={16} />}><input id="eb-alt" type="tel" inputMode="tel" className="form-input" {...field('alternate_phone')} /></IconInput>
        {fieldError('alternate_phone')}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-zone">{t('areaInCoimbatore')}</label>
        <IconInput icon={<MapPin size={16} />}>
          <input id="eb-zone" type="text" list="zones-datalist-edit" className="form-input" placeholder="Select an area or type a new one…" {...field('zone')} />
        </IconInput>
        <datalist id="zones-datalist-edit">{ZONES.map(z => <option key={z} value={z} />)}</datalist>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-email">{t('email')}</label>
        <IconInput icon={<Mail size={16} />}><input id="eb-email" type="email" inputMode="email" className="form-input" {...field('customer_email')} /></IconInput>
        {fieldError('customer_email')}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-aadhaar">{t('aadhaarNumber')}</label>
        <IconInput icon={<Key size={16} />}>
          <input id="eb-aadhaar" type="text" inputMode="numeric" className="form-input" placeholder="XXXX XXXX XXXX" maxLength={14} {...field('aadhaar_number')} />
        </IconInput>
        {fieldError('aadhaar_number')}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-address">{t('address')}</label>
        <IconInput icon={<MapPin size={16} />} top>
          <textarea id="eb-address" rows={3} className="form-input" style={{ resize: 'none' }} placeholder="House no., Street, City, State" {...field('customer_address')} />
        </IconInput>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-lang">{t('disbursementSmsLanguage')}</label>
        <IconInput icon={<Languages size={16} />}>
          <select id="eb-lang" className="form-input" {...field('preferred_language')}>
            {SMS_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </IconInput>
      </div>

      <SectionLabel>{t('guarantorDetails')}</SectionLabel>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-gname">{t('guarantorName')}</label>
        <IconInput icon={<User size={16} />}><input id="eb-gname" type="text" className="form-input" {...field('guarantor_name')} /></IconInput>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-gphone">{t('guarantorPhone')}</label>
        <IconInput icon={<Phone size={16} />}><input id="eb-gphone" type="tel" inputMode="tel" className="form-input" {...field('guarantor_phone')} /></IconInput>
        {fieldError('guarantor_phone')}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="eb-gaddress">{t('guarantorAddress')}</label>
        <IconInput icon={<MapPin size={16} />} top>
          <textarea id="eb-gaddress" rows={2} className="form-input" style={{ resize: 'none' }} placeholder="Guarantor's address" {...field('guarantor_address')} />
        </IconInput>
      </div>

      <p className="muted-note">Loan amounts and payment history can't be edited here, so financial records stay accurate.</p>

      {invalid && <div className="form-alert" role="alert">Please fix the highlighted fields.</div>}
      {failed && (
        <div className="form-alert" role="alert">
          <strong>Unable to update borrower.</strong> Please try again.
          {error && <div>{error}</div>}
        </div>
      )}

      <div className="sticky-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <Check size={16} /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function Members({ readOnly = false, basePath = '/borrowers' }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detailId, subView] = (params['*'] || '').split('/');

  const FREQ_OPTIONS = [
    { value: 'daily',   icon: Calendar,      label: t('daily'),   desc: t('freqDailyDesc') },
    { value: 'weekly',  icon: CalendarDays,  label: t('weekly'),  desc: t('freqWeeklyDesc') },
    { value: 'monthly', icon: CalendarRange, label: t('monthly'), desc: t('freqMonthlyDesc') },
    { value: 'custom',  icon: Settings2,     label: t('freqCustom'),  desc: t('freqCustomDesc') },
  ];
  const SORT_OPTIONS = [
    { value: 'newest',   label: t('newestFirst') },
    { value: 'name',     label: t('nameAZ') },
    { value: 'balance',  label: t('highestBalance') },
    { value: 'location', label: t('byArea') },
  ];
  const canManage = !readOnly && user?.role === 'admin';
  const [loans, setLoans] = useState([]);
  // Deep link: /borrowers?add=1 opens the Add Borrower form
  const [showModal, setShowModal] = useState(() => canManage && searchParams.get('add') === '1');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sortBy, setSortBy] = useState('newest');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showOtpSection, setShowOtpSection] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [menuLoan, setMenuLoan] = useState(null);
  const [deleteLoan, setDeleteLoan] = useState(null);
  const [deleteAck, setDeleteAck] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [closeTarget, setCloseTarget] = useState(null);
  const createKeyRef = useRef(null);
  const listScrollRef = useRef(0);

  const resetPaging = () => setVisibleCount(PAGE_SIZE);
  const updateSearch = (value) => { setSearch(value); resetPaging(); };
  const updateStatusFilter = (value) => { setStatusFilter(value); resetPaging(); };
  const updateZoneFilter = (value) => { setZoneFilter(value); resetPaging(); };
  const updateSortBy = (value) => { setSortBy(value); resetPaging(); };

  useEffect(() => {
    if (searchParams.get('add')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // Keep the list's scroll position when going into a borrower and back
  useEffect(() => {
    const area = document.querySelector('.page-area');
    if (!area) return;
    if (detailId) area.scrollTo({ top: 0 });
    else area.scrollTo({ top: listScrollRef.current });
  }, [detailId, subView]);

  const openDetails = (loan) => {
    const area = document.querySelector('.page-area');
    if (!detailId && area) listScrollRef.current = area.scrollTop;
    setMenuLoan(null);
    navigate(`${basePath}/${loan.id}`);
  };
  const openEdit = (loan) => { setMenuLoan(null); navigate(`${basePath}/${loan.id}/edit`); };
  const askDelete = (loan) => { setMenuLoan(null); setDeleteAck(false); setDeleteLoan(loan); };

  const handleMerge = async (id1, id2) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/loans/merge', {
        method: 'POST',
        body: JSON.stringify({ primary_loan_id: id1, secondary_loan_id: id2 }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Merge failed'));
      const refreshRes = await apiFetch('/api/loans/');
      setLoans(await refreshRes.json());
      showToast('Borrowers merged successfully');
    } catch (err) {
      showToast(`Could not merge borrowers. ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteLoan || deleting) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/loans/${deleteLoan.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res));
      setLoans(current => current.filter(item => item.id !== deleteLoan.id));
      setDeleteLoan(null);
      showToast('Borrower deleted successfully');
      if (detailId) navigate(basePath, { replace: true });
    } catch (err) {
      showToast(`Something went wrong. Please try again.${err.message ? ` (${err.message})` : ''}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateLoan = async (loanId, updates) => {
    let res;
    try {
      res = await apiFetch(`/api/loans/${loanId}`, { method: 'PATCH', body: JSON.stringify(updates) });
    } catch {
      showToast('Unable to update borrower. Please try again.', 'error');
      throw new Error('Check your internet connection.');
    }
    if (!res.ok) {
      const message = await readError(res, '');
      showToast('Unable to update borrower. Please try again.', 'error');
      throw new Error(message);
    }
    const data = await res.json();
    setLoans(current => current.map(item => item.id === loanId ? { ...item, ...data } : item));
    showToast('Borrower updated successfully');
    navigate(`${basePath}/${loanId}`, { replace: true });
  };

  const confirmCloseLoan = async () => {
    const loan = closeTarget;
    if (!loan) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/loans/${loan.id}/close`, { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res, 'Loan close failed'));
      const data = await res.json();
      const updatedLoan = data.data || { ...loan, status: 'closed' };
      setLoans(current => current.map(item => item.id === loan.id ? { ...item, ...updatedLoan } : item));
      showToast('Loan marked as closed');
    } catch (err) {
      showToast(`Could not close the loan. ${err.message}`, 'error');
    } finally {
      setLoading(false);
      setCloseTarget(null);
    }
  };

  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', alternate_phone: '', zone: '', address: '',
    shop_name: '', aadhaar_number: '',
    guarantor_name: '', guarantor_phone: '', guarantor_address: '',
    amount: '', interest_rate: '18', monthly_interest_amount: '', field_visit_charge: '', document_fee: '', processing_fee: '',
    startDate: new Date().toISOString().split('T')[0],
    closeDate: '', repaymentFreq: 'monthly', repaymentAmount: '', preferred_language: 'en',
  });
  const [disburseResult, setDisburseResult] = useState(null);

  useEffect(() => {
    apiFetch('/api/loans/')
      .then(async res => {
        if (!res.ok) throw new Error(await readError(res, 'Could not load borrowers.'));
        return res.json();
      })
      .then(data => setLoans(Array.isArray(data) ? data : []))
      .catch(err => setLoadError(err.message || 'Could not load borrowers. Check your connection.'))
      .finally(() => setDataLoading(false));
  }, []);

  const set = (k, v) => setFormData(f => ({ ...f, [k]: v }));
  const field = (key) => ({ value: formData[key], onChange: e => set(key, e.target.value) });

  // Split the single Charges amount into its display breakdown.
  const splitCharges = (chargeAmt) => {
    if (!(chargeAmt > 0)) return { field_visit_charge: '', document_fee: '', processing_fee: '' };
    const fieldVisitCalc = Math.round(chargeAmt * 31) / 100;
    const docFeeCalc = Math.round(chargeAmt * 30) / 100;
    const procFeeCalc = Math.round(chargeAmt * 21) / 100;
    return { field_visit_charge: String(fieldVisitCalc), document_fee: String(docFeeCalc), processing_fee: String(procFeeCalc) };
  };

  // Recompute Monthly Interest (Loan Amount x Interest Rate %) and cascade into charges
  const recalcFromAmountOrRate = (amountStr, rateStr) => {
    const p = parseFloat(amountStr) || 0;
    const rate = parseFloat(rateStr) || 0;
    const interestAmt = p > 0 ? Math.round(p * rate) / 100 : 0;
    const monthly_interest_amount = interestAmt > 0 ? String(interestAmt) : '';
    return { monthly_interest_amount, ...splitCharges(interestAmt) };
  };

  const handleAmountChange = (v) => setFormData(f => ({ ...f, amount: v, ...recalcFromAmountOrRate(v, f.interest_rate) }));
  const handleRateChange = (v) => setFormData(f => ({ ...f, interest_rate: v, ...recalcFromAmountOrRate(f.amount, v) }));
  const handleInterestChange = (v) => setFormData(f => ({ ...f, monthly_interest_amount: v, ...splitCharges(parseFloat(v) || 0) }));

  const principal = parseFloat(formData.amount) || 0;
  const monthlyInterest = parseFloat(formData.monthly_interest_amount) || 0;
  const fieldVisit = parseFloat(formData.field_visit_charge) || 0;
  const docFee = parseFloat(formData.document_fee) || 0;
  const procFee = parseFloat(formData.processing_fee) || 0;
  const chargeInterest = Math.max(0, monthlyInterest - fieldVisit - docFee - procFee);
  // The fee rows are only a breakdown of Charges. Charges are deducted upfront
  // once from the principal, so they are not added again to Total Due.
  const totalDeductions = monthlyInterest;
  const totalDue = principal + monthlyInterest - totalDeductions;
  const cashDisbursed = Math.max(0, principal - totalDeductions);

  const resetModal = () => {
    createKeyRef.current = null;
    setShowModal(false);
    setPhoneVerified(false);
    setPhotoPreview(null);
    setShowOtpSection(false);
    setDisburseResult(null);
    setFormData({
      name: '', email: '', phone: '', alternate_phone: '', zone: '', address: '',
      shop_name: '', aadhaar_number: '',
      guarantor_name: '', guarantor_phone: '', guarantor_address: '',
      amount: '', interest_rate: '18', monthly_interest_amount: '', field_visit_charge: '', document_fee: '', processing_fee: '',
      startDate: new Date().toISOString().split('T')[0],
      closeDate: '', repaymentFreq: 'monthly', repaymentAmount: '', preferred_language: 'en',
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!formData.name || !formData.phone || !formData.zone || !formData.amount || !formData.closeDate) {
      showToast('Name, Phone, Coimbatore area, Amount and Due Date are required.', 'error'); return;
    }
    // One key per borrower being added, reused on retry, so a double tap never creates two loans
    if (!createKeyRef.current) createKeyRef.current = newIdempotencyKey();
    setLoading(true);
    const payload = {
      customer_id: 'CUST-' + Math.floor(Math.random() * 1000000),
      customer_name: formData.name,
      customer_email: formData.email,
      customer_phone: formData.phone,
      customer_address: formData.address,
      alternate_phone: formData.alternate_phone,
      zone: formData.zone,
      photo_url: photoPreview || '',
      shop_name: formData.shop_name,
      aadhaar_number: formData.aadhaar_number,
      guarantor_name: formData.guarantor_name,
      guarantor_phone: formData.guarantor_phone,
      guarantor_address: formData.guarantor_address,
      loan_amount: parseFloat(formData.amount),
      monthly_interest_amount: parseFloat(formData.monthly_interest_amount) || 0,
      field_visit_charge: parseFloat(formData.field_visit_charge) || 0,
      document_fee: parseFloat(formData.document_fee) || 0,
      processing_fee: parseFloat(formData.processing_fee) || 0,
      start_date: formData.startDate,
      closing_date: formData.closeDate,
      repayment_frequency: formData.repaymentFreq,
      repayment_amount: parseFloat(formData.repaymentAmount) || 0,
      preferred_language: formData.preferred_language,
    };
    try {
      const res = await apiFetch('/api/loans/', {
        method: 'POST',
        headers: { 'Idempotency-Key': createKeyRef.current },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to create'));
      const data = await res.json();
      // Show the new borrower at the top of the list straight away
      setLoans(current => [data.data, ...current.filter(l => l.id !== data.data.id)]);
      setSearch(''); setStatusFilter('all'); setZoneFilter('all'); setSortBy('newest'); resetPaging();
      setDisburseResult(data);
      showToast('Borrower added successfully');
    } catch (err) {
      showToast(`Could not add borrower. ${err.message || 'Please try again.'}`, 'error');
    }
    finally { setLoading(false); }
  };


  const visibleLoans = loans.filter(l => {
    const metrics = getLoanMetrics(l);
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [
      l.customer_name, l.customer_phone, l.alternate_phone, l.shop_name,
      l.zone, l.customer_address, l.account_number,
    ].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    const matchesZone = zoneFilter === 'all' || l.zone === zoneFilter;
    const matchesStatus = statusFilter === 'all' || metrics.status === statusFilter;
    return matchesSearch && matchesZone && matchesStatus;
  });
  const sortedLoans = [...visibleLoans].sort((a, b) => {
    if (sortBy === 'name') return a.customer_name.localeCompare(b.customer_name);
    if (sortBy === 'balance') return b.pending_amount - a.pending_amount;
    if (sortBy === 'location') return (a.zone || a.customer_address || '').localeCompare(b.zone || b.customer_address || '');
    if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    return 0;
  });
  const shownLoans = sortedLoans.slice(0, visibleCount);
  const overdueCount = loans.filter(l => getLoanMetrics(l).status === 'overdue').length;
  const totalOutstanding = loans.reduce((s, l) => s + Math.max(0, l.pending_amount || 0), 0);

  const detailLoan = detailId ? loans.find(l => l.id === detailId) : null;
  const relatedLoans = detailLoan
    ? loans.filter(l => l.id === detailLoan.id || l.customer_id === detailLoan.customer_id
        || samePhone(l.customer_phone, detailLoan.customer_phone))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    : [];

  const deletePending = Number(deleteLoan?.pending_amount || 0);
  const deleteIsRisky = deleteLoan && (deletePending > 0 || deleteLoan.status === 'active');

  const dialogs = (
    <>
      <BottomSheet open={Boolean(menuLoan)} onClose={() => setMenuLoan(null)} title={menuLoan?.customer_name}>
        {menuLoan && (
          <div className="action-list">
            <button type="button" onClick={() => openDetails(menuLoan)}><Eye size={20} /> View Borrower</button>
            {canManage && <button type="button" onClick={() => openEdit(menuLoan)}><Pencil size={20} /> Edit Borrower</button>}
            {canManage && <button type="button" className="danger" onClick={() => askDelete(menuLoan)}><Trash2 size={20} /> Delete Borrower</button>}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={Boolean(deleteLoan)}
        title="Delete Borrower?"
        confirmLabel="Delete"
        busyLabel="Deleting..."
        busy={deleting}
        confirmDisabled={deleteIsRisky && !deleteAck}
        onCancel={() => !deleting && setDeleteLoan(null)}
        onConfirm={confirmDelete}
      >
        <p>Are you sure you want to remove <strong>{deleteLoan?.customer_name}</strong> from active borrowers?</p>
        <p>Existing loan and payment history will be preserved.</p>
        {deleteIsRisky && (
          <div className="dialog-warning">
            <strong>This borrower has an active loan or outstanding balance{deletePending > 0 ? ` of ${money(deletePending)}` : ''}.</strong>
            <span>Deleting the borrower will NOT delete their financial records.</span>
            <label className="dialog-check">
              <input type="checkbox" checked={deleteAck} onChange={e => setDeleteAck(e.target.checked)} disabled={deleting} />
              <span>I understand. Continue with delete.</span>
            </label>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(closeTarget)}
        title="Close this loan?"
        tone="primary"
        confirmLabel="Mark as closed"
        busyLabel="Closing..."
        busy={loading}
        onCancel={() => setCloseTarget(null)}
        onConfirm={confirmCloseLoan}
      >
        <p>Mark {closeTarget?.customer_name}'s loan as closed? Payment history will remain saved.</p>
      </ConfirmDialog>
    </>
  );

  // ── Edit screen ──
  if (detailId && subView === 'edit') {
    if (!canManage) return <NotFound onBack={() => navigate(basePath)} message="Only admins can edit borrowers." />;
    if (dataLoading) return <DetailSkeleton />;
    if (!detailLoan) return <NotFound onBack={() => navigate(basePath)} message={loadError || 'This borrower was not found or has been deleted.'} />;
    return (
      <EditBorrowerScreen
        key={detailLoan.id}
        loan={detailLoan}
        onCancel={() => navigate(`${basePath}/${detailLoan.id}`, { replace: true })}
        onSave={updates => handleUpdateLoan(detailLoan.id, updates)}
      />
    );
  }

  // ── Details screen ──
  if (detailId) {
    if (dataLoading) return <DetailSkeleton />;
    if (!detailLoan) return <NotFound onBack={() => navigate(basePath)} message={loadError || 'This borrower was not found or has been deleted.'} />;
    return (
      <>
        <BorrowerDetails
          loan={detailLoan}
          relatedLoans={relatedLoans}
          canManage={canManage}
          onBack={() => navigate(basePath)}
          onEdit={openEdit}
          onDelete={askDelete}
          onCloseLoan={setCloseTarget}
          onOpenLoan={l => navigate(`${basePath}/${l.id}`)}
        />
        {dialogs}
      </>
    );
  }

  // ── List screen ──
  return (
    <div className="customer-page animate-fadeUp">
      <div className="list-summary">
        <div><span>Borrowers</span><strong>{loans.length}</strong></div>
        <div><span>Outstanding</span><strong className="text-amber">{money(totalOutstanding)}</strong></div>
        <div><span>Overdue</span><strong className="text-red">{overdueCount}</strong></div>
      </div>

      {canManage && (
        <div className="list-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><UserPlus size={17} /> {t('addBorrower')}</button>
          <button className="btn btn-secondary" onClick={() => setShowMerge(true)}><GitMerge size={17} /> {t('merge')}</button>
        </div>
      )}

      <div className="list-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input type="search" placeholder="Search name, phone, shop, A/C…" value={search} onChange={e => updateSearch(e.target.value)} />
          {search && <button type="button" onClick={() => updateSearch('')} aria-label="Clear search"><X size={16} /></button>}
        </label>
        <div className="chip-row" role="tablist" aria-label="Status filters">
          {STATUS_TABS.map(tab => (
            <button key={tab.value} type="button" className={`chip${statusFilter === tab.value ? ' active' : ''}`} onClick={() => updateStatusFilter(tab.value)}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="select-row">
          <label className="select-field">
            <MapPin size={15} />
            <select value={zoneFilter} onChange={e => updateZoneFilter(e.target.value)} aria-label="Area filter">
              <option value="all">All areas</option>
              {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label className="select-field">
            <ArrowUpDown size={15} />
            <select value={sortBy} onChange={e => updateSortBy(e.target.value)} aria-label="Sort borrowers">
              {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {dataLoading ? (
        <div className="customer-skeleton-list">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton customer-skeleton-row" />)}
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <div className="empty-title">Could not load borrowers</div>
          <p>{loadError}</p>
          <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Retry</button>
        </div>
      ) : shownLoans.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Users size={36} /></div>
          <div className="empty-title">No borrowers found</div>
          <p>{loans.length === 0 ? 'Add your first borrower to get started.' : 'Try a different search, status, or area filter.'}</p>
        </div>
      ) : (
        <div className="borrower-list">
          {shownLoans.map(loan => (
            <BorrowerCard key={loan.id} loan={loan} onOpen={openDetails} onMenu={canManage ? setMenuLoan : null} />
          ))}
          {sortedLoans.length > shownLoans.length && (
            <button type="button" className="btn btn-secondary show-more" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
              Show more ({sortedLoans.length - shownLoans.length} left)
            </button>
          )}
        </div>
      )}

      {/* ── Add Borrower + Loan (full-screen sheet) ── */}
      {showModal && (
        <div className="fullscreen-sheet">
          <div className="fullscreen-sheet-inner">
            <div className="screen-header">
              <button type="button" className="icon-btn" onClick={resetModal} aria-label="Close"><X size={20} /></button>
              <div>
                <div className="screen-header-title">{t('newBorrowerLoan')}</div>
                <div className="screen-header-sub">{t('requiredNote')}</div>
              </div>
            </div>
            {disburseResult ? (
              <DisburseSuccess result={disburseResult} onDone={resetModal} />
            ) : (
            <form onSubmit={handleCreate}>
              {/* ── Photo: upload or live camera ── */}
              <div style={{ marginBottom: 20 }}>
                <PhotoCapture value={photoPreview} onChange={setPhotoPreview} label={t('addPhotoUploadCamera')} />
              </div>

              {/* ── Personal Details ── */}
              <SectionLabel>{t('personalDetails')}</SectionLabel>

              <div className="form-group">
                <label className="form-label">{t('fullName')}</label>
                <IconInput icon={<User size={16} />}><input required type="text" className="form-input" placeholder="e.g. Ramesh Kumar" {...field('name')} /></IconInput>
              </div>
              <div className="form-group">
                <label className="form-label">{t('shopBusinessName')}</label>
                <IconInput icon={<Building2 size={16} />}><input type="text" className="form-input" placeholder="e.g. Ramesh General Store" {...field('shop_name')} /></IconInput>
              </div>

              <div className="form-row" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">{t('primaryMobile')}</label>
                  <IconInput icon={<Phone size={16} />}><input required type="tel" className="form-input" placeholder="+91 9876543210" {...field('phone')} /></IconInput>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('alternateMobile')}</label>
                  <IconInput icon={<PhoneCall size={16} />}><input type="tel" className="form-input" placeholder="+91 9876543211" {...field('alternate_phone')} /></IconInput>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('areaInCoimbatore')}</label>
                <IconInput icon={<MapPin size={16} />}>
                  <input type="text" list="zones-datalist" className="form-input" placeholder="Select an area or type a new one…" {...field('zone')} />
                </IconInput>
                <datalist id="zones-datalist">
                  {ZONES.map(z => <option key={z} value={z} />)}
                </datalist>
              </div>

              {/* OTP Section */}
              <div style={{ marginBottom: 12 }}>
                <button type="button" onClick={() => setShowOtpSection(!showOtpSection)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--brand-light)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  {phoneVerified ? <Check size={14} style={{ color: 'var(--green)' }} /> : <Shield size={14} />} {phoneVerified ? t('phoneVerified') : t('verifyPhoneOtp')}
                  {showOtpSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showOtpSection && !phoneVerified && (
                  <OtpVerifier phone={formData.phone} onVerified={() => setPhoneVerified(true)} />
                )}
              </div>

              <div className="form-row" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">{t('email')}</label>
                  <IconInput icon={<Mail size={16} />}><input type="email" className="form-input" placeholder="email@gmail.com" {...field('email')} /></IconInput>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('aadhaarNumber')}</label>
                  <IconInput icon={<Key size={16} />}>
                    <input type="text" className="form-input" placeholder="XXXX XXXX XXXX" maxLength={14} {...field('aadhaar_number')} />
                  </IconInput>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('address')}</label>
                <IconInput icon={<MapPin size={16} />} top>
                  <textarea rows={2} className="form-input" style={{ resize: 'none' }} placeholder="House no., Street, City, State" {...field('address')} />
                </IconInput>
              </div>

              {/* ── Guarantor ── */}
              <SectionLabel>{t('guarantorDetails')}</SectionLabel>

              <div className="form-row" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">{t('guarantorName')}</label>
                  <IconInput icon={<User size={16} />}><input type="text" className="form-input" placeholder="Guarantor name" {...field('guarantor_name')} /></IconInput>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('guarantorPhone')}</label>
                  <IconInput icon={<Phone size={16} />}><input type="tel" className="form-input" placeholder="+91 ..." {...field('guarantor_phone')} /></IconInput>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('guarantorAddress')}</label>
                <IconInput icon={<MapPin size={16} />} top>
                  <textarea rows={2} className="form-input" style={{ resize: 'none' }} placeholder="Guarantor's address" {...field('guarantor_address')} />
                </IconInput>
              </div>

              {/* ── Loan Details ── */}
              <SectionLabel>{t('loanDetails')}</SectionLabel>

              <div className="form-row-3" style={{ gap: '12px', marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{t('loanAmount')}</label>
                  <IconInput icon={<IndianRupee size={16} />}><input required min="1" step="0.01" type="number" className="form-input" placeholder="0.00" value={formData.amount} onChange={e => handleAmountChange(e.target.value)} /></IconInput>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{t('charges')}</label>
                  <input min="0" step="0.01" type="number" className="form-input" placeholder="18" value={formData.interest_rate} onChange={e => handleRateChange(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{t('chargesAmount')} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{t('auto')}</span></label>
                  <IconInput icon={<IndianRupee size={16} />}><input min="0" step="0.01" type="number" className="form-input" placeholder="Auto-calculated" value={formData.monthly_interest_amount} onChange={e => handleInterestChange(e.target.value)} /></IconInput>
                </div>
              </div>

              <div className="form-row" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">{t('startDate')}</label>
                  <input required type="date" className="form-input" {...field('startDate')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('dueDate')}</label>
                  <input required type="date" className="form-input" {...field('closeDate')} />
                </div>
              </div>

              {/* ── Fee Breakdown ── */}
              <SectionLabel>{t('chargesAndFees')}</SectionLabel>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: -8, marginBottom: 10 }}>
                {t('autoSplitNote')}
              </p>

              <div style={{ background: 'var(--bg)', borderRadius: 14, padding: 14, border: '1px solid var(--border)', marginBottom: 16 }}>
                <div className="form-row-3" style={{ gap: 10, marginBottom: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t('fieldVerification')} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>31%</span></label>
                    <input min="0" step="0.01" type="number" className="form-input" placeholder="Auto" {...field('field_visit_charge')} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t('documentFee')} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>30%</span></label>
                    <input min="0" step="0.01" type="number" className="form-input" placeholder="Auto" {...field('document_fee')} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t('processingFee')} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>21%</span></label>
                    <input min="0" step="0.01" type="number" className="form-input" placeholder="Auto" {...field('processing_fee')} />
                  </div>
                </div>

                {/* Total Due Summary */}
                {totalDue > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6 }}>{t('breakdown')}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-2)' }}>{t('principalLoanAmount')}</span>
                      <span>₹{principal.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-2)' }}>{t('charges')}</span>
                      <span>₹{monthlyInterest.toLocaleString()}</span>
                    </div>
                    {[
                      { id: 'chargeInterest', label: `${t('chargeInterest')} (18%)`, value: chargeInterest },
                      { id: 'fieldVerification', label: `${t('fieldVerification')} (31%)`, value: fieldVisit },
                      { id: 'documentFee', label: `${t('documentFee')} (30%)`, value: docFee },
                      { id: 'processingFee', label: `${t('processingFee')} (21%)`, value: procFee },
                    ].filter(r => r.value > 0).map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, paddingLeft: 14, color: 'var(--text-3)' }}>
                        <span>{t('ofWhich')} {r.label}</span>
                        <span>₹{r.value.toLocaleString()}</span>
                      </div>
                    ))}
                    {totalDeductions > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, marginTop: 4, color: 'var(--red)' }}>
                        <span>{t('deductedUpfront')}</span>
                        <span>− ₹{totalDeductions.toLocaleString()}</span>
                      </div>
                    )}
                    {principal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--green)' }}>
                        <span>{t('cashDisbursedToBorrower')}</span>
                        <span>₹{cashDisbursed.toLocaleString()}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14, paddingTop: 6, borderTop: '1px solid var(--border)', marginTop: 4, color: 'var(--amber)' }}>
                      <span>{t('totalDueRepayable')}</span>
                      <span>₹{totalDue.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Repayment Frequency ── */}
              <SectionLabel>{t('repaymentSchedule')}</SectionLabel>

              <div className="choice-grid" style={{ marginBottom: '16px' }}>
                {FREQ_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => set('repaymentFreq', opt.value)}
                    style={{ padding: '12px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                      border: `2px solid ${formData.repaymentFreq === opt.value ? 'var(--brand)' : 'var(--border)'}`,
                      background: formData.repaymentFreq === opt.value ? 'var(--brand-soft)' : 'var(--bg)',
                      color: 'var(--text)', transition: 'all 0.2s' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}><opt.icon size={14} />{opt.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '2px' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">{t('amountPerInstallment')}</label>
                <IconInput icon={<IndianRupee size={16} />}>
                  <input min="0" step="0.01" type="number" className="form-input" placeholder="e.g. 500" {...field('repaymentAmount')} />
                </IconInput>
              </div>

              <div className="form-group">
                <label className="form-label">{t('disbursementSmsLanguage')}</label>
                <IconInput icon={<Languages size={16} />}>
                  <select className="form-input" {...field('preferred_language')}>
                    {SMS_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </IconInput>
              </div>

              {/* WhatsApp Reminder Preview */}
              {formData.closeDate && (
                <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <ShieldCheck size={15} style={{ color: 'var(--brand)' }} />
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>{t('autoWhatsappReminders')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                    {[5, 7, 10, 60].map(offset => {
                      const d = new Date(formData.closeDate);
                      d.setDate(d.getDate() + offset);
                      return (
                        <div key={offset} style={{ flex: 1, textAlign: 'center', background: 'var(--surface-3)', padding: '8px 4px', borderRadius: '10px' }}>
                          <div style={{ fontSize: '10px', color: 'var(--brand-light)', fontWeight: 800 }}>DAY {offset}</div>
                          <div style={{ fontSize: '11px', fontWeight: 700 }}>{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <button type="submit" className="save-btn" disabled={loading} aria-busy={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Check size={16} /> {loading ? t('creating') : t('confirmLoanDisbursal')}
              </button>
            </form>
            )}
          </div>
        </div>
      )}

      {showMerge && <MergeModal loans={loans} onClose={() => setShowMerge(false)} onMerge={handleMerge} />}
      {dialogs}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="screen">
      <div className="skeleton" style={{ height: 88, borderRadius: 18, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 70, borderRadius: 16, marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 220, borderRadius: 16 }} />
    </div>
  );
}

function NotFound({ message, onBack }) {
  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="screen-header-title">Borrower</div>
      </div>
      <div className="empty-state">
        <div className="empty-title">{message}</div>
        <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onBack}>Back to borrowers</button>
      </div>
    </div>
  );
}

// ── Loan Disbursed Success Panel ────────────────────────────────────────────
function DisburseSuccess({ result, onDone }) {
  const { t } = useLanguage();
  const loan = result.data;
  const sms = result.sms;
  const langLabel = SMS_LANGUAGES.find(l => l.value === sms.language)?.label || sms.language;

  return (
    <div style={{ textAlign: 'center', animation: 'slideUp 0.3s ease' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-soft)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <CheckCircle2 size={30} style={{ color: 'var(--green)' }} />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{t('loanDisbursed')}</h3>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
        ₹{(loan.loan_amount || 0).toLocaleString()} {t('disbursedTo')} <strong>{loan.customer_name}</strong>
      </p>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Hash size={15} style={{ color: 'var(--brand-light)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('borrowerAccountNumber')}</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1, fontFamily: 'var(--mono)' }}>{loan.account_number}</div>
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 20, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <MessageSquare size={16} style={{ color: 'var(--brand-light)' }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>{t('disbursementSms')} · {langLabel}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)', borderRadius: 10, padding: 10, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          {sms.message_preview}
        </div>
        {sms.send_sms_url ? (
          <a href={sms.send_sms_url}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 12, borderRadius: 12, background: 'var(--brand)', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            <MessageSquare size={16} /> {t('sendSmsToBorrower')} <ExternalLink size={13} style={{ opacity: 0.7 }} />
          </a>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('noPhoneSmsUnavailable')}</div>
        )}
      </div>

      <button className="save-btn" onClick={onDone}>{t('done')}</button>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '1px', margin: '16px 0 12px' }}>
      {children}
    </div>
  );
}

function IconInput({ icon, children, top = false }) {
  const child = React.Children.only(children);
  const cloned = React.cloneElement(child, {
    style: { ...(child.props.style || {}), paddingLeft: '40px' },
  });
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: '14px', top: top ? '14px' : '50%', transform: top ? 'none' : 'translateY(-50%)', color: 'var(--text-2)', pointerEvents: 'none', zIndex: 1 }}>
        {icon}
      </div>
      {cloned}
    </div>
  );
}
