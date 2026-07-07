import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';
import { API_BASE_URL } from '../../config';
import {
  LogOut, MessageCircle, CheckCircle2, Clock, AlertTriangle, RefreshCw,
  Banknote, Smartphone, Calendar, User, Phone, MapPin, Store, Shield,
  IndianRupee, X, Bell, Copy, Check,
} from 'lucide-react';

// Business payment details — update these for the live account
const BUSINESS_UPI = 'vasoolpro@okhdfcbank';
const BUSINESS_NAME = 'VasoolPro Finance';
const BUSINESS_PHONE = '919876500000'; // WhatsApp number (with country code, no +)

function maskAadhaar(a) {
  if (!a) return null;
  const digits = String(a).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function photoSrc(url) {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

// ── Payment dialog: UPI deep-link + notify collector ──
function PaymentModal({ loan, onClose }) {
  const installAmt = loan.repayment_amount || 0;
  const pending = loan.pending_amount || 0;
  const presets = [
    installAmt > 0 && { label: 'One Installment', value: installAmt },
    { label: 'Full Pending', value: pending },
  ].filter(Boolean);
  const [amount, setAmount] = useState(presets[0]?.value || pending);
  const [copied, setCopied] = useState(false);

  const upiUrl = `upi://pay?pa=${encodeURIComponent(BUSINESS_UPI)}&pn=${encodeURIComponent(BUSINESS_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Loan ' + loan.id)}`;
  const waMsg = encodeURIComponent(`Hi, I am ${loan.customer_name} (Loan ${loan.id}). I would like to pay ₹${Number(amount).toLocaleString()} towards my loan. Please guide me.`);
  const waUrl = `https://wa.me/${BUSINESS_PHONE}?text=${waMsg}`;

  const copyUpi = () => {
    navigator.clipboard?.writeText(BUSINESS_UPI).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal animate-slideUp" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Make a Payment</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>Choose how much to pay</div>
        <div className="stagger" style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {presets.map(p => (
            <button key={p.label} onClick={() => setAmount(p.value)}
              className="card-hover"
              style={{
                flex: 1, minWidth: 130, padding: '12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${amount === p.value ? 'var(--brand)' : 'var(--border)'}`,
                background: amount === p.value ? 'var(--brand-soft)' : 'var(--surface-2)', color: 'var(--text)',
              }}>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontWeight: 800, fontSize: 16, fontFamily: 'var(--mono)' }}>₹{Number(p.value).toLocaleString()}</div>
            </button>
          ))}
        </div>

        <div className="form-group">
          <label className="form-label">Custom amount (₹)</label>
          <input className="form-input" type="number" min="1" max={pending} value={amount}
            onChange={e => setAmount(Math.max(0, Number(e.target.value)))} />
        </div>

        <a href={upiUrl} className="btn btn-primary w-full" style={{ justifyContent: 'center', marginBottom: 10 }}>
          <Smartphone size={16} /> Pay ₹{Number(amount).toLocaleString()} via UPI
        </a>

        <div onClick={copyUpi} className="card-hover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>UPI ID</div>
            <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--mono)' }}>{BUSINESS_UPI}</div>
          </div>
          {copied ? <Check size={16} style={{ color: 'var(--green)' }} /> : <Copy size={16} style={{ color: 'var(--text-2)' }} />}
        </div>

        <a href={waUrl} target="_blank" rel="noreferrer" className="btn btn-secondary w-full" style={{ justifyContent: 'center' }}>
          <MessageCircle size={16} style={{ color: '#25D366' }} /> Notify I'll Pay Cash
        </a>

        <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 12 }}>
          UPI opens your payment app on mobile. Cash payments are collected by your agent.
        </p>
      </div>
    </div>
  );
}

export default function MyLoan() {
  const { user, logout } = useAuth();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payFor, setPayFor] = useState(null); // loan to pay

  useEffect(() => {
    apiFetch(`/api/loans/by-customer?name=${encodeURIComponent(user.name)}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(async data => {
        setLoans(data);
        const paymentMap = {};
        await Promise.all(data.map(async loan => {
          try {
            const r = await apiFetch(`/api/loans/${loan.id}/payments`);
            paymentMap[loan.id] = r.ok ? await r.json() : [];
          } catch { paymentMap[loan.id] = []; }
        }));
        setPayments(paymentMap);
      })
      .catch(() => setError('Could not load your loan details. Please try again.'))
      .finally(() => setLoading(false));
  }, [user.name]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>Loading your details...</p>
    </div>
  );

  if (error || loans.length === 0) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <AlertTriangle size={48} style={{ color: 'var(--warning)', marginBottom: '16px' }} />
      <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>{error || 'No loan found for your account.'}</p>
      <button onClick={logout} className="save-btn" style={{ marginTop: '24px', maxWidth: '200px' }}>Sign Out</button>
    </div>
  );

  const profile = loans[0]; // borrower info is shared across their loans

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.10), rgba(139,92,246,0.06))', borderBottom: '1px solid var(--border)', padding: '24px 20px' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--brand)', flexShrink: 0 }}>
              {photoSrc(profile.photo_url)
                ? <img src={photoSrc(profile.photo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontWeight: 900, fontSize: 20, color: 'var(--brand-light)' }}>{user.name?.charAt(0)?.toUpperCase()}</span>}
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '2px' }}>Welcome back,</p>
              <h1 style={{ fontSize: '20px', fontWeight: 800 }}>{user.name}</h1>
            </div>
          </div>
          <button onClick={logout} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '12px', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      <div className="stagger" style={{ maxWidth: '500px', margin: '0 auto', padding: '24px 20px' }}>
        {/* ── Borrower Information ── */}
        <div className="card card-hover" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <User size={16} style={{ color: 'var(--brand)' }} />
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>My Information</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { icon: <Phone size={13} />, label: 'Phone', value: profile.customer_phone },
              { icon: <Phone size={13} />, label: 'Alternate', value: profile.alternate_phone },
              { icon: <Store size={13} />, label: 'Shop', value: profile.shop_name },
              { icon: <MapPin size={13} />, label: 'Area', value: profile.zone },
              { icon: <MapPin size={13} />, label: 'Address', value: profile.customer_address, full: true },
              { icon: <Shield size={13} />, label: 'Aadhaar', value: maskAadhaar(profile.aadhaar_number) },
            ].filter(f => f.value).map(f => (
              <div key={f.label} style={{ background: 'var(--background)', padding: '10px 12px', borderRadius: 12, gridColumn: f.full ? '1 / -1' : 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{f.icon}{f.label}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{f.value}</div>
              </div>
            ))}
          </div>
          {(profile.guarantor_name || profile.guarantor_phone) && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Guarantor</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{profile.guarantor_name}</div>
              {profile.guarantor_phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{profile.guarantor_phone}</div>}
              {profile.guarantor_address && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{profile.guarantor_address}</div>}
            </div>
          )}
        </div>

        {loans.map(loan => {
          const progress = Math.min((loan.collected_amount / loan.due_amount) * 100, 100);
          const isSettled = loan.status === 'closed' || loan.pending_amount <= 0;
          const loanPayments = payments[loan.id] || [];
          const freq = loan.repayment_frequency || 'monthly';
          const installAmt = loan.repayment_amount || 0;

          const getNextDue = () => {
            if (!loan.start_date) return null;
            const now = new Date();
            const start = new Date(loan.start_date);
            const diffs = { daily: 1, weekly: 7, monthly: 30 };
            const gap = diffs[freq];
            if (!gap) return null;
            let next = new Date(start);
            while (next <= now) next.setDate(next.getDate() + gap);
            return next;
          };
          const nextDueDate = getNextDue();
          const nextDue = nextDueDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

          // ── Alert computation ──
          const closing = loan.closing_date ? new Date(loan.closing_date) : null;
          const now = new Date();
          const daysToClose = closing ? Math.ceil((closing - now) / 86400000) : null;
          const daysToNext = nextDueDate ? Math.ceil((nextDueDate - now) / 86400000) : null;
          let alert = null;
          if (isSettled) {
            alert = { type: 'success', icon: <CheckCircle2 size={18} />, msg: 'Your loan is fully paid. Thank you!' };
          } else if (closing && daysToClose < 0) {
            alert = { type: 'danger', icon: <AlertTriangle size={18} />, msg: `Overdue by ${Math.abs(daysToClose)} day(s). Please pay ₹${loan.pending_amount.toLocaleString()} now.` };
          } else if (daysToNext !== null && daysToNext <= 3) {
            alert = { type: 'warn', icon: <Bell size={18} />, msg: `Payment of ₹${installAmt > 0 ? installAmt.toLocaleString() : loan.pending_amount.toLocaleString()} due ${daysToNext <= 0 ? 'today' : `in ${daysToNext} day(s)`}.` };
          } else if (nextDue) {
            alert = { type: 'info', icon: <Calendar size={18} />, msg: `Next payment due on ${nextDue}.` };
          }
          const alertColors = {
            success: { bg: 'var(--positive-soft)', bd: 'rgba(5,150,105,0.35)', fg: 'var(--positive)' },
            danger: { bg: 'var(--red-soft)', bd: 'rgba(220,38,38,0.35)', fg: 'var(--red)' },
            warn: { bg: 'var(--amber-soft)', bd: 'rgba(217,119,6,0.35)', fg: 'var(--amber)' },
            info: { bg: 'var(--brand-soft)', bd: 'rgba(79,70,229,0.35)', fg: 'var(--brand-light)' },
          };

          return (
            <div key={loan.id}>
              {/* Alert banner */}
              {alert && (
                <div className="animate-fadeUp" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14, marginBottom: 16, background: alertColors[alert.type].bg, border: `1px solid ${alertColors[alert.type].bd}`, color: alertColors[alert.type].fg }}>
                  <span style={{ flexShrink: 0 }}>{alert.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{alert.msg}</span>
                </div>
              )}

              {/* Outstanding Balance Banner */}
              <div className="card summary-card card-hover" style={{ textAlign: 'center', padding: '28px 20px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {isSettled ? <><CheckCircle2 size={14} /> Your loan is fully paid!</> : 'Your outstanding balance'}
                </div>
                <div style={{ fontSize: '44px', fontWeight: 900, color: isSettled ? 'var(--positive)' : 'var(--warning)', lineHeight: 1.1 }}>
                  ₹{loan.pending_amount.toLocaleString()}
                </div>
                {!isSettled && (
                  <>
                    <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>
                      Due by <strong>{loan.closing_date}</strong>
                    </div>
                    <button onClick={() => setPayFor(loan)} className="btn btn-primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>
                      <IndianRupee size={16} /> Pay Now
                    </button>
                  </>
                )}
              </div>

              {/* Progress */}
              <div className="card card-hover" style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Payment Progress</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  <span>Paid: <strong style={{ color: 'var(--positive)' }}>₹{loan.collected_amount.toLocaleString()}</strong></span>
                  <span><strong style={{ color: 'var(--text)' }}>{progress.toFixed(0)}%</strong></span>
                </div>
                <div style={{ height: '10px', background: 'var(--surface-raised)', borderRadius: '5px', overflow: 'hidden', marginBottom: '10px' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: isSettled ? 'var(--positive)' : 'linear-gradient(to right, var(--brand), var(--positive))', transition: 'width 0.6s ease', borderRadius: '5px' }} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Total: ₹{loan.due_amount.toLocaleString()} (Loan ₹{loan.loan_amount.toLocaleString()} + Interest ₹{(loan.monthly_interest_amount || 0).toLocaleString()})
                </div>
              </div>

              {/* Repayment Schedule */}
              <div className="card card-hover" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <RefreshCw size={16} style={{ color: 'var(--brand)' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Repayment Schedule</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { label: 'Frequency', value: freq.charAt(0).toUpperCase() + freq.slice(1) },
                    { label: 'Per Installment', value: installAmt > 0 ? `₹${installAmt.toLocaleString()}` : 'Not set' },
                    { label: 'Loan Started', value: loan.start_date },
                    { label: 'Final Due', value: loan.closing_date },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--background)', padding: '12px', borderRadius: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{item.label}</div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                {nextDue && !isSettled && (
                  <div style={{ marginTop: '12px', background: 'var(--brand-soft)', padding: '10px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={14} style={{ color: 'var(--brand-light)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-light)' }}>
                      Next payment due: <strong>{nextDue}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Payment History */}
              {loanPayments.length > 0 && (
                <div className="card card-hover" style={{ marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Payment History</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {loanPayments.slice(0, 10).map((p, i) => {
                      const d = new Date(p.payment_date);
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '12px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--positive-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {p.payment_method === 'Cash' ? <Banknote size={16} style={{ color: 'var(--positive)' }} /> : <Smartphone size={16} style={{ color: 'var(--brand)' }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>
                              {p.collector_name ? `via ${p.collector_name}` : 'Payment'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {p.notes && ` · ${p.notes}`}
                            </div>
                          </div>
                          <div className="text-green" style={{ fontWeight: 800, fontSize: '15px' }}>+₹{p.amount.toLocaleString()}</div>
                        </div>
                      );
                    })}
                    {loanPayments.length > 10 && (
                      <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', paddingTop: '8px' }}>
                        Showing latest 10 of {loanPayments.length} payments
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* WhatsApp Reminders */}
              {loan.reminder_schedule && loan.reminder_schedule.length > 0 && (
                <div className="card card-hover" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <MessageCircle size={18} style={{ color: '#25D366' }} />
                    <h3 style={{ fontSize: '15px', fontWeight: 700 }}>WhatsApp Reminders</h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {loan.reminder_schedule.map((rm, i) => {
                      const isSent = rm.status === 'sent';
                      const date = new Date(rm.scheduled_for);
                      const isPast = date < new Date();
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '12px', background: isSent ? 'var(--positive-soft)' : isPast ? 'var(--surface-raised)' : 'var(--background)', border: `1px solid ${isSent ? 'rgba(16,185,129,0.3)' : 'var(--border)'}` }}>
                          {isSent ? <CheckCircle2 size={18} style={{ color: 'var(--positive)', flexShrink: 0 }} /> : <Clock size={18} style={{ color: isPast ? 'var(--text-muted)' : 'var(--brand)', flexShrink: 0 }} />}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>{isSent ? 'Reminder sent' : `Reminder on Day ${rm.day_offset}`}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{date.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</div>
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: isSent ? 'var(--positive)' : 'var(--surface)', color: isSent ? 'white' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {rm.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {payFor && <PaymentModal loan={payFor} onClose={() => setPayFor(null)} />}
    </div>
  );
}
