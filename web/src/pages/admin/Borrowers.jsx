import { useState, useRef } from 'react';
import { useAppData, ZONES } from '../../context/AppDataContext';
import { Search, Plus, X, Phone, MapPin, CreditCard, CheckCircle, Clock, XCircle, PhoneCall, Key, Shield, GitMerge, ChevronDown, ChevronUp, ShieldCheck, Wrench, Check, Store, Map, Star } from 'lucide-react';
import { API_BASE_URL } from '../../config';
import PhotoCapture from '../../components/PhotoCapture';

const KYC_CONFIG = {
  verified: { label: 'Verified', cls: 'badge-green', icon: <CheckCircle size={10} /> },
  pending:  { label: 'Pending',  cls: 'badge-amber', icon: <Clock size={10} /> },
  rejected: { label: 'Rejected', cls: 'badge-red',   icon: <XCircle size={10} /> },
};

const SCHEME_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', enterprise: 'Enterprise', interest_only: 'Interest Only' };

function HealthRing({ score }) {
  const r = 24, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)';
  return (
    <div className="health-ring" style={{ width: 56, height: 56 }}>
      <svg width={56} height={56} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={28} cy={28} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
        <circle cx={28} cy={28} r={r} fill="none" stroke={color} strokeWidth={4} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="health-score-text" style={{ color, fontSize: 11, transform: 'none', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{score}</div>
    </div>
  );
}

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
      <Check size={16} style={{ color: 'var(--green)' }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>Phone verified</span>
    </div>
  );

  return (
    <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', marginTop: 8 }}>
      {!sent ? (
        <button type="button" onClick={sendOtp} disabled={!phone || loading}
          style={{ width: '100%', padding: '10px', background: 'var(--brand-soft)', border: '1px solid var(--brand)', color: 'var(--brand-light)', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Phone size={14} /> {loading ? 'Sending…' : 'Send OTP to verify phone'}
        </button>
      ) : (
        <div>
          {devOtp && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={12} /> Test OTP: <strong style={{ letterSpacing: 3 }}>{devOtp}</strong></div>}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {otp.map((d, i) => (
              <input key={i} ref={el => refs.current[i] = el} type="tel" maxLength={1} value={d}
                onChange={e => handleChange(e.target.value, i)} onKeyDown={e => handleKey(e, i)}
                style={{ width: 36, height: 42, textAlign: 'center', fontSize: 18, fontWeight: 800, background: d ? 'var(--brand-soft)' : 'var(--surface-3)', border: `2px solid ${d ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10, color: 'var(--text)', outline: 'none' }} />
            ))}
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button type="button" onClick={verifyOtp} disabled={otp.join('').length < 6 || loading}
            style={{ width: '100%', padding: '10px', background: 'var(--green)', border: 'none', color: 'white', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Check size={14} /> {loading ? 'Verifying…' : 'Verify OTP'}
          </button>
        </div>
      )}
    </div>
  );
}

function AddBorrowerModal({ onClose, onAdd }) {
  const [form, setForm] = useState({
    name: '', phone: '', alternate_phone: '', zone: '', address: '',
    shop_name: '', aadhaar_number: '',
    guarantor: '', guarantor_phone: '', guarantor_address: '',
    rating: 4, kyc: 'pending', photo: null,
  });
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [showOtpSection, setShowOtpSection] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh', overflowY: 'auto', maxWidth: 500 }}>
        <div className="modal-header">
          <div className="modal-title">Add New Borrower</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Photo: upload or live camera */}
        <div style={{ marginBottom: 20 }}>
          <PhotoCapture value={form.photo} onChange={v => set('photo', v)} label="Add photo (upload or camera)" />
        </div>

        {/* Personal */}
        <SectionLabel>Personal Details</SectionLabel>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Rajan Kumar" />
          </div>
          <div className="form-group">
            <label className="form-label">Shop / Business Name</label>
            <input className="form-input" value={form.shop_name} onChange={e => set('shop_name', e.target.value)} placeholder="e.g. Rajan Stores" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Primary Phone *</label>
            <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="10-digit mobile" />
          </div>
          <div className="form-group">
            <label className="form-label">Alternate Phone</label>
            <input className="form-input" value={form.alternate_phone} onChange={e => set('alternate_phone', e.target.value)} placeholder="Alt number" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} /> Zone *</label>
          <select className="form-input" value={form.zone} onChange={e => set('zone', e.target.value)}>
            <option value="">Select zone…</option>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>

        {/* OTP Section */}
        <div style={{ marginBottom: 12 }}>
          <button type="button" onClick={() => setShowOtpSection(!showOtpSection)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--brand-light)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            {phoneVerified ? <Check size={14} style={{ color: 'var(--green)' }} /> : <Shield size={14} />} {phoneVerified ? 'Phone Verified' : 'Verify Phone with OTP'}
            {showOtpSection ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showOtpSection && !phoneVerified && (
            <OtpVerifier phone={form.phone} onVerified={() => setPhoneVerified(true)} />
          )}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Aadhaar Number</label>
            <input className="form-input" value={form.aadhaar_number} onChange={e => set('aadhaar_number', e.target.value)} placeholder="XXXX XXXX XXXX" maxLength={14} />
          </div>
          <div className="form-group">
            <label className="form-label">KYC Status</label>
            <select className="form-input" value={form.kyc} onChange={e => set('kyc', e.target.value)}>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Address</label>
          <input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address" />
        </div>

        {/* Guarantor */}
        <SectionLabel>Guarantor Details</SectionLabel>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Guarantor Name</label>
            <input className="form-input" value={form.guarantor} onChange={e => set('guarantor', e.target.value)} placeholder="Guarantor name" />
          </div>
          <div className="form-group">
            <label className="form-label">Guarantor Phone</label>
            <input className="form-input" value={form.guarantor_phone} onChange={e => set('guarantor_phone', e.target.value)} placeholder="Guarantor phone" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Guarantor Address</label>
          <input className="form-input" value={form.guarantor_address} onChange={e => set('guarantor_address', e.target.value)} placeholder="Guarantor full address" />
        </div>

        {/* Rating */}
        <div className="form-group">
          <label className="form-label">Credit Rating (1-5)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => set('rating', n)} style={{ background: n <= form.rating ? 'var(--amber-soft)' : 'var(--surface-2)', border: `1px solid ${n <= form.rating ? 'var(--amber)' : 'var(--border)'}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: n <= form.rating ? 'var(--amber)' : 'var(--text-2)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                {n} <Star size={12} fill={n <= form.rating ? 'var(--amber)' : 'none'} />
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary w-full" disabled={!(form.name && form.phone && form.zone)} onClick={() => {
          if (form.name && form.phone && form.zone) { onAdd(form); onClose(); }
        }}>
          <Plus size={16} /> Add Borrower
        </button>
      </div>
    </div>
  );
}

function BorrowerDrawer({ borrower, loans, onClose, onVerify }) {
  const history = loans.filter(l => borrower.loans.includes(l.id));
  const aadhaar = borrower.aadhaar_number;
  const maskedAadhaar = aadhaar ? `XXXX XXXX ${aadhaar.slice(-4)}` : '—';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ width: 440, background: 'var(--surface)', borderLeft: '1px solid var(--border-2)', overflowY: 'auto', animation: 'slideInRight .3s ease', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Borrower Profile</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          {borrower.photo
            ? <img src={borrower.photo} alt="" style={{ width: 64, height: 64, borderRadius: 18, objectFit: 'cover' }} />
            : <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--brand-soft)', border: '2px solid var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: 'var(--brand-light)' }}>
                {borrower.name.charAt(0)}
              </div>
          }
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{borrower.name}</div>
            {borrower.shop_name && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Store size={11} /> {borrower.shop_name}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span className={`badge ${KYC_CONFIG[borrower.kyc]?.cls}`}>{KYC_CONFIG[borrower.kyc]?.icon} {KYC_CONFIG[borrower.kyc]?.label}</span>
              {borrower.zone && <span className="badge badge-indigo"><MapPin size={10} /> {borrower.zone}</span>}
              <span className="badge badge-indigo">{borrower.loans.length} Loan{borrower.loans.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <HealthRing score={borrower.rating * 20} />
        </div>

        {/* Zone-based KYC verification */}
        {borrower.kyc !== 'verified' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--amber-soft)', border: '1px solid var(--amber)', borderRadius: 12, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              Member in <strong>{borrower.zone || '—'}</strong> zone — KYC {borrower.kyc}.
            </div>
            <button className="btn btn-success btn-sm" onClick={() => onVerify(borrower.id)}>
              <ShieldCheck size={14} /> Verify
            </button>
          </div>
        )}

        {/* Details grid */}
        <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
          {[
            { icon: <Phone size={14} />,    label: 'Primary Phone',     value: borrower.phone },
            borrower.alternate_phone && { icon: <PhoneCall size={14} />, label: 'Alternate Phone', value: borrower.alternate_phone },
            { icon: <MapPin size={14} />,   label: 'Zone',              value: borrower.zone || '—' },
            { icon: <MapPin size={14} />,   label: 'Address',           value: borrower.address },
            { icon: <Key size={14} />,      label: 'Aadhaar',           value: maskedAadhaar },
          ].filter(Boolean).map(d => (
            <div key={d.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{d.icon}</div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{d.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{d.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Guarantor */}
        {(borrower.guarantor || borrower.guarantor_phone || borrower.guarantor_address) && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }}>GUARANTOR</div>
            {borrower.guarantor && <div style={{ fontWeight: 700, marginBottom: 4 }}>{borrower.guarantor}</div>}
            {borrower.guarantor_phone && <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {borrower.guarantor_phone}</div>}
            {borrower.guarantor_address && <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {borrower.guarantor_address}</div>}
          </div>
        )}

        {/* Loan History */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Loan History</div>
          {history.length === 0 ? <div style={{ color: 'var(--text-2)', fontSize: 13 }}>No loans yet</div> : history.map(loan => (
            <div key={loan.id} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 14, marginBottom: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className={`badge badge-${loan.status === 'active' ? 'green' : loan.status === 'closed' ? 'gray' : 'red'}`}>{loan.status.toUpperCase()}</span>
                <span style={{ fontWeight: 800, color: 'var(--brand-light)' }}>₹{loan.principal.toLocaleString()}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {SCHEME_LABEL[loan.type]} · ₹{loan.installment}/installment · Started {loan.startDate}
              </div>
              <div className="progress-bar" style={{ marginTop: 8 }}>
                <div className="progress-fill" style={{ width: `${Math.round((loan.collectedAmount / loan.total) * 100)}%`, background: 'var(--green)' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                ₹{loan.collectedAmount.toLocaleString()} / ₹{loan.total.toLocaleString()} collected
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MergeModal({ borrowers, onClose, onMerge }) {
  const [selected, setSelected] = useState([]);
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < 2 ? [...s, id] : s);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Merge Borrowers</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>Select exactly 2 borrowers to merge. Their loan records will be combined under the first selected.</p>
        <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
          {borrowers.map(b => (
            <div key={b.id} onClick={() => toggle(b.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `2px solid ${selected.includes(b.id) ? 'var(--brand)' : 'var(--border)'}`, background: selected.includes(b.id) ? 'var(--brand-soft)' : 'var(--surface-2)', cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--brand-light)' }}>{b.name.charAt(0)}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{b.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{b.phone} · {b.loans.length} loans</div>
              </div>
              {selected.includes(b.id) && <CheckCircle size={18} style={{ marginLeft: 'auto', color: 'var(--green)' }} />}
            </div>
          ))}
        </div>
        <button className="btn btn-primary w-full" style={{ marginTop: 16 }} disabled={selected.length !== 2}
          onClick={() => { onMerge(selected[0], selected[1]); onClose(); }}>
          <GitMerge size={16} /> Merge Selected Borrowers
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '1px', margin: '16px 0 10px' }}>{children}</div>;
}

export default function Borrowers() {
  const { state, dispatch } = useAppData();
  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [showAdd, setShowAdd] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const selected = selectedId ? state.borrowers.find(b => b.id === selectedId) : null;

  const filtered = state.borrowers.filter(b => {
    const q = search.toLowerCase();
    const matchSearch = b.name.toLowerCase().includes(q) || b.phone.includes(q);
    const matchKyc = kycFilter === 'all' || b.kyc === kycFilter;
    const matchZone = zoneFilter === 'all' || b.zone === zoneFilter;
    return matchSearch && matchKyc && matchZone;
  }).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'location') return (a.address || '').localeCompare(b.address || '');
    if (sortBy === 'zone') return (a.zone || '').localeCompare(b.zone || '');
    if (sortBy === 'rating') return b.rating - a.rating;
    return 0;
  });

  const handleMerge = (id1, id2) => {
    dispatch({ type: 'MERGE_BORROWERS', payload: { keepId: id1, mergeId: id2 } });
  };

  const handleVerify = (id) => dispatch({ type: 'VERIFY_BORROWER', payload: { id, kyc: 'verified' } });

  // "Verify members according to zone": bulk-verify everyone pending in the current view.
  const pendingInView = filtered.filter(b => b.kyc !== 'verified');
  const handleVerifyZone = () => pendingInView.forEach(b => handleVerify(b.id));

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Borrowers</div>
          <div className="page-subtitle">{state.borrowers.length} registered borrowers</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowMerge(true)}><GitMerge size={16} />Merge</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} />Add Borrower</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
          <Search size={16} style={{ color: 'var(--text-2)' }} />
          <input placeholder="Search name, phone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['all', 'verified', 'pending', 'rejected'].map(f => (
          <button key={f} onClick={() => setKycFilter(f)} className="btn btn-secondary btn-sm"
            style={{ background: kycFilter === f ? 'var(--brand-soft)' : undefined, color: kycFilter === f ? 'var(--brand-light)' : undefined, borderColor: kycFilter === f ? 'var(--brand)' : undefined }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Zone filter — admins verify members zone by zone */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> Zone:</span>
        {['all', ...ZONES].map(z => (
          <button key={z} onClick={() => setZoneFilter(z)} className="btn btn-secondary btn-sm"
            style={{ background: zoneFilter === z ? 'var(--brand-soft)' : undefined, color: zoneFilter === z ? 'var(--brand-light)' : undefined, borderColor: zoneFilter === z ? 'var(--brand)' : undefined }}>
            {z === 'all' ? 'All Zones' : z}
          </button>
        ))}
      </div>

      {/* Zone verification banner */}
      {pendingInView.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--amber-soft)', border: '1px solid var(--amber)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>
            <strong>{pendingInView.length}</strong> member{pendingInView.length !== 1 ? 's' : ''} awaiting KYC verification
            {zoneFilter !== 'all' ? <> in <strong>{zoneFilter}</strong> zone</> : ' across all zones'}.
          </div>
          <button className="btn btn-success btn-sm" onClick={handleVerifyZone}>
            <ShieldCheck size={14} /> Verify {zoneFilter !== 'all' ? `${zoneFilter} zone` : 'all'}
          </button>
        </div>
      )}

      {/* Sort */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ v: 'name', icon: null, l: 'A-Z' }, { v: 'location', icon: MapPin, l: 'Location' }, { v: 'zone', icon: Map, l: 'Zone' }, { v: 'rating', icon: Star, l: 'Rating' }].map(s => (
          <button key={s.v} onClick={() => setSortBy(s.v)} className="btn btn-secondary btn-sm"
            style={{ background: sortBy === s.v ? 'var(--amber-soft)' : undefined, color: sortBy === s.v ? 'var(--amber)' : undefined, borderColor: sortBy === s.v ? 'var(--amber)' : undefined }}>
            {s.icon && <s.icon size={13} />} {s.l}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {filtered.map(b => {
          const activeCount = state.loans.filter(l => b.loans.includes(l.id) && l.status === 'active').length;
          const kyc = KYC_CONFIG[b.kyc];
          const health = b.rating * 20;
          return (
            <div key={b.id} className="card" style={{ cursor: 'pointer', transition: 'all .2s', border: '1px solid var(--border)' }}
              onClick={() => setSelectedId(b.id)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                {b.photo
                  ? <img src={b.photo} alt="" style={{ width: 48, height: 48, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--brand-soft)', border: '1px solid rgba(99,102,241,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: 'var(--brand-light)', flexShrink: 0 }}>
                      {b.name.charAt(0)}
                    </div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{b.name}</div>
                  {b.shop_name && <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Store size={10} /> {b.shop_name}</div>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${kyc?.cls}`}>{kyc?.icon} {kyc?.label}</span>
                    {b.zone && <span className="badge badge-indigo"><MapPin size={10} /> {b.zone}</span>}
                    {activeCount > 0 && <span className="badge badge-indigo"><CreditCard size={10} /> {activeCount} Active</span>}
                  </div>
                </div>
                <HealthRing score={health} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-2)', flexWrap: 'wrap' }}>
                <span><Phone size={12} style={{ display: 'inline', marginRight: 4 }} />{b.phone}</span>
                {b.alternate_phone && <span><PhoneCall size={12} style={{ display: 'inline', marginRight: 4 }} />{b.alternate_phone}</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />{(b.address || '—').split(',')[0]}</span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', gap: '2px' }}>
                  {[1,2,3,4,5].map(n => <Star key={n} size={14} fill={n <= b.rating ? 'var(--amber)' : 'none'} style={{ color: n <= b.rating ? 'var(--amber)' : 'var(--surface-3)' }} />)}
                </div>
                {b.kyc !== 'verified' && (
                  <button className="btn btn-success btn-sm" onClick={e => { e.stopPropagation(); handleVerify(b.id); }}>
                    <ShieldCheck size={13} /> Verify
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && <AddBorrowerModal onClose={() => setShowAdd(false)} onAdd={payload => dispatch({ type: 'ADD_BORROWER', payload })} />}
      {showMerge && <MergeModal borrowers={state.borrowers} onClose={() => setShowMerge(false)} onMerge={handleMerge} />}
      {selected && <BorrowerDrawer borrower={selected} loans={state.loans} onClose={() => setSelectedId(null)} onVerify={handleVerify} />}
    </div>
  );
}
