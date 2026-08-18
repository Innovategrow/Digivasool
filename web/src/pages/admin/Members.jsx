import React, { useState, useEffect, useRef } from 'react';
import {
  UserPlus, IndianRupee, ShieldCheck, Mail, Phone, MapPin,
  CheckCircle, Building2, Users, Wallet,
  Key, PhoneCall, User, Shield, ChevronDown, ChevronUp, GitMerge,
  Calendar, CalendarDays, CalendarRange, Settings2, Check, X, Wrench, Store,
  MessageSquare, Languages, Hash, ExternalLink, CheckCircle2, Search,
  ArrowUpDown, Eye, ChevronLeft, ChevronRight, Trash2
} from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { ZONES } from '../../context/AppDataContext';
import PhotoCapture from '../../components/PhotoCapture';

// SMS to the borrower can be sent in any of these Indian languages
const SMS_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi हिन्दी' },
  { value: 'ta', label: 'Tamil தமிழ்' },
  { value: 'te', label: 'Telugu తెలుగు' },
  { value: 'kn', label: 'Kannada ಕನ್ನಡ' },
  { value: 'ml', label: 'Malayalam മലയാളം' },
];

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

const PAGE_SIZE = 8;

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

function MetricCard({ icon: Icon, label, value, tone = 'indigo', sub }) {
  return (
    <div className={`stat-card ${tone} card-hover customer-stat-card`}>
      {React.createElement(Icon, { className: 'stat-card-icon', size: 40 })}
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-trend">{sub}</div>}
    </div>
  );
}

function CustomerDetailPanel({ loan, onClose, onDelete, canDelete }) {
  if (!loan) return null;
  const metrics = getLoanMetrics(loan);
  const totalDeductions = loan.monthly_interest_amount || 0;
  const cashDisbursed = Math.max(0, (loan.loan_amount || 0) - totalDeductions);

  return (
    <aside className="customer-detail-panel animate-slideUp" aria-label="Customer details">
      <div className="customer-detail-header">
        <div className="customer-avatar lg">{loan.photo_url ? <img src={loan.photo_url} alt="" /> : loan.customer_name.charAt(0).toUpperCase()}</div>
        <div>
          <h3>{loan.customer_name}</h3>
          <p>{loan.shop_name || loan.zone || 'Customer profile'}</p>
        </div>
        <button className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Close details"><X size={16} /></button>
      </div>

      <div className="customer-detail-balance">
        <span>Outstanding</span>
        <strong>₹{metrics.pendingAmount.toLocaleString()}</strong>
        <StatusBadge status={metrics.status} />
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${metrics.progress}%`, background: 'var(--green)' }} />
      </div>

      <div className="customer-detail-grid">
        <div><span>Loan</span><strong>₹{(loan.loan_amount || 0).toLocaleString()}</strong></div>
        <div><span>Collected</span><strong>₹{metrics.collectedAmount.toLocaleString()}</strong></div>
        <div><span>Total Due</span><strong>₹{metrics.dueAmount.toLocaleString()}</strong></div>
        <div><span>Disbursed</span><strong>₹{cashDisbursed.toLocaleString()}</strong></div>
      </div>

      <div className="customer-detail-list">
        {loan.customer_phone && <a href={`tel:${loan.customer_phone}`}><PhoneCall size={14} /> {loan.customer_phone}</a>}
        {loan.alternate_phone && <a href={`tel:${loan.alternate_phone}`}><PhoneCall size={14} /> {loan.alternate_phone}</a>}
        {loan.account_number && <div><Hash size={14} /> A/C {loan.account_number}</div>}
        {loan.zone && <div><MapPin size={14} /> {loan.zone}, Coimbatore</div>}
        {loan.customer_address && <div><MapPin size={14} /> {loan.customer_address}</div>}
        {loan.guarantor_name && <div><ShieldCheck size={14} /> {loan.guarantor_name}</div>}
      </div>

      {canDelete && (
        <div className="customer-delete-loan">
          <button type="button" className="btn btn-danger" onClick={() => onDelete(loan)}>
            <Trash2 size={15} /> Delete loan
          </button>
          <span>Use this to clear an unfinished loan record.</span>
        </div>
      )}
    </aside>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function Members({ readOnly = false }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const FREQ_OPTIONS = [
    { value: 'daily',   icon: Calendar,      label: t('daily'),   desc: t('freqDailyDesc') },
    { value: 'weekly',  icon: CalendarDays,  label: t('weekly'),  desc: t('freqWeeklyDesc') },
    { value: 'monthly', icon: CalendarRange, label: t('monthly'), desc: t('freqMonthlyDesc') },
    { value: 'custom',  icon: Settings2,     label: t('freqCustom'),  desc: t('freqCustomDesc') },
  ];
  const SORT_OPTIONS = [
    { value: 'name',     icon: null,    label: t('nameAZ') },
    { value: 'balance',  icon: null,    label: t('highestBalance') },
    { value: 'location', icon: MapPin,  label: t('byArea') },
    { value: 'newest',   icon: null,    label: t('newestFirst') },
  ];
  const canCreate = !readOnly && user?.role === 'admin';
  const canMerge = !readOnly && user?.role === 'admin';
  const [loans, setLoans] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('newest');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showOtpSection, setShowOtpSection] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const updateSearch = (value) => { setSearch(value); setCurrentPage(1); };
  const updateStatusFilter = (value) => { setStatusFilter(value); setCurrentPage(1); };
  const updateZoneFilter = (value) => { setZoneFilter(value); setCurrentPage(1); };
  const updateSortBy = (value) => { setSortBy(value); setCurrentPage(1); };

  const handleMerge = async (id1, id2) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/loans/merge', {
        method: 'POST',
        body: JSON.stringify({ primary_loan_id: id1, secondary_loan_id: id2 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Merge failed');
      const refreshRes = await apiFetch('/api/loans/');
      const refreshData = await refreshRes.json();
      setLoans(refreshData);
      alert('Borrowers merged successfully!');
    } catch (err) {
      alert('Error merging borrowers: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLoan = async (loan) => {
    const pending = Number(loan.pending_amount || 0);
    const warning = pending > 0
      ? `₹${pending.toLocaleString('en-IN')} is still outstanding.`
      : 'This loan is already fully paid.';
    const confirmed = window.confirm(`Delete the loan for ${loan.customer_name}? ${warning} This will remove the loan and its payment history permanently.`);
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await apiFetch(`/api/loans/${loan.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Loan deletion failed');
      setLoans(current => current.filter(item => item.id !== loan.id));
      setSelectedLoanId(null);
      setExpandedId(null);
      alert('Loan deleted successfully.');
    } catch (err) {
      alert('Error deleting loan: ' + err.message);
    } finally {
      setLoading(false);
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
      .then(res => res.json())
      .then(data => setLoans(Array.isArray(data) ? data : []))
      .catch(console.error)
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
    if (!formData.name || !formData.phone || !formData.zone || !formData.amount || !formData.closeDate) {
      alert('Name, Phone, Coimbatore area, Amount and Due Date are required.'); return;
    }
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
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create');
      setLoans([data.data, ...loans]);
      setDisburseResult(data);
    } catch (err) { 
      console.error('Loan creation error:', err);
      alert('Error creating loan: ' + (err.message || 'Unknown error')); 
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
  const totalPages = Math.max(1, Math.ceil(sortedLoans.length / PAGE_SIZE));
  const pageLoans = sortedLoans.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedLoan = sortedLoans.find(l => l.id === selectedLoanId) || pageLoans[0] || null;
  const activeCount = loans.filter(l => getLoanMetrics(l).status === 'active').length;
  const overdueCount = loans.filter(l => getLoanMetrics(l).status === 'overdue').length;
  const settledCount = loans.filter(l => getLoanMetrics(l).status === 'settled').length;
  const totalOutstanding = loans.reduce((s, l) => s + (l.pending_amount || 0), 0);

  return (
    <div className="customer-page animate-fadeUp">
      <div className="customer-page-header">
        <div>
          <div className="page-title">{t('borrowersAndLoans')}</div>
          <div className="page-subtitle">{loans.length} customers · {zoneFilter === 'all' ? 'All Coimbatore areas' : zoneFilter}</div>
        </div>
        <div className="customer-actions">
          {canMerge && <button className="btn btn-secondary" onClick={() => setShowMerge(true)}><GitMerge size={16} /> {t('merge')}</button>}
          {canCreate && <button className="btn btn-primary" onClick={() => setShowModal(true)}><UserPlus size={16} /> {t('addBorrower')}</button>}
        </div>
      </div>

      <div className="customer-stat-grid">
        <MetricCard icon={Users} label="Total Customers" value={loans.length.toLocaleString()} tone="indigo" sub={`${activeCount} active loans`} />
        <MetricCard icon={Wallet} label="Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} tone="amber" sub="Pending balance" />
        <MetricCard icon={ShieldCheck} label="Settled" value={settledCount.toLocaleString()} tone="green" sub={`${overdueCount} overdue`} />
        <MetricCard icon={MapPin} label="Areas" value={new Set(loans.map(l => l.zone).filter(Boolean)).size || 0} tone="cyan" sub="Coimbatore coverage" />
      </div>

      <div className="customer-toolbar card">
        <div className="search-bar customer-search">
          <Search size={16} style={{ color: 'var(--text-2)' }} />
          <input placeholder="Search customer, phone, shop, account..." value={search} onChange={e => updateSearch(e.target.value)} />
        </div>
        <div className="customer-filter-group" aria-label="Status filters">
          {STATUS_TABS.map(tab => (
            <button key={tab.value} className={`customer-chip${statusFilter === tab.value ? ' active' : ''}`} onClick={() => updateStatusFilter(tab.value)}>
              {tab.label}
            </button>
          ))}
        </div>
        <label className="customer-select">
          <MapPin size={14} />
          <select value={zoneFilter} onChange={e => updateZoneFilter(e.target.value)} aria-label="Area filter">
            <option value="all">All areas</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label className="customer-select">
          <ArrowUpDown size={14} />
          <select value={sortBy} onChange={e => updateSortBy(e.target.value)} aria-label="Sort customers">
            {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>
      </div>

      <div className="customer-content-grid">
        <section className="table-wrap customer-table-card" aria-label="Customer table">
          {dataLoading ? (
            <div className="customer-skeleton-list">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton customer-skeleton-row" />)}
            </div>
          ) : pageLoans.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Users size={36} /></div>
              <div className="empty-title">No customers found</div>
              <p>Try a different search, status, or area filter.</p>
            </div>
          ) : (
            <>
              <table className="customer-table desktop-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Area</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Outstanding</th>
                    <th>Due Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageLoans.map((loan, idx) => {
                    const metrics = getLoanMetrics(loan);
                    const freq = loan.repayment_frequency || 'monthly';
                    return (
                      <tr key={loan.id} className={selectedLoan?.id === loan.id ? 'selected' : ''} onClick={() => setSelectedLoanId(loan.id)} style={{ animation: `fadeUp .35s ${idx * 0.04}s ease both` }}>
                        <td>
                          <div className="customer-cell">
                            <div className="customer-avatar">{loan.photo_url ? <img src={loan.photo_url} alt="" /> : loan.customer_name.charAt(0).toUpperCase()}</div>
                            <div>
                              <strong>{loan.customer_name}</strong>
                              <span>{loan.shop_name || loan.customer_phone || 'No phone'}</span>
                            </div>
                          </div>
                        </td>
                        <td>{loan.zone || 'Unassigned'}</td>
                        <td><StatusBadge status={metrics.status} /></td>
                        <td>
                          <div className="customer-progress">
                            <div className="progress-bar"><div className="progress-fill" style={{ width: `${metrics.progress}%`, background: 'var(--green)' }} /></div>
                            <span>{Math.round(metrics.progress)}%</span>
                          </div>
                        </td>
                        <td className="text-mono text-amber">₹{metrics.pendingAmount.toLocaleString()}</td>
                        <td>{loan.closing_date || '—'} <span className="badge badge-gray">{freq}</span></td>
                        <td>
                          <button className="btn btn-secondary btn-icon" onClick={e => { e.stopPropagation(); setSelectedLoanId(loan.id); }} aria-label={`View ${loan.customer_name}`}>
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mobile-customer-list">
                {pageLoans.map(loan => {
                  const metrics = getLoanMetrics(loan);
                  const expanded = expandedId === loan.id;
                  return (
                    <article key={loan.id} className={`customer-mobile-card${expanded ? ' selected' : ''}`} onClick={() => { setExpandedId(expanded ? null : loan.id); setSelectedLoanId(loan.id); }}>
                      <div className="customer-mobile-main">
                        <div className="customer-avatar">{loan.photo_url ? <img src={loan.photo_url} alt="" /> : loan.customer_name.charAt(0).toUpperCase()}</div>
                        <div>
                          <h3>{loan.customer_name}</h3>
                          <p>{loan.shop_name || loan.zone || loan.customer_phone || 'Customer'}</p>
                        </div>
                        <div className="customer-mobile-amount">
                          <strong>₹{metrics.pendingAmount.toLocaleString()}</strong>
                          <StatusBadge status={metrics.status} />
                        </div>
                      </div>
                      <div className="customer-progress">
                        <div className="progress-bar"><div className="progress-fill" style={{ width: `${metrics.progress}%`, background: 'var(--green)' }} /></div>
                        <span>{Math.round(metrics.progress)}%</span>
                      </div>
                      {expanded && <CustomerDetailPanel loan={loan} onClose={() => setExpandedId(null)} onDelete={handleDeleteLoan} canDelete={canCreate} />}
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <div className="customer-pagination">
            <span>{sortedLoans.length === 0 ? '0' : (currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, sortedLoans.length)} of {sortedLoans.length}</span>
            <div>
              <button className="btn btn-secondary btn-icon" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
              <button className="btn btn-secondary btn-icon" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}><ChevronRight size={16} /></button>
            </div>
          </div>
        </section>

        <CustomerDetailPanel loan={selectedLoan} onClose={() => setSelectedLoanId(null)} onDelete={handleDeleteLoan} canDelete={canCreate} />
      </div>

      {canCreate && (
        <button className="fab customer-mobile-fab" onClick={() => setShowModal(true)} title="Add Borrower + Loan">
          <UserPlus size={22} />
        </button>
      )}

      {/* ── Add Borrower + Loan Modal ──────────────────────────────────────── */}
      {showModal && (
        <div className="borrower-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(6px)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto' }}>
          <div className="card borrower-modal-card" style={{ animation: 'slideUp 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{t('newBorrowerLoan')}</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>{t('requiredNote')}</p>
              </div>
              <button onClick={resetModal} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', display: 'flex' }}><X size={22} /></button>
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

              <div className="form-row" style={{ gap: '8px', marginBottom: '16px' }}>
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

              <button type="submit" className="save-btn" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Check size={16} /> {loading ? t('creating') : t('confirmLoanDisbursal')}
              </button>
            </form>
            )}
          </div>
        </div>
      )}

      {showMerge && <MergeModal loans={loans} onClose={() => setShowMerge(false)} onMerge={handleMerge} />}

      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        textarea.form-input { font-family: var(--font-family); }
      `}</style>
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
