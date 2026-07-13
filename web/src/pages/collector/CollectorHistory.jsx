import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch } from '../../utils/api';
import { ClipboardList, Banknote, Smartphone, Calendar, User } from 'lucide-react';

export default function CollectorHistory() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/collector/payments?collector_name=${encodeURIComponent(user.name)}`)
      .then(r => r.json())
      .then(data => setPayments(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user.name]);

  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);

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
