import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch, isDemoMode } from '../../utils/api';
import { ClipboardList, Banknote, Smartphone, Calendar, Pencil, Trash2, X, Check } from 'lucide-react';

function localDateInputValue(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function paymentDateIso(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

export default function CollectorHistory() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPayment, setEditingPayment] = useState(null);
  const demo = isDemoMode();

  useEffect(() => {
    apiFetch(`/api/collector/payments?collector_name=${encodeURIComponent(user.name)}`)
      .then(r => r.json())
      .then(data => setPayments(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.name]);

  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);

  function startEditing(payment) {
    setEditingPayment({
      ...payment,
      amount: String(payment.amount),
      payment_date: localDateInputValue(payment.payment_date),
    });
  }

  async function saveEdit() {
    if (!editingPayment || !editingPayment.amount || !editingPayment.payment_date) return;
    const response = await apiFetch(`/api/collector/payments/${editingPayment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        amount: Number(editingPayment.amount),
        payment_method: editingPayment.payment_method,
        payment_date: paymentDateIso(editingPayment.payment_date),
        notes: editingPayment.notes || '',
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.detail || 'Could not update payment');
      return;
    }
    setPayments(current => current.map(payment => payment.id === data.data.id ? { ...payment, ...data.data } : payment));
    setEditingPayment(null);
  }

  async function deletePayment(payment) {
    if (!window.confirm(`Delete the ₹${Number(payment.amount).toLocaleString('en-IN')} payment from ${payment.customer_name}?`)) return;
    const response = await apiFetch(`/api/collector/payments/${payment.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      alert(data.detail || 'Could not delete payment');
      return;
    }
    setPayments(current => current.filter(item => item.id !== payment.id));
  }

  if (loading) {
    return (
      <div className="screen-container pt-4" style={{ textAlign: 'center', paddingTop: '80px' }}>
        <p style={{ color: 'var(--text-muted)' }}>{t('loadingHistory')}</p>
      </div>
    );
  }

  return (
    <div className="screen-container pt-4">
      <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>{t('myCollections')}</h2>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>{t('allPaymentsRecorded')}</p>

      {editingPayment && (
        <div className="collector-edit-panel">
          <div className="collector-edit-heading">
            <strong>Edit payment</strong>
            <button type="button" title="Cancel editing" onClick={() => setEditingPayment(null)}><X size={17} /></button>
          </div>
          <div className="collector-edit-grid">
            <label>Amount<input type="number" min="1" value={editingPayment.amount} onChange={e => setEditingPayment({ ...editingPayment, amount: e.target.value })} /></label>
            <label>Date<input type="date" max={localDateInputValue()} value={editingPayment.payment_date} onChange={e => setEditingPayment({ ...editingPayment, payment_date: e.target.value })} /></label>
            <label>Method<select value={editingPayment.payment_method} onChange={e => setEditingPayment({ ...editingPayment, payment_method: e.target.value })}><option>Cash</option><option>GPay</option></select></label>
            <label>Notes<input value={editingPayment.notes || ''} onChange={e => setEditingPayment({ ...editingPayment, notes: e.target.value })} /></label>
          </div>
          <button className="collector-edit-save" type="button" onClick={saveEdit}><Check size={16} /> Save changes</button>
        </div>
      )}

      {/* Summary */}
      <div className="card summary-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>{t('totalCollected')}</div>
            <div className="text-green" style={{ fontSize: '26px', fontWeight: 900 }}>₹{totalCollected.toLocaleString()}</div>
          </div>
          <div style={{ width: '1px', background: 'var(--border-highlight)' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>{t('entriesLabel')}</div>
            <div style={{ fontSize: '26px', fontWeight: 900 }}>{payments.length}</div>
          </div>
        </div>
      </div>

      {payments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <ClipboardList size={48} style={{ opacity: 0.15, margin: '0 auto 16px', display: 'block' }} />
          <p>{t('noCollectionsYet')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {payments.map(p => {
            const date = new Date(p.payment_date);
            const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={p.id} className="card" style={{ padding: '16px', margin: 0, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: 'var(--positive-soft)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0,
                  }}>
                    {p.payment_method === 'Cash' ? <Banknote size={20} style={{ color: 'var(--positive)' }} /> : <Smartphone size={20} style={{ color: 'var(--brand)' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px' }}>{p.customer_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={12} /> {dateStr} · {timeStr}
                        </div>
                        {p.notes && (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                            "{p.notes}"
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="text-green" style={{ fontSize: '18px', fontWeight: 800 }}>₹{p.amount.toLocaleString()}</div>
                        <div style={{ fontSize: '11px', background: p.payment_method === 'Cash' ? 'var(--positive-soft)' : 'var(--brand-soft)', color: p.payment_method === 'Cash' ? 'var(--positive)' : 'var(--brand-light)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, marginTop: '4px', display: 'inline-block' }}>
                          {p.payment_method}
                        </div>
                      </div>
                    </div>
                    {demo && (
                      <div className="collector-history-actions">
                        <button type="button" title="Edit payment" onClick={() => startEditing(p)}><Pencil size={14} /> Edit</button>
                        <button type="button" title="Delete payment" onClick={() => deletePayment(p)}><Trash2 size={14} /> Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
