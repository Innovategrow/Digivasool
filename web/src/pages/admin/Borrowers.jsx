import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { Search, Plus, X, Phone, MapPin, Star, CreditCard, CheckCircle, Clock, XCircle } from 'lucide-react';

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

function AddBorrowerModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: '', phone: '', address: '', guarantor: '', rating: 4, kyc: 'pending' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Add New Borrower</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Rajan Kumar" />
          </div>
          <div className="form-group">
            <label className="form-label">Phone *</label>
            <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="10-digit mobile" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Address</label>
          <input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Guarantor Name</label>
            <input className="form-input" value={form.guarantor} onChange={e => set('guarantor', e.target.value)} placeholder="Guarantor name" />
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
          <label className="form-label">Credit Rating (1-5)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => set('rating', n)} style={{ background: n <= form.rating ? 'var(--amber-soft)' : 'var(--surface-2)', border: `1px solid ${n <= form.rating ? 'var(--amber)' : 'var(--border)'}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: n <= form.rating ? 'var(--amber)' : 'var(--text-2)', fontWeight: 700 }}>
                {n}★
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary w-full" onClick={() => { if (form.name && form.phone) { onAdd(form); onClose(); } }}>
          <Plus size={16} /> Add Borrower
        </button>
      </div>
    </div>
  );
}

function BorrowerDrawer({ borrower, loans, onClose }) {
  const history = loans.filter(l => borrower.loans.includes(l.id));
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ width: 420, background: 'var(--surface)', borderLeft: '1px solid var(--border-2)', overflowY: 'auto', animation: 'slideInRight .3s ease', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Borrower Profile</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Avatar + Info */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--brand-soft)', border: '2px solid var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: 'var(--brand-light)' }}>
            {borrower.name.charAt(0)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{borrower.name}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span className={`badge ${KYC_CONFIG[borrower.kyc]?.cls}`}>{KYC_CONFIG[borrower.kyc]?.icon} {KYC_CONFIG[borrower.kyc]?.label}</span>
              <span className="badge badge-indigo">{borrower.loans.length} Loan{borrower.loans.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <HealthRing score={borrower.rating * 20} />
        </div>

        {/* Details */}
        {[
          { icon: <Phone size={14} />, label: 'Phone', value: borrower.phone },
          { icon: <MapPin size={14} />, label: 'Address', value: borrower.address },
          { icon: <Star size={14} />, label: 'Guarantor', value: borrower.guarantor },
        ].map(d => (
          <div key={d.label} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
            <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{d.icon}</div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{d.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{d.value}</div>
            </div>
          </div>
        ))}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 8 }}>
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

export default function Borrowers() {
  const { state, dispatch } = useAppData();
  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);

  const filtered = state.borrowers.filter(b => {
    const q = search.toLowerCase();
    const matchSearch = b.name.toLowerCase().includes(q) || b.phone.includes(q);
    const matchKyc = kycFilter === 'all' || b.kyc === kycFilter;
    return matchSearch && matchKyc;
  });

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Borrowers</div>
          <div className="page-subtitle">{state.borrowers.length} registered borrowers</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} />Add Borrower</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div className="search-bar">
          <Search size={16} style={{ color: 'var(--text-2)' }} />
          <input placeholder="Search name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['all', 'verified', 'pending', 'rejected'].map(f => (
          <button key={f} onClick={() => setKycFilter(f)} className="btn btn-secondary btn-sm" style={{ background: kycFilter === f ? 'var(--brand-soft)' : undefined, color: kycFilter === f ? 'var(--brand-light)' : undefined, borderColor: kycFilter === f ? 'var(--brand)' : undefined }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
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
              onClick={() => setSelected(b)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--brand-soft)', border: '1px solid rgba(99,102,241,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: 'var(--brand-light)', flexShrink: 0 }}>
                  {b.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{b.name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${kyc?.cls}`}>{kyc?.icon} {kyc?.label}</span>
                    {activeCount > 0 && <span className="badge badge-indigo"><CreditCard size={10} /> {activeCount} Active</span>}
                  </div>
                </div>
                <HealthRing score={health} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-2)' }}>
                <span><Phone size={12} style={{ display: 'inline', marginRight: 4 }} />{b.phone}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />{b.address.split(',')[0]}</span>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: '2px' }}>
                {[1,2,3,4,5].map(n => <span key={n} style={{ color: n <= b.rating ? 'var(--amber)' : 'var(--surface-3)', fontSize: 14 }}>★</span>)}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && <AddBorrowerModal onClose={() => setShowAdd(false)} onAdd={payload => dispatch({ type: 'ADD_BORROWER', payload })} />}
      {selected && <BorrowerDrawer borrower={selected} loans={state.loans} onClose={() => setSelected(null)} />}
    </div>
  );
}
