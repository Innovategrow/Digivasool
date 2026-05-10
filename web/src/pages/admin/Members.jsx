import { useState, useEffect } from 'react';
import { UserPlus, Calendar, IndianRupee, ShieldCheck, Mail, Phone, MapPin, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../../config';

const FREQ_OPTIONS = [
  { value: 'daily',   label: '📅 Daily',   desc: 'Collected every day' },
  { value: 'weekly',  label: '📆 Weekly',  desc: 'Once a week' },
  { value: 'monthly', label: '🗓️ Monthly', desc: 'Once a month' },
  { value: 'custom',  label: '⚙️ Custom',  desc: 'Set your own amount' },
];

export default function Members() {
  const [loans, setLoans] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', address: '',
    amount: '', interest: '',
    startDate: new Date().toISOString().split('T')[0],
    closeDate: '',
    repaymentFreq: 'monthly',
    repaymentAmount: '',
  });

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/loans/`)
      .then(res => res.json()).then(setLoans).catch(console.error);
  }, []);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.amount || !formData.closeDate) {
      alert('Name, Phone, Amount and Due Date are required.'); return;
    }
    setLoading(true);

    const payload = {
      customer_id: 'CUST-' + Math.floor(Math.random() * 1000000),
      customer_name: formData.name,
      customer_email: formData.email,
      customer_phone: formData.phone,
      customer_address: formData.address,
      loan_amount: parseFloat(formData.amount),
      interest_document: parseFloat(formData.interest) || 0,
      start_date: formData.startDate,
      closing_date: formData.closeDate,
      repayment_frequency: formData.repaymentFreq,
      repayment_amount: parseFloat(formData.repaymentAmount) || 0,
    };

    fetch(`${API_BASE_URL}/api/loans/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(res => res.json())
      .then(data => {
        setLoans([data, ...loans]);
        setShowModal(false);
        setFormData({ name: '', email: '', phone: '', address: '', amount: '', interest: '', startDate: new Date().toISOString().split('T')[0], closeDate: '', repaymentFreq: 'monthly', repaymentAmount: '' });
      })
      .finally(() => setLoading(false));
  };

  const field = (key) => ({ value: formData[key], onChange: e => setFormData({ ...formData, [key]: e.target.value }) });

  const freqColor = { daily: 'var(--green)', weekly: 'var(--brand)', monthly: 'var(--amber)', custom: 'var(--text-2)' };

  return (
    <div className="screen-container pt-4">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Borrowers</h2>
        <button className="save-btn" style={{ width: 'auto', padding: '10px 16px', borderRadius: '12px' }} onClick={() => setShowModal(true)}>
          <UserPlus size={18} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Add Borrower
        </button>
      </div>

      {loans.map(loan => {
        const progress = loan.due_amount > 0 ? Math.min((loan.collected_amount / loan.due_amount) * 100, 100) : 0;
        const freq = loan.repayment_frequency || 'monthly';
        return (
          <div key={loan.id} className="card" style={{ padding: '16px', display: 'flex', gap: '16px', marginBottom: '12px' }}>
            <div className="party-avatar">{loan.customer_name.charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{loan.customer_name}</h3>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', padding: '2px 7px', borderRadius: '6px', background: freq === 'daily' ? 'var(--green-soft)' : 'var(--brand-soft)', color: freqColor[freq] || 'var(--brand-light)' }}>
                    {freq}
                  </span>
                  <span className={loan.status === 'active' ? 'text-green' : 'text-muted'} style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{loan.status}</span>
                </div>
              </div>
              {loan.customer_phone && <div style={{ fontSize: '12px', color: 'var(--text-2)' }}>📱 {loan.customer_phone}</div>}
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
            </div>
          </div>
        );
      })}

      {loans.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-2)', marginTop: '60px' }}>
          <ShieldCheck size={48} style={{ opacity: 0.15, marginBottom: '16px' }} />
          <p>No borrowers yet. Click "Add Borrower" to begin.</p>
        </div>
      )}

      {/* Add Borrower Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', marginBottom: '16px', animation: 'slideUp 0.3s ease', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>New Loan Disbursal</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>* = required</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleCreate}>
              {/* Personal Details */}
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Personal Details</div>

              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <div style={{ position: 'relative' }}>
                  <UserPlus size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                  <input required type="text" className="form-input" style={{ paddingLeft: '40px' }} placeholder="e.g. Ramesh Kumar" {...field('name')} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                    <input type="email" className="form-input" style={{ paddingLeft: '40px' }} placeholder="email@gmail.com" {...field('email')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile *</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                    <input required type="tel" className="form-input" style={{ paddingLeft: '40px' }} placeholder="+91 9876543210" {...field('phone')} />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Full Address</label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-2)' }} />
                  <textarea rows={2} className="form-input" style={{ paddingLeft: '40px', resize: 'none' }} placeholder="House no., Street, City, State" {...field('address')} />
                </div>
              </div>

              {/* Loan Details */}
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '1px', margin: '16px 0 12px' }}>Loan Details</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Loan Amount (₹) *</label>
                  <div style={{ position: 'relative' }}>
                    <IndianRupee size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                    <input required min="1" step="0.01" type="number" className="form-input" style={{ paddingLeft: '40px' }} placeholder="0.00" {...field('amount')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Interest / Doc (₹)</label>
                  <input min="0" step="0.01" type="number" className="form-input" placeholder="0.00" {...field('interest')} />
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

              {/* Repayment Frequency */}
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '1px', margin: '16px 0 12px' }}>Repayment Schedule</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                {FREQ_OPTIONS.map(opt => (
                  <button
                    key={opt.value} type="button"
                    onClick={() => setFormData(f => ({ ...f, repaymentFreq: opt.value }))}
                    style={{
                      padding: '12px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                      border: `2px solid ${formData.repaymentFreq === opt.value ? 'var(--brand)' : 'var(--border)'}`,
                      background: formData.repaymentFreq === opt.value ? 'var(--brand-soft)' : 'var(--bg)',
                      color: 'var(--text)', transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '2px' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Amount per installment (₹)</label>
                <div style={{ position: 'relative' }}>
                  <IndianRupee size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                  <input min="0" step="0.01" type="number" className="form-input" style={{ paddingLeft: '40px' }} placeholder="e.g. 500 per day" {...field('repaymentAmount')} />
                </div>
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

      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } } textarea.form-input { font-family: var(--font-family); }`}</style>
    </div>
  );
}
