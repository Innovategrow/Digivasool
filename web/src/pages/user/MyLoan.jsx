import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { LogOut, MessageCircle, CheckCircle2, Clock, AlertTriangle, RefreshCw, Banknote, Smartphone, Calendar } from 'lucide-react';

export default function MyLoan() {
  const { user, logout } = useAuth();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState({}); // keyed by loan_id
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/loans/by-customer?name=${encodeURIComponent(user.name)}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(async data => {
        setLoans(data);
        // Load payment history for each loan
        const paymentMap = {};
        await Promise.all(data.map(async loan => {
          try {
            const r = await fetch(`${API_BASE_URL}/api/loans/${loan.id}/payments`);
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(236,72,153,0.08))', borderBottom: '1px solid var(--border)', padding: '24px 20px' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '4px' }}>Welcome back,</p>
            <h1 style={{ fontSize: '22px', fontWeight: 800 }}>{user.name}</h1>
          </div>
          <button onClick={logout} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '12px', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '24px 20px' }}>
        {loans.map(loan => {
          const progress = Math.min((loan.collected_amount / loan.due_amount) * 100, 100);
          const isSettled = loan.status === 'closed' || loan.pending_amount <= 0;
          const loanPayments = payments[loan.id] || [];
          const freq = loan.repayment_frequency || 'monthly';
          const installAmt = loan.repayment_amount || 0;

          // Compute next due date based on frequency
          const getNextDue = () => {
            if (!loan.start_date) return null;
            const now = new Date();
            const start = new Date(loan.start_date);
            const diffs = { daily: 1, weekly: 7, monthly: 30 };
            const gap = diffs[freq];
            if (!gap) return null;
            let next = new Date(start);
            while (next <= now) next.setDate(next.getDate() + gap);
            return next.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          };
          const nextDue = getNextDue();

          const upcoming = (loan.reminder_schedule || [])
            .filter(r => r.status === 'scheduled')
            .sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for))[0];

          return (
            <div key={loan.id}>
              {/* Outstanding Balance Banner */}
              <div className="card summary-card" style={{ textAlign: 'center', padding: '28px 20px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {isSettled ? '🎉 Your loan is fully paid!' : 'Your outstanding balance'}
                </div>
                <div style={{ fontSize: '44px', fontWeight: 900, color: isSettled ? 'var(--positive)' : 'var(--warning)', lineHeight: 1.1 }}>
                  ₹{loan.pending_amount.toLocaleString()}
                </div>
                {!isSettled && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>
                    Due by <strong>{loan.closing_date}</strong>
                  </div>
                )}
              </div>

              {/* Progress */}
              <div className="card" style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Payment Progress</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  <span>Paid: <strong style={{ color: 'var(--positive)' }}>₹{loan.collected_amount.toLocaleString()}</strong></span>
                  <span><strong style={{ color: 'var(--text)' }}>{progress.toFixed(0)}%</strong></span>
                </div>
                <div style={{ height: '10px', background: 'var(--surface-raised)', borderRadius: '5px', overflow: 'hidden', marginBottom: '10px' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: isSettled ? 'var(--positive)' : 'linear-gradient(to right, var(--brand), var(--positive))', transition: 'width 0.6s ease', borderRadius: '5px' }} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Total: ₹{loan.due_amount.toLocaleString()} (Loan ₹{loan.loan_amount.toLocaleString()} + Interest ₹{loan.interest_document.toLocaleString()})
                </div>
              </div>

              {/* Repayment Schedule */}
              <div className="card" style={{ marginBottom: '16px' }}>
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
                <div className="card" style={{ marginBottom: '16px' }}>
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
                <div className="card" style={{ marginBottom: '20px' }}>
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
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>{isSent ? 'Reminder sent ✅' : `Reminder on Day ${rm.day_offset}`}</div>
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
    </div>
  );
}
