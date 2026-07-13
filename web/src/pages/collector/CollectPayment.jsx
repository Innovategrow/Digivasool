import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch } from '../../utils/api';
import { Search, Banknote, Wallet, ArrowLeft, CheckCircle2, MessageCircle, ExternalLink, User, MapPin, Filter, Phone, PhoneCall } from 'lucide-react';

export default function CollectPayment() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const SORT_OPTIONS = [
    { value: 'balance',  icon: null,   label: t('highestBalance') },
    { value: 'name',     icon: null,   label: t('nameAZ') },
    { value: 'location', icon: MapPin, label: t('byArea') },
    { value: 'newest',   icon: null,   label: t('newestFirst') },
  ];
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('balance');
  const [showFilters, setShowFilters] = useState(false);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    apiFetch('/api/loans/')
      .then(r => r.json())
      .then(data => setLoans(data.filter(l => l.status === 'active' && l.pending_amount > 0)))
      .catch(console.error);
  }, []);

  const filteredLoans = useMemo(() => {
    let list = loans;
    if (searchQuery) {
      list = loans.filter(l =>
        l.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.customer_address || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'balance') return b.pending_amount - a.pending_amount;
      if (sortBy === 'name') return a.customer_name.localeCompare(b.customer_name);
      if (sortBy === 'location') return (a.zone || a.customer_address || '').localeCompare(b.zone || b.customer_address || '');
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      return 0;
    });
  }, [loans, searchQuery, sortBy]);

  const handleSave = async () => {
    if (!amount || !selectedLoan) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/loans/${selectedLoan.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(amount),
          payment_method: paymentMethod,
          collector_name: user.name,
          collector_phone: user.phone || '',
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Payment failed');
      setSuccessData(data);
      setLoans(prev => prev.map(l => l.id === data.data.id ? data.data : l).filter(l => l.pending_amount > 0));
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Success Screen ──────────────────────────────────────────────────────────
  if (successData) {
    const { data: loan, whatsapp } = successData;
    return (
      <div className="screen-container pt-4">
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--positive-soft)', border: '2px solid var(--positive)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle2 size={40} style={{ color: 'var(--positive)' }} />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px' }}>{t('paymentRecorded')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            ₹{parseFloat(amount).toLocaleString()} from <strong>{selectedLoan.customer_name}</strong> — {t('savedSuccessfully')}.
          </p>
        </div>

        <div className="card" style={{ marginBottom: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('remainingBalance')}</div>
          <div style={{ fontSize: '36px', fontWeight: 900, color: loan.pending_amount > 0 ? 'var(--warning)' : 'var(--positive)' }}>
            ₹{Math.max(loan.pending_amount, 0).toLocaleString()}
          </div>
          {loan.pending_amount <= 0 && (
            <div style={{ marginTop: '8px', color: 'var(--positive)', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircle2 size={14} /> {t('loanFullyPaid')}</div>
          )}
        </div>

        <div className="card" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <MessageCircle size={18} style={{ color: '#25D366' }} />
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>{t('sendWhatsappNotifications')}</h3>
          </div>

          <a href={whatsapp.notify_admin_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '14px', borderRadius: '14px', marginBottom: '10px', background: '#25D366', color: 'white', textDecoration: 'none', fontWeight: 700, fontSize: '15px', boxShadow: '0 4px 16px rgba(37,211,102,0.35)' }}>
            <MessageCircle size={20} /> {t('notifyAdminWhatsapp')} <ExternalLink size={14} style={{ opacity: 0.7 }} />
          </a>

          {whatsapp.notify_borrower_url && (
            <a href={whatsapp.notify_borrower_url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '14px', borderRadius: '14px', background: 'var(--positive-soft)', color: 'var(--positive)', border: '1px solid rgba(16,185,129,0.3)', textDecoration: 'none', fontWeight: 700, fontSize: '15px' }}>
              <MessageCircle size={20} /> {t('confirmToBorrower')} <ExternalLink size={14} style={{ opacity: 0.7 }} />
            </a>
          )}

          <div style={{ marginTop: '14px', background: 'var(--background)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('messagePreview')}</div>
            <pre style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-family)', margin: 0 }}>{whatsapp.message_preview}</pre>
          </div>
        </div>

        <button className="save-btn" onClick={() => { setSuccessData(null); setSelectedLoan(null); setAmount(''); setNotes(''); }}
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          {t('recordAnotherPayment')}
        </button>
      </div>
    );
  }

  // ── Select Borrower Screen ──────────────────────────────────────────────────
  if (!selectedLoan) {
    return (
      <div className="screen-container pt-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800 }}>{t('collectPaymentTitle')}</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('asRole')} <strong>{user.name}</strong></p>
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            style={{ background: showFilters ? 'var(--brand-soft)' : 'var(--surface)', border: `1px solid ${showFilters ? 'var(--brand)' : 'var(--border)'}`, color: showFilters ? 'var(--brand)' : 'var(--text)', padding: '8px 14px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Filter size={16} /> {t('sort')}
          </button>
        </div>

        {showFilters && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto' }}>
            {SORT_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setSortBy(opt.value)}
                style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: sortBy === opt.value ? 'var(--text)' : 'var(--surface)',
                  color: sortBy === opt.value ? 'var(--bg)' : 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {opt.icon && <opt.icon size={13} />}{opt.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('searchNameLocation')} className="form-input" style={{ paddingLeft: '40px', borderRadius: '16px' }} />
        </div>

        {filteredLoans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <User size={48} style={{ opacity: 0.15, margin: '0 auto 16px', display: 'block' }} />
            <p>{loans.length === 0 ? t('noActiveLoansFound') : t('noBorrowersMatch')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredLoans.map(loan => (
              <div key={loan.id} className="card" onClick={() => setSelectedLoan(loan)}
                style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', margin: 0, border: '1px solid var(--border)' }}>
                <div className="party-avatar">{loan.customer_name.charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '16px' }}>{loan.customer_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Phone size={11} /> {loan.customer_phone || t('noPhone')} · {t('dueColon')} {loan.closing_date}
                    {loan.customer_phone && (
                      <a href={`tel:${loan.customer_phone}`} onClick={e => e.stopPropagation()} title={t('callBorrower')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4, padding: '1px 8px', borderRadius: 20, background: 'var(--positive-soft)', color: 'var(--positive)', fontWeight: 700, fontSize: 11, textDecoration: 'none' }}>
                        <PhoneCall size={10} /> {t('call')}
                      </a>
                    )}
                  </div>
                  {loan.customer_address && (
                    <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={10} /> {loan.customer_address.split(',')[0]}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('balance')}</div>
                  <div className="text-warning" style={{ fontWeight: 800, fontSize: '16px' }}>₹{loan.pending_amount.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Payment Form Screen ─────────────────────────────────────────────────────
  const progress = Math.min((selectedLoan.collected_amount / selectedLoan.due_amount) * 100, 100);

  return (
    <div className="screen-container pt-4">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
        <button onClick={() => setSelectedLoan(null)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px', color: 'var(--text)', cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>{t('capturePayment')}</h2>
      </div>

      {/* Borrower Summary */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div className="party-avatar">{selectedLoan.customer_name.charAt(0).toUpperCase()}</div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{selectedLoan.customer_name}</h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {selectedLoan.customer_phone && (
                <>
                  <Phone size={11} /> {selectedLoan.customer_phone}
                  <a href={`tel:${selectedLoan.customer_phone}`} title={t('callBorrower')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4, padding: '1px 8px', borderRadius: 20, background: 'var(--positive-soft)', color: 'var(--positive)', fontWeight: 700, fontSize: 11, textDecoration: 'none' }}>
                    <PhoneCall size={10} /> {t('call')}
                  </a>
                </>
              )}
            </div>
            {selectedLoan.customer_address && (
              <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {selectedLoan.customer_address.split(',')[0]}</div>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--background)', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
            <span className="text-muted">{t('recoveryProgress')}</span>
            <span style={{ fontWeight: 700, color: 'var(--positive)' }}>{progress.toFixed(1)}%</span>
          </div>
          <div style={{ height: '8px', background: 'var(--surface-raised)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--positive)', transition: 'width 0.5s ease' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          {[
            { id: 'totalDue', label: t('totalDueLabel'), value: `₹${selectedLoan.due_amount.toLocaleString()}`, cls: '' },
            { id: 'collected', label: t('collectedLabel'), value: `₹${selectedLoan.collected_amount.toLocaleString()}`, cls: 'text-green' },
            { id: 'pending', label: t('pendingLabel'), value: `₹${selectedLoan.pending_amount.toLocaleString()}`, cls: 'text-warning' },
          ].map(item => (
            <div key={item.id} style={{ background: 'var(--background)', padding: '10px', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>{item.label}</div>
              <div className={item.cls} style={{ fontSize: '14px', fontWeight: 800 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Form */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('paymentEntry')}</h3>

        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '22px', color: 'var(--text-muted)', fontWeight: 800 }}>₹</span>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
            style={{ width: '100%', background: 'var(--background)', border: '2px solid var(--brand-soft)', borderRadius: '16px', padding: '18px 18px 18px 44px', fontSize: '30px', fontWeight: 800, color: 'var(--text)', outline: 'none' }} />
        </div>

        <div style={{ background: 'var(--background)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <User size={16} style={{ color: 'var(--text-muted)' }} />
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>{t('collectorYou')}</div>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>{user.name}</div>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>{t('notesOptional')}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Partial payment, will pay rest tomorrow..." rows={2}
            style={{ width: '100%', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', fontSize: '14px', color: 'var(--text)', outline: 'none', resize: 'none', fontFamily: 'var(--font-family)' }} />
        </div>

        <div className="payment-toggle" style={{ marginBottom: '20px' }}>
          <button className={`payment-btn ${paymentMethod === 'Cash' ? 'active' : ''}`} onClick={() => setPaymentMethod('Cash')}>
            <Banknote size={18} /> {t('cash')}
          </button>
          <button className={`payment-btn ${paymentMethod === 'GPay' ? 'active' : ''}`} onClick={() => setPaymentMethod('GPay')}>
            <Wallet size={18} /> {t('gpayUpi')}
          </button>
        </div>

        <button className="save-btn" onClick={handleSave} disabled={loading || !amount} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <CheckCircle2 size={16} /> {loading ? t('saving') : `${t('record')} ₹${amount || '0'} ${t('payment')}`}
        </button>
      </div>
    </div>
  );
}
