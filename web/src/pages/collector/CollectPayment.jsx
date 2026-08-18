import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';
import {
  ArrowLeft,
  Banknote,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Filter,
  Home,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  UserRound,
  Wallet,
} from 'lucide-react';

const money = value => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'C';
}

function timeAgo(dateValue) {
  if (!dateValue) return 'Recently';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diff = Date.now() - date.getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return { date: 'Today', time: '' };
  return {
    date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  };
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function paymentDateIso(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

export default function CollectPayment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [activePartyType, setActivePartyType] = useState('customers');
  const [activeDetailTab, setActiveDetailTab] = useState('report');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('balance');
  const [showFilters, setShowFilters] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentDate, setPaymentDate] = useState(localDateInputValue());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    apiFetch('/api/loans/')
      .then(r => r.json())
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setLoans(rows.filter(l => l.status === 'active' && Number(l.pending_amount) > 0));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedLoan?.id) return;
    apiFetch(`/api/loans/${selectedLoan.id}/payments`)
      .then(r => r.json())
      .then(data => setPayments(Array.isArray(data) ? data : []))
      .catch(() => setPayments([]));
  }, [selectedLoan?.id]);

  const filteredLoans = useMemo(() => {
    if (activePartyType === 'suppliers') return [];
    const query = searchQuery.trim().toLowerCase();
    let list = loans;
    if (query) {
      list = loans.filter(loan =>
        loan.customer_name?.toLowerCase().includes(query) ||
        loan.customer_phone?.toLowerCase().includes(query) ||
        loan.customer_address?.toLowerCase().includes(query) ||
        loan.zone?.toLowerCase().includes(query)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return (a.customer_name || '').localeCompare(b.customer_name || '');
      if (sortBy === 'recent') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      return Number(b.pending_amount || 0) - Number(a.pending_amount || 0);
    });
  }, [activePartyType, loans, searchQuery, sortBy]);

  const totals = useMemo(() => ({
    due: loans.reduce((sum, loan) => sum + Number(loan.due_amount || 0), 0),
    collected: loans.reduce((sum, loan) => sum + Number(loan.collected_amount || 0), 0),
    remaining: loans.reduce((sum, loan) => sum + Number(loan.pending_amount || 0), 0),
  }), [loans]);

  async function handleSave() {
    if (!selectedLoan || !amount || !paymentDate) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/loans/${selectedLoan.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(amount),
          payment_method: paymentMethod,
          payment_date: paymentDateIso(paymentDate),
          collector_name: user.name,
          collector_phone: user.phone || '',
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Payment failed');
      setSuccessData({ ...data, amount: parseFloat(amount), customerName: selectedLoan.customer_name });
      setSelectedLoan(data.data);
      setLoans(prev => prev.map(loan => loan.id === data.data.id ? data.data : loan).filter(loan => Number(loan.pending_amount) > 0));
      apiFetch(`/api/loans/${selectedLoan.id}/payments`)
        .then(historyRes => historyRes.json())
        .then(history => setPayments(Array.isArray(history) ? history : []))
        .catch(() => {});
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function resetPayment(keepCustomer = false) {
    setSuccessData(null);
    setAmount('');
    setPaymentDate(localDateInputValue());
    setNotes('');
    if (!keepCustomer) setSelectedLoan(null);
  }

  if (successData) {
    return (
      <div className="collector-phone-page collector-success-page">
        <div className="collector-success-check"><CheckCircle2 size={52} /></div>
        <h1>Transaction saved</h1>
        <div className="collector-success-amount">{money(successData.amount)}</div>
        <p>Add another transaction for<br /><strong>{successData.customerName}</strong>?</p>
        <div className="collector-success-actions">
          <button type="button" className="collector-outline-action" disabled title="Disbursement is not available for collectors yet">
            <Wallet size={18} /> YOU GAVE ₹
          </button>
          <button type="button" className="collector-outline-action active" onClick={() => resetPayment(true)}>
            <Banknote size={18} /> YOU GOT ₹
          </button>
        </div>
        <button className="collector-done-btn" type="button" onClick={() => resetPayment(false)}>DONE</button>
      </div>
    );
  }

  if (selectedLoan) {
    const progress = Math.min((Number(selectedLoan.collected_amount || 0) / Number(selectedLoan.due_amount || 1)) * 100, 100);
    const whatsappUrl = selectedLoan.customer_phone
      ? `https://wa.me/91${String(selectedLoan.customer_phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Hi ${selectedLoan.customer_name}, your remaining collection amount is ${money(selectedLoan.pending_amount)}.`)}`
      : '';

    return (
      <div className="collector-phone-page">
        <header className="collector-detail-header">
          <button className="collector-icon-btn" type="button" onClick={() => setSelectedLoan(null)}><ArrowLeft size={21} /></button>
          <div>
            <h1>{selectedLoan.customer_name}</h1>
            <button type="button">View settings</button>
          </div>
          {selectedLoan.customer_phone ? (
            <a className="collector-icon-btn" href={`tel:${selectedLoan.customer_phone}`}><Phone size={20} /></a>
          ) : (
            <button className="collector-icon-btn" type="button"><MoreHorizontal size={20} /></button>
          )}
        </header>

        <section className="collector-amount-card">
          <div>
            <span>You will get</span>
            <strong>{money(selectedLoan.pending_amount)}</strong>
          </div>
          <div className="collector-progress-track"><div style={{ width: `${progress}%` }} /></div>
          <div className="collector-reminder-row">
            <span>Set collection reminder</span>
            <button type="button" onClick={() => setActiveDetailTab('reminder')}>SET DATE</button>
          </div>
        </section>

        <section className="collector-payment-entry">
          <div className="collector-amount-input">
            <span>₹</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="collector-method-row">
            {['Cash', 'GPay'].map(method => (
              <button key={method} className={paymentMethod === method ? 'active' : ''} type="button" onClick={() => setPaymentMethod(method)}>
                {method === 'Cash' ? <Banknote size={17} /> : <Wallet size={17} />} {method}
              </button>
            ))}
          </div>
          <label className="collector-date-input">
            <Calendar size={17} />
            <span>Payment date</span>
            <input
              type="date"
              value={paymentDate}
              max={localDateInputValue()}
              onChange={e => setPaymentDate(e.target.value)}
            />
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} />
          <button className="collector-primary-action" type="button" disabled={loading || !amount || !paymentDate} onClick={handleSave}>
            <CheckCircle2 size={18} /> {loading ? 'Saving...' : `YOU GOT ${money(amount)}`}
          </button>
        </section>

        <div className="collector-detail-tabs">
          {[
            { id: 'report', icon: FileText, label: 'Report' },
            { id: 'reminder', icon: Calendar, label: 'Reminder' },
            { id: 'sms', icon: Send, label: 'SMS' },
          ].map(tab => {
            const TabIcon = tab.icon;
            return (
              <button key={tab.id} className={activeDetailTab === tab.id ? 'active' : ''} type="button" onClick={() => setActiveDetailTab(tab.id)}>
                <TabIcon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>

        {activeDetailTab === 'report' && (
          <section className="collector-history-list">
            {payments.length === 0 ? (
              <div className="collector-empty">No transactions recorded yet.</div>
            ) : payments.slice().reverse().map(payment => {
              const when = formatDate(payment.payment_date);
              return (
                <div key={payment.id} className="collector-history-row">
                  <div>
                    <strong>{when.date}</strong>
                    <span>{when.time || 'Payment'}</span>
                  </div>
                  <div>
                    <span className="collector-got-label">YOU GOT</span>
                    <strong>{money(payment.amount)}</strong>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {activeDetailTab === 'reminder' && (
          <section className="collector-action-panel">
            <div>
              <Clock3 size={18} />
              <span>Next due date</span>
              <strong>{selectedLoan.closing_date || 'Not set'}</strong>
            </div>
            <button type="button" onClick={() => alert('Reminder date can be set once the reminder endpoint is enabled for collectors.')}>SET DATE</button>
          </section>
        )}

        {activeDetailTab === 'sms' && (
          <section className="collector-action-panel">
            <div>
              <MessageCircle size={18} />
              <span>Send payment reminder</span>
              <strong>{selectedLoan.customer_phone || 'No phone number'}</strong>
            </div>
            {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer">REMIND</a> : <button type="button" disabled>REMIND</button>}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="collector-phone-page">
      <header className="collector-home-header">
        <div>
          <button className="collector-name-btn" type="button">
            {user.name || 'Collector'} <ChevronDown size={16} />
          </button>
          <p>DigiVasool field collections</p>
        </div>
        <button className="collector-profile-btn" type="button"><Bell size={18} /></button>
      </header>

      <div className="collector-party-tabs">
        <button className={activePartyType === 'customers' ? 'active' : ''} type="button" onClick={() => setActivePartyType('customers')}>Customers</button>
        <button className={activePartyType === 'suppliers' ? 'active' : ''} type="button" onClick={() => setActivePartyType('suppliers')}>Suppliers</button>
      </div>

      <section className="collector-summary-card">
        <div><span>You will receive</span><strong>{money(totals.due)}</strong></div>
        <div><span>Collected</span><strong>{money(totals.collected)}</strong></div>
        <div><span>Remaining</span><strong>{money(totals.remaining)}</strong></div>
        <button type="button" onClick={() => navigate('/collector/history')}>View Report</button>
      </section>

      <div className="collector-search-row">
        <label>
          <Search size={18} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search Customer" />
        </label>
        <button className={showFilters ? 'active' : ''} type="button" onClick={() => setShowFilters(v => !v)}><Filter size={19} /></button>
      </div>

      {showFilters && (
        <div className="collector-filter-row">
          {[
            { id: 'balance', icon: SlidersHorizontal, label: 'Highest' },
            { id: 'name', icon: UserRound, label: 'A-Z' },
            { id: 'recent', icon: Clock3, label: 'Recent' },
          ].map(option => {
            const OptionIcon = option.icon;
            return (
              <button key={option.id} className={sortBy === option.id ? 'active' : ''} type="button" onClick={() => setSortBy(option.id)}>
                <OptionIcon size={14} /> {option.label}
              </button>
            );
          })}
        </div>
      )}

      <section className="collector-customer-list">
        {filteredLoans.length === 0 ? (
          <div className="collector-empty">
            {activePartyType === 'suppliers' ? 'No suppliers are connected to this collector account.' : 'No customers match your search.'}
          </div>
        ) : filteredLoans.map(loan => (
          <article key={loan.id} className="collector-customer-row" onClick={() => setSelectedLoan(loan)}>
            <div className="collector-avatar">{initials(loan.customer_name)}</div>
            <div className="collector-row-main">
              <h3>{loan.customer_name}</h3>
              <span>{timeAgo(loan.created_at)}{loan.zone ? ` · ${loan.zone}` : ''}</span>
            </div>
            <div className="collector-row-side">
              <strong>{money(loan.pending_amount)}</strong>
              {loan.customer_phone ? (
                <a href={`https://wa.me/91${String(loan.customer_phone).replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>REMIND</a>
              ) : (
                <button type="button" onClick={e => e.stopPropagation()}>REMIND</button>
              )}
            </div>
          </article>
        ))}
      </section>

      <button className="collector-add-customer" type="button" onClick={() => navigate('/collector/borrowers')}>
        <Plus size={19} /> ADD CUSTOMER
      </button>

      <nav className="collector-inline-nav" aria-label="Collector navigation">
        <button className="active" type="button"><Home size={19} /><span>Customers</span></button>
        <button type="button" onClick={() => navigate('/collector/borrowers')}><Wallet size={19} /><span>Loans/Center</span></button>
        <button type="button" onClick={() => navigate('/collector/history')}><Settings size={19} /><span>More</span></button>
      </nav>
    </div>
  );
}
