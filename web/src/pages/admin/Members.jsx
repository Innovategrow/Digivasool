import React, { useState, useEffect, useRef } from 'react';
import {
  UserPlus, IndianRupee, ShieldCheck, Mail, Phone, MapPin,
  RefreshCw, CheckCircle, Building2,
  Key, PhoneCall, User, Shield, ChevronDown, ChevronUp, GitMerge
} from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { ZONES } from '../../context/AppDataContext';
import PhotoCapture from '../../components/PhotoCapture';

const FREQ_OPTIONS = [
  { value: 'daily',   label: '📅 Daily',   desc: 'Collected every day' },
  { value: 'weekly',  label: '📆 Weekly',  desc: 'Once a week' },
  { value: 'monthly', label: '🗓️ Monthly', desc: 'Once a month' },
  { value: 'custom',  label: '⚙️ Custom',  desc: 'Set your own amount' },
];

const SORT_OPTIONS = [
  { value: 'name',     label: 'Name A-Z' },
  { value: 'balance',  label: 'Highest Balance' },
  { value: 'location', label: 'By Location' },
  { value: 'newest',   label: 'Newest First' },
];

// ── OTP Verifier sub-component ─────────────────────────────────────────────
function OtpVerifier({ phone, onVerified }) {
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
      const res = await fetch(`${API_BASE_URL}/api/auth/borrower/send-otp`, {
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
      const res = await fetch(`${API_BASE_URL}/api/auth/borrower/verify-otp`, {
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
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>Phone verified ✓</span>
    </div>
  );

  return (
    <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', marginTop: 8 }}>
      {!sent ? (
        <button type="button" onClick={sendOtp} disabled={!phone || loading}
          style={{ width: '100%', padding: '10px', background: 'var(--brand-soft)', border: '1px solid var(--brand)', color: 'var(--brand-light)', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          {loading ? 'Sending…' : '📱 Send OTP to verify phone'}
        </button>
      ) : (
        <div>
          {devOtp && <div style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 8, fontWeight: 600 }}>🛠 Dev OTP: <strong style={{ letterSpacing: 3 }}>{devOtp}</strong></div>}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {otp.map((d, i) => (
              <input key={i} ref={el => refs.current[i] = el} type="tel" maxLength={1} value={d}
                onChange={e => handleChange(e.target.value, i)} onKeyDown={e => handleKey(e, i)}
                style={{ width: 36, height: 42, textAlign: 'center', fontSize: 18, fontWeight: 800, background: d ? 'var(--brand-soft)' : 'var(--surface-2)', border: `2px solid ${d ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10, color: 'var(--text)', outline: 'none' }} />
            ))}
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button type="button" onClick={verifyOtp} disabled={otp.join('').length < 6 || loading}
            style={{ width: '100%', padding: '10px', background: 'var(--green)', border: 'none', color: 'white', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {loading ? 'Verifying…' : '✅ Verify OTP'}
          </button>
        </div>
      )}
      {error && !sent && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function MergeModal({ loans, onClose, onMerge }) {
  const [selected, setSelected] = useState([]);
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < 2 ? [...s, id] : s);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', padding: 24, animation: 'slideUp 0.3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Merge Borrowers</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>Select exactly 2 borrowers to merge. Their loan records will be combined under the first selected.</p>
        <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
          {loans.map(b => (
            <div key={b.id} onClick={() => toggle(b.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `2px solid ${selected.includes(b.id) ? 'var(--brand)' : 'var(--border)'}`, background: selected.includes(b.id) ? 'var(--brand-soft)' : 'var(--surface-2)', cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--brand-light)' }}>{b.customer_name.charAt(0)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{b.customer_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{b.customer_phone || 'No phone'} · Outstanding: ₹{b.pending_amount.toLocaleString()}</div>
              </div>
              {selected.includes(b.id) && <span style={{ color: 'var(--green)', fontWeight: 800 }}>✓</span>}
            </div>
          ))}
        </div>
        <button className="save-btn" style={{ width: '100%' }} disabled={selected.length !== 2}
          onClick={() => { onMerge(selected[0], selected[1]); onClose(); }}>
          <GitMerge size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Merge Selected Borrowers
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function Members({ readOnly = false }) {
  const { user } = useAuth();
  const canCreate = !readOnly && user?.role === 'admin';
  const canMerge = !readOnly && user?.role === 'admin';
  const [loans, setLoans] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showOtpSection, setShowOtpSection] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

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
      alert('✅ Borrowers merged successfully!');
    } catch (err) {
      alert('❌ Error merging borrowers: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', alternate_phone: '', zone: '', address: '',
    shop_name: '', aadhaar_number: '',
    guarantor_name: '', guarantor_phone: '', guarantor_address: '',
    amount: '', monthly_interest_amount: '', field_visit_charge: '', document_fee: '', processing_fee: '',
    startDate: new Date().toISOString().split('T')[0],
    closeDate: '', repaymentFreq: 'monthly', repaymentAmount: '',
  });

  useEffect(() => {
    apiFetch('/api/loans/')
      .then(res => res.json()).then(setLoans).catch(console.error);
  }, []);

  const set = (k, v) => setFormData(f => ({ ...f, [k]: v }));
  const field = (key) => ({ value: formData[key], onChange: e => set(key, e.target.value) });

  const principal = parseFloat(formData.amount) || 0;
  const monthlyInterest = parseFloat(formData.monthly_interest_amount) || 0;
  const fieldVisit = parseFloat(formData.field_visit_charge) || 0;
  const docFee = parseFloat(formData.document_fee) || 0;
  const procFee = parseFloat(formData.processing_fee) || 0;
  const totalDeductions = fieldVisit + docFee + procFee;
  const totalFees = monthlyInterest + totalDeductions;
  const totalDue = principal + totalFees;
  const cashDisbursed = Math.max(0, principal - totalDeductions);

  const resetModal = () => {
    setShowModal(false);
    setPhoneVerified(false);
    setPhotoPreview(null);
    setShowOtpSection(false);
    setFormData({
      name: '', email: '', phone: '', alternate_phone: '', zone: '', address: '',
      shop_name: '', aadhaar_number: '',
      guarantor_name: '', guarantor_phone: '', guarantor_address: '',
      amount: '', monthly_interest_amount: '', field_visit_charge: '', document_fee: '', processing_fee: '',
      startDate: new Date().toISOString().split('T')[0],
      closeDate: '', repaymentFreq: 'monthly', repaymentAmount: '',
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.zone || !formData.amount || !formData.closeDate) {
      alert('Name, Phone, Zone, Amount and Due Date are required.'); return;
    }
    if (!phoneVerified) {
      alert('Please verify borrower phone with OTP before creating the loan.');
      return;
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
    };
    try {
      const res = await apiFetch('/api/loans/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create');
      setLoans([data, ...loans]);
      resetModal();
    } catch (err) { alert('Error creating loan: ' + err.message); }
    finally { setLoading(false); }
  };

  const visibleLoans = loans.filter(l => zoneFilter === 'all' || l.zone === zoneFilter);
  const sortedLoans = [...visibleLoans].sort((a, b) => {
    if (sortBy === 'name') return a.customer_name.localeCompare(b.customer_name);
    if (sortBy === 'balance') return b.pending_amount - a.pending_amount;
    if (sortBy === 'location') return (a.customer_address || '').localeCompare(b.customer_address || '');
    if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    return 0;
  });

  const freqColor = { daily: 'var(--green)', weekly: 'var(--brand)', monthly: 'var(--amber)', custom: 'var(--text-2)' };

  return (
    <div className="screen-container pt-4 animate-fadeUp">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Borrowers & Loans</h2>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Combined borrower profile with loan details</p>
        </div>
        {canCreate && (
          <div style={{ display: 'flex', gap: 8 }}>
            {canMerge && (
              <button className="btn btn-secondary card-hover" style={{ width: 'auto', padding: '10px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowMerge(true)}>
                <GitMerge size={18} /> Merge
              </button>
            )}
            <button className="save-btn card-hover" style={{ width: 'auto', padding: '10px 16px', borderRadius: '12px' }} onClick={() => setShowModal(true)}>
              <UserPlus size={18} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Add Borrower
            </button>
          </div>
        )}
      </div>

      {/* Zone Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', paddingBottom: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><MapPin size={13} /> Zone:</span>
        {['all', ...ZONES].map(z => (
          <button key={z} type="button" onClick={() => setZoneFilter(z)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: zoneFilter === z ? 'var(--brand)' : 'var(--surface)',
              color: zoneFilter === z ? 'white' : 'var(--text-2)' }}>
            {z === 'all' ? 'All Zones' : z}
          </button>
        ))}
      </div>

      {/* Sort Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {SORT_OPTIONS.map(opt => (
          <button key={opt.value} type="button" onClick={() => setSortBy(opt.value)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: sortBy === opt.value ? 'var(--brand)' : 'var(--surface)',
              color: sortBy === opt.value ? 'white' : 'var(--text-2)' }}>
            {opt.label}
          </button>
        ))}
      </div>

      {sortedLoans.map((loan, idx) => {
        const progress = loan.due_amount > 0 ? Math.min((loan.collected_amount / loan.due_amount) * 100, 100) : 0;
        const freq = loan.repayment_frequency || 'monthly';
        const expanded = expandedId === loan.id;
        const totalDeductions = (loan.field_visit_charge || 0) + (loan.document_fee || 0) + (loan.processing_fee || 0);
        const cashDisbursed = Math.max(0, (loan.loan_amount || 0) - totalDeductions);
        return (
          <div key={loan.id} className="card card-hover borrower-card" style={{ padding: '16px', display: 'flex', gap: '16px', marginBottom: '12px', animation: `fadeUp .4s ${idx * 0.05}s ease both`, cursor: 'pointer' }}
            onClick={() => setExpandedId(expanded ? null : loan.id)}>
            {loan.photo_url
              ? <img src={loan.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
              : <div className="party-avatar">{loan.customer_name.charAt(0).toUpperCase()}</div>}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{loan.customer_name}</h3>
                  {loan.shop_name && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>🏪 {loan.shop_name}</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', padding: '2px 7px', borderRadius: '6px',
                    background: freq === 'daily' ? 'var(--green-soft)' : 'var(--brand-soft)',
                    color: freqColor[freq] || 'var(--brand-light)' }}>{freq}</span>
                  <span className={loan.status === 'active' ? 'text-green' : 'text-muted'}
                    style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{loan.status}</span>
                </div>
              </div>
              {loan.customer_phone && <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>📱 {loan.customer_phone}{loan.alternate_phone ? ` · Alt: ${loan.alternate_phone}` : ''}</div>}
              {loan.zone && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: 2 }}>🗺️ {loan.zone} zone</div>}
              {loan.customer_address && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: 2 }}>📍 {loan.customer_address.split(',')[0]}</div>}
              {loan.repayment_amount > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>
                  <RefreshCw size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                  ₹{loan.repayment_amount.toLocaleString()} per {freq === 'custom' ? 'installment' : freq.replace('ly', '')}
                </div>
              )}
              <div style={{ height: '6px', background: 'var(--surface-3)', borderRadius: '3px', margin: '10px 0 4px', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--green)', borderRadius: '3px', transition: 'width 0.4s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span className="text-green">Paid: ₹{loan.collected_amount.toLocaleString()}</span>
                <span className="text-warning">Due: ₹{loan.pending_amount.toLocaleString()}</span>
              </div>
              {expanded && (
                <div className="animate-slideUp" style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                    {loan.alternate_phone && <div><span style={{ color: 'var(--text-2)' }}>Alt Phone:</span> {loan.alternate_phone}</div>}
                    {loan.aadhaar_number && <div><span style={{ color: 'var(--text-2)' }}>Aadhaar:</span> {loan.aadhaar_number}</div>}
                    {loan.guarantor_name && <div><span style={{ color: 'var(--text-2)' }}>Guarantor:</span> {loan.guarantor_name}</div>}
                    {loan.guarantor_phone && <div><span style={{ color: 'var(--text-2)' }}>Guarantor Ph:</span> {loan.guarantor_phone}</div>}
                    {loan.guarantor_address && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-2)' }}>Guarantor Addr:</span> {loan.guarantor_address}</div>}
                    <div><span style={{ color: 'var(--text-2)' }}>Loan:</span> ₹{(loan.loan_amount || 0).toLocaleString()}</div>
                    <div><span style={{ color: 'var(--text-2)' }}>Monthly Interest:</span> ₹{(loan.monthly_interest_amount || 0).toLocaleString()}</div>
                    <div><span style={{ color: 'var(--text-2)' }}>Field Visit:</span> ₹{(loan.field_visit_charge || 0).toLocaleString()}</div>
                    <div><span style={{ color: 'var(--text-2)' }}>Doc Fee:</span> ₹{(loan.document_fee || 0).toLocaleString()}</div>
                    <div><span style={{ color: 'var(--text-2)' }}>Processing:</span> ₹{(loan.processing_fee || 0).toLocaleString()}</div>
                    <div><span style={{ color: 'var(--text-2)' }}>Total Deductions:</span> ₹{totalDeductions.toLocaleString()}</div>
                    <div><span style={{ color: 'var(--text-2)' }}>Cash Disbursed:</span> ₹{cashDisbursed.toLocaleString()}</div>
                    <div><span style={{ color: 'var(--text-2)' }}>Total Due:</span> ₹{(loan.due_amount || 0).toLocaleString()}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {sortedLoans.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-2)', marginTop: '60px' }}>
          <ShieldCheck size={48} style={{ opacity: 0.15, marginBottom: '16px' }} />
          <p>No borrowers{zoneFilter !== 'all' ? ` in ${zoneFilter} zone` : ''} yet. Click "Add Borrower + Loan" to begin.</p>
        </div>
      )}

      {/* ── Add Borrower + Loan Modal ──────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
          <div className="card" style={{ width: '100%', maxWidth: '540px', marginBottom: '16px', animation: 'slideUp 0.3s ease', maxHeight: '94vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>New Borrower + Loan</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>* = required</p>
              </div>
              <button onClick={resetModal} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleCreate}>
              {/* ── Photo: upload or live camera ── */}
              <div style={{ marginBottom: 20 }}>
                <PhotoCapture value={photoPreview} onChange={setPhotoPreview} label="Add photo (upload or camera)" />
              </div>

              {/* ── Personal Details ── */}
              <SectionLabel>Personal Details</SectionLabel>

              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <IconInput icon={<User size={16} />}><input required type="text" className="form-input" placeholder="e.g. Ramesh Kumar" {...field('name')} /></IconInput>
              </div>
              <div className="form-group">
                <label className="form-label">Shop / Business Name</label>
                <IconInput icon={<Building2 size={16} />}><input type="text" className="form-input" placeholder="e.g. Ramesh General Store" {...field('shop_name')} /></IconInput>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Primary Mobile *</label>
                  <IconInput icon={<Phone size={16} />}><input required type="tel" className="form-input" placeholder="+91 9876543210" {...field('phone')} /></IconInput>
                </div>
                <div className="form-group">
                  <label className="form-label">Alternate Mobile</label>
                  <IconInput icon={<PhoneCall size={16} />}><input type="tel" className="form-input" placeholder="+91 9876543211" {...field('alternate_phone')} /></IconInput>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Zone *</label>
                <IconInput icon={<MapPin size={16} />}>
                  <select className="form-input" {...field('zone')}>
                    <option value="">Select zone…</option>
                    {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </IconInput>
              </div>

              {/* OTP Section */}
              <div style={{ marginBottom: 12 }}>
                <button type="button" onClick={() => setShowOtpSection(!showOtpSection)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--brand-light)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                  <Shield size={14} /> {phoneVerified ? '✅ Phone Verified' : 'Verify Phone with OTP'}
                  {showOtpSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showOtpSection && !phoneVerified && (
                  <OtpVerifier phone={formData.phone} onVerified={() => setPhoneVerified(true)} />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <IconInput icon={<Mail size={16} />}><input type="email" className="form-input" placeholder="email@gmail.com" {...field('email')} /></IconInput>
                </div>
                <div className="form-group">
                  <label className="form-label">Aadhaar Number</label>
                  <IconInput icon={<Key size={16} />}>
                    <input type="text" className="form-input" placeholder="XXXX XXXX XXXX" maxLength={14} {...field('aadhaar_number')} />
                  </IconInput>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Address</label>
                <IconInput icon={<MapPin size={16} />} top>
                  <textarea rows={2} className="form-input" style={{ resize: 'none' }} placeholder="House no., Street, City, State" {...field('address')} />
                </IconInput>
              </div>

              {/* ── Guarantor ── */}
              <SectionLabel>Guarantor Details</SectionLabel>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Guarantor Name</label>
                  <IconInput icon={<User size={16} />}><input type="text" className="form-input" placeholder="Guarantor name" {...field('guarantor_name')} /></IconInput>
                </div>
                <div className="form-group">
                  <label className="form-label">Guarantor Phone</label>
                  <IconInput icon={<Phone size={16} />}><input type="tel" className="form-input" placeholder="+91 ..." {...field('guarantor_phone')} /></IconInput>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Guarantor Address</label>
                <IconInput icon={<MapPin size={16} />} top>
                  <textarea rows={2} className="form-input" style={{ resize: 'none' }} placeholder="Guarantor's address" {...field('guarantor_address')} />
                </IconInput>
              </div>

              {/* ── Loan Details ── */}
              <SectionLabel>Loan Details</SectionLabel>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Loan Amount (₹) *</label>
                  <IconInput icon={<IndianRupee size={16} />}><input required min="1" step="0.01" type="number" className="form-input" placeholder="0.00" {...field('amount')} /></IconInput>
                </div>
                <div className="form-group">
                  <label className="form-label">Monthly Interest (₹)</label>
                  <IconInput icon={<IndianRupee size={16} />}><input min="0" step="0.01" type="number" className="form-input" placeholder="e.g. 500" {...field('monthly_interest_amount')} /></IconInput>
                </div>
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input required type="date" className="form-input" {...field('startDate')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date *</label>
                  <input required type="date" className="form-input" {...field('closeDate')} />
                </div>
              </div>

              {/* ── Fee Breakdown ── */}
              <SectionLabel>Charges & Fees (₹)</SectionLabel>

              <div style={{ background: 'var(--bg)', borderRadius: 14, padding: 14, border: '1px solid var(--border)', marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Field Visit Charge</label>
                    <input min="0" step="0.01" type="number" className="form-input" placeholder="₹0" {...field('field_visit_charge')} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Document Fee</label>
                    <input min="0" step="0.01" type="number" className="form-input" placeholder="₹0" {...field('document_fee')} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Processing Fee</label>
                    <input min="0" step="0.01" type="number" className="form-input" placeholder="₹0" {...field('processing_fee')} />
                  </div>
                </div>

                {/* Total Due Summary */}
                {totalDue > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6 }}>BREAKDOWN</div>
                    {[
                      { label: 'Principal (Loan Amount)', value: principal },
                      { label: 'Monthly Interest (₹)', value: monthlyInterest },
                      { label: 'Field Visit Charge', value: fieldVisit },
                      { label: 'Document Fee', value: docFee },
                      { label: 'Processing Fee', value: procFee },
                    ].filter(r => r.value > 0).map(r => (
                      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-2)' }}>{r.label}</span>
                        <span>₹{r.value.toLocaleString()}</span>
                      </div>
                    ))}
                    {totalDeductions > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--red)' }}>
                        <span>Total Deductions (from principal)</span>
                        <span>− ₹{totalDeductions.toLocaleString()}</span>
                      </div>
                    )}
                    {principal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--green)' }}>
                        <span>Cash Disbursed to Borrower</span>
                        <span>₹{cashDisbursed.toLocaleString()}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14, paddingTop: 6, borderTop: '1px solid var(--border)', marginTop: 4, color: 'var(--amber)' }}>
                      <span>Total Due (Repayable)</span>
                      <span>₹{totalDue.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Repayment Frequency ── */}
              <SectionLabel>Repayment Schedule</SectionLabel>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                {FREQ_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => set('repaymentFreq', opt.value)}
                    style={{ padding: '12px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                      border: `2px solid ${formData.repaymentFreq === opt.value ? 'var(--brand)' : 'var(--border)'}`,
                      background: formData.repaymentFreq === opt.value ? 'var(--brand-soft)' : 'var(--bg)',
                      color: 'var(--text)', transition: 'all 0.2s' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '2px' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Amount per installment (₹)</label>
                <IconInput icon={<IndianRupee size={16} />}>
                  <input min="0" step="0.01" type="number" className="form-input" placeholder="e.g. 500" {...field('repaymentAmount')} />
                </IconInput>
              </div>

              {/* WhatsApp Reminder Preview */}
              {formData.closeDate && (
                <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <ShieldCheck size={15} style={{ color: 'var(--brand)' }} />
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>Auto WhatsApp Reminders</span>
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

              <button type="submit" className="save-btn" disabled={loading}>
                {loading ? 'Creating...' : '✅ Confirm Loan Disbursal'}
              </button>
            </form>
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
