import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Wallet, Banknote, Search, Filter, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../utils/api';

const SORT_OPTIONS = [
  { value: 'balance',  label: 'Highest Balance' },
  { value: 'name',     label: 'Name A-Z' },
  { value: 'location', label: '📍 By Location' },
  { value: 'newest',   label: 'Newest First' },
];

export default function CollectionEntry() {
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('balance');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    apiFetch('/api/loans/')
      .then(res => res.json())
      .then(data => setLoans(data))
      .catch(err => console.error(err));
  }, []);

  const processedLoans = useMemo(() => {
    let filtered = loans;
    if (searchQuery) {
      filtered = loans.filter(l =>
        l.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.customer_address || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return [...filtered].sort((a, b) => {
      if (sortBy === 'balance') return b.pending_amount - a.pending_amount;
      if (sortBy === 'name') return a.customer_name.localeCompare(b.customer_name);
      if (sortBy === 'location') return (a.customer_address || '').localeCompare(b.customer_address || '');
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      return 0;
    });
  }, [loans, searchQuery, sortBy]);

  const handleSave = () => {
    if (!amount || !selectedLoan) return;
    setLoading(true);
    apiFetch(`/api/loans/${selectedLoan.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), payment_method: paymentMethod }),
    })
      .then(res => res.json())
      .then(data => {
        const updated = data.data || data;
        setSelectedLoan(updated);
        setAmount('');
        setLoans(loans.map(l => l.id === updated.id ? updated : l));
        alert(`✅ Successfully recorded ₹${amount} payment!`);
      })
      .finally(() => setLoading(false));
  };

  if (!selectedLoan) {
    return (
      <div className="screen-container pt-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px', color: 'var(--text)', cursor: 'pointer', display: 'flex' }}>
            <ArrowLeft size={20} />
          </button>
          <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Select Member</h2>
        </div>

        {loans.length === 0 ? (
          <p className="text-muted text-center mt-4">No active loans. Provision members first.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name or location..." className="form-input" style={{ paddingLeft: '40px', borderRadius: '16px' }} />
              </div>
              <button onClick={() => setShowFilters(!showFilters)}
                style={{ background: showFilters ? 'var(--brand-soft)' : 'var(--surface)', border: `1px solid ${showFilters ? 'var(--brand)' : 'var(--border)'}`, color: showFilters ? 'var(--brand)' : 'var(--text)', padding: '0 16px', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.2s' }}>
                <Filter size={18} />
              </button>
            </div>

            {showFilters && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setSortBy(opt.value)}
                    style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                      background: sortBy === opt.value ? 'var(--text)' : 'var(--surface)',
                      color: sortBy === opt.value ? 'var(--bg)' : 'var(--text-2)' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              {processedLoans.map(loan => (
                <div key={loan.id} className="card" onClick={() => setSelectedLoan(loan)}
                  style={{ padding: '16px', cursor: 'pointer', margin: 0, display: 'flex', alignItems: 'center', gap: '16px', transition: 'transform 0.2s', border: '1px solid var(--border)' }}>
                  <div className="party-avatar">{loan.customer_name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{loan.customer_name}</h3>
                    <div className="text-muted" style={{ fontSize: '12px', marginTop: '2px' }}>Due: {loan.closing_date}</div>
                    {loan.customer_address && (
                      <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={10} /> {loan.customer_address.split(',')[0]}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Balance</div>
                    <div className={loan.pending_amount > 0 ? 'text-warning' : 'text-green'} style={{ fontWeight: 800, fontSize: '15px' }}>₹{loan.pending_amount.toLocaleString()}</div>
                  </div>
                </div>
              ))}
              {processedLoans.length === 0 && <p className="text-center text-muted">No members match your search.</p>}
            </div>
          </>
        )}
      </div>
    );
  }

  const progress = (selectedLoan.collected_amount / selectedLoan.due_amount) * 100;
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="screen-container pt-4">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button onClick={() => setSelectedLoan(null)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px', color: 'var(--text)', cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Capture Payment</h2>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="party-avatar">{selectedLoan.customer_name.charAt(0).toUpperCase()}</div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{selectedLoan.customer_name}</h3>
              <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                Status: <span className="text-green" style={{ textTransform: 'uppercase' }}>{selectedLoan.status}</span>
              </div>
              {selectedLoan.customer_address && (
                <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: 2 }}>📍 {selectedLoan.customer_address.split(',')[0]}</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span className="text-muted">Recovery Progress</span>
            <span style={{ fontWeight: 700, color: 'var(--green)' }}>{clampedProgress.toFixed(1)}%</span>
          </div>
          <div style={{ height: '8px', background: 'var(--surface-3)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${clampedProgress}%`, height: '100%', background: 'var(--green)', transition: 'width 0.5s ease' }} />
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-row">
            <span className="detail-label">Principal Amount</span>
            <span className="detail-value text-muted">₹{selectedLoan.loan_amount?.toLocaleString()}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Total Due</span>
            <span className="detail-value">₹{selectedLoan.due_amount?.toLocaleString()}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Recovered</span>
            <span className="detail-value text-green">₹{selectedLoan.collected_amount?.toLocaleString()}</span>
          </div>
          <div className="detail-row pt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <span className="detail-label text-warning" style={{ fontWeight: 700 }}>Outstanding Balance</span>
            <span className="detail-value text-warning" style={{ fontSize: '18px' }}>₹{selectedLoan.pending_amount?.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment Details</h3>

        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '24px', color: 'var(--text-2)', fontWeight: 800 }}>₹</span>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
            style={{ width: '100%', background: 'var(--bg)', border: '2px solid var(--brand-soft)', borderRadius: '16px', padding: '20px 20px 20px 48px', fontSize: '32px', fontWeight: 800, color: 'var(--text)', outline: 'none', transition: 'border-color 0.2s' }} />
        </div>

        <div className="payment-toggle" style={{ marginBottom: '24px' }}>
          <button className={`payment-btn ${paymentMethod === 'Cash' ? 'active' : ''}`} onClick={() => setPaymentMethod('Cash')}>
            <Banknote size={20} /> Cash Flow
          </button>
          <button className={`payment-btn ${paymentMethod === 'GPay' ? 'active' : ''}`} onClick={() => setPaymentMethod('GPay')}>
            <Wallet size={20} /> UPI / GPay
          </button>
        </div>

        <button className="save-btn" onClick={handleSave} disabled={loading || !amount}>
          {loading ? 'Processing...' : `Record ₹${amount || '0'} Payment`}
        </button>
      </div>
    </div>
  );
}
