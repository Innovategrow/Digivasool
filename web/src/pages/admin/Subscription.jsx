import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BadgeCheck, CalendarClock, Lock, Receipt, Infinity as InfinityIcon, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import { apiFetch, readError } from '../../utils/api';
import { downloadInvoice } from '../../utils/invoicePdf';

const inr = (paise, cur = 'INR') => `${cur === 'INR' ? '₹' : cur + ' '}${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };

const STATE_LABEL = {
  exempt: ['Lifetime Free Access', 'green'], grandfathered: ['Active', 'green'], trial: ['Free trial', 'amber'],
  trial_expired: ['Trial ended', 'red'], active: ['Active', 'green'], cancelled: ['Renewal off', 'amber'], expired: ['Expired', 'red'],
};
const PAY_BADGE = { paid: ['Paid', 'green'], created: ['Pending', 'amber'], failed: ['Failed', 'red'] };

function loadCheckout() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window. Check your internet connection.'));
    document.body.appendChild(s);
  });
}

// Owner-only. Prices, dates and status all come from the server; the browser never decides access
// and a "payment success" in the browser is only a hint - the server verifies it with Razorpay.
export default function Subscription() {
  const { user } = useAuth();
  const { sub, refresh } = useSubscription();
  const { showToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [p, h, i] = await Promise.all(['plans', 'payment-history', 'invoices'].map(x => apiFetch(`/api/subscriptions/${x}`)));
      return { plans: p.ok ? await p.json() : null, history: h.ok ? await h.json() : null, invoices: i.ok ? await i.json() : null };
    } catch { return {}; }   // offline: show what we have
  }, []);
  const loadAll = useCallback(async () => {
    const d = await fetchAll();
    if (d.plans) setPlans(d.plans);
    if (d.history) setHistory(d.history);
    if (d.invoices) setInvoices(d.invoices);
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(d => {
      if (cancelled) return;
      if (d.plans) setPlans(d.plans);
      if (d.history) setHistory(d.history);
      if (d.invoices) setInvoices(d.invoices);
    });
    refresh();
    return () => { cancelled = true; };
  }, [fetchAll, refresh]);

  if (user.member_role !== 'OWNER') return <Navigate to="/" replace />;
  if (!sub) return <div className="card">Loading…</div>;

  const [label, tone] = STATE_LABEL[sub.state] || ['—', 'gray'];
  const isExempt = sub.state === 'exempt';
  const needsPlan = sub.read_only || sub.state === 'trial';

  async function afterPayment() {
    for (let i = 0; i < 4; i += 1) {            // the webhook may land a moment after the browser callback
      const s = await refresh();
      if (s && s.state === 'active') break;
      await new Promise(r => setTimeout(r, 2500));
    }
    loadAll();
  }

  async function pay(planType) {
    setBusy(planType);
    try {
      const res = await apiFetch(sub.state === 'active' || sub.state === 'cancelled' ? '/api/subscriptions/renew' : '/api/subscriptions/create-order',
        { method: 'POST', body: JSON.stringify({ plan_type: planType }) });
      if (!res.ok) throw new Error(await readError(res));
      const order = await res.json();
      await loadCheckout();
      const rzp = new window.Razorpay({
        key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency,
        name: 'DigiVasool', description: `${order.plan.name} subscription`, prefill: { contact: user.phone },
        theme: { color: '#4f46e5' },
        handler: async (r) => {
          try {
            const v = await apiFetch('/api/subscriptions/verify-payment', { method: 'POST', body: JSON.stringify(r) });
            if (!v.ok) throw new Error(await readError(v));
            showToast('Payment received. Your subscription is active.');
          } catch (err) { showToast(err.message, 'error'); }
          await afterPayment();
          setBusy('');
        },
        modal: { ondismiss: () => setBusy('') },
      });
      rzp.on('payment.failed', () => { showToast('Payment failed. You have not been charged for this plan. Please try again.', 'error'); setBusy(''); });
      rzp.open();
    } catch (err) { showToast(err.message, 'error'); setBusy(''); }
  }

  async function cancel() {
    setBusy('cancel');
    try {
      const res = await apiFetch('/api/subscriptions/cancel', { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res));
      showToast('Renewal turned off. You keep access until the end date.');
      await refresh(); setConfirmCancel(false);
    } catch (err) { showToast(err.message, 'error'); }
    setBusy('');
  }

  const invoiceFor = (p) => invoices.find(i => i.gateway_order_id === p.gateway_order_id);

  return (
    <div className="sub-page">
      {sub.read_only && (
        <div className="card sub-expired">
          <Lock size={20} />
          <div>
            <div className="sub-expired-title">Your DigiVasool subscription has expired.</div>
            <div className="sub-muted">Your borrowers, loans and reports are still here to view. Renew to add or change records again.</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="sub-row"><span className="sub-muted">Organisation</span><strong>{sub.organization_name}</strong></div>
        <div className="sub-row"><span className="sub-muted">Status</span><span className={`badge badge-${tone}`}>{label}</span></div>
        {isExempt ? (
          <div className="sub-free"><InfinityIcon size={22} /><div><strong>Lifetime Free Access</strong><div className="sub-muted">No payment is needed for this organisation.</div></div></div>
        ) : (
          <>
            <div className="sub-row"><span className="sub-muted">Current plan</span><strong>{sub.plan_name || '—'}</strong></div>
            {sub.state === 'trial' || sub.state === 'trial_expired' ? (
              <>
                <div className="sub-row"><span className="sub-muted">Trial started</span><span>{day(sub.trial_start)}</span></div>
                <div className="sub-row"><span className="sub-muted">Trial ends</span><span>{day(sub.trial_end)}</span></div>
                {sub.state === 'trial' && <div className="sub-row"><span className="sub-muted">Days left</span><strong>{sub.days_remaining}</strong></div>}
              </>
            ) : (
              <div className="sub-row"><span className="sub-muted">{sub.state === 'expired' ? 'Expired on' : sub.state === 'cancelled' ? 'Access until' : 'Renews / ends'}</span><span>{day(sub.current_period_end)}</span></div>
            )}
          </>
        )}
      </div>

      {!isExempt && (
        <>
          <div className="sub-section-title"><CalendarClock size={16} /> {needsPlan ? 'Choose a plan' : 'Renew early'}</div>
          {!sub.payments_enabled && <div className="card sub-muted">Online payments are not switched on yet. Please contact support.</div>}
          <div className="sub-plans">
            {plans.map(p => (
              <div key={p.id} className="card sub-plan">
                <div className="sub-plan-name">{p.name}</div>
                <div className="sub-plan-price">{inr(p.price, p.currency)}<span className="sub-muted"> / {p.billing_interval}</span></div>
                <div className="sub-muted">Full access to every feature</div>
                <button type="button" className="btn btn-primary" disabled={!sub.payments_enabled || Boolean(busy)} onClick={() => pay(p.plan_type)}>
                  {busy === p.plan_type ? 'Opening payment…' : sub.state === 'active' || sub.state === 'cancelled' ? 'Renew' : sub.read_only ? 'Renew subscription' : 'Upgrade'}
                </button>
              </div>
            ))}
          </div>
          <div className="sub-muted sub-note">Pay with UPI, card or net banking. Payments are processed by Razorpay and checked by our server before your plan changes.</div>
          {sub.state === 'active' && (
            <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setConfirmCancel(true)}>Turn off renewal</button>
          )}
        </>
      )}

      {!isExempt && (
        <>
          <div className="sub-section-title"><Receipt size={16} /> Payment history</div>
          {history.length === 0 && <div className="card sub-muted">No payments yet.</div>}
          {history.map(p => {
            const [pl, pt] = PAY_BADGE[p.status] || [p.status, 'gray'];
            const inv = invoiceFor(p);
            return (
              <div key={p.id} className="card sub-pay">
                <div className="sub-pay-main">
                  <strong>{p.plan_name}</strong>
                  <span className={`badge badge-${pt}`}>{pl}</span>
                </div>
                <div className="sub-row"><span className="sub-muted">{day(p.paid_at || p.created_at)} · {(p.payment_method || '').toUpperCase() || 'Razorpay'}</span><strong>{inr(p.amount, p.currency)}</strong></div>
                {p.status === 'paid' && <div className="sub-muted"><BadgeCheck size={13} /> Valid {day(p.period_start)} – {day(p.period_end)} · {p.invoice_number}</div>}
                {inv && <button type="button" className="btn btn-sm btn-secondary" onClick={() => downloadInvoice(inv)}><Download size={14} /> Invoice</button>}
              </div>
            );
          })}
        </>
      )}

      <ConfirmDialog open={confirmCancel} tone="primary" title="Turn off renewal?" confirmLabel="Turn off" busyLabel="Working…" busy={busy === 'cancel'}
        onCancel={() => setConfirmCancel(false)} onConfirm={cancel}>
        <p>You keep full access until {day(sub.current_period_end)}. After that your records stay viewable, but you can't add or change anything until you renew.</p>
      </ConfirmDialog>
    </div>
  );
}
