import { useAppData } from '../../context/AppDataContext';
import { TrendingUp, AlertTriangle, Users, Wallet, Target } from 'lucide-react';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import { apiFetch } from '../../utils/api';

function AnimatedNumber({ value, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const dur = 800, steps = 40, step = value / steps;
    let cur = 0, i = 0;
    const t = setInterval(() => {
      cur = Math.min(cur + step, value);
      setDisplay(Math.round(cur));
      if (++i >= steps) clearInterval(t);
    }, dur / steps);
    return () => clearInterval(t);
  }, [value]);
  return <>{prefix}{display.toLocaleString()}{suffix}</>;
}

export default function Dashboard() {
  const { derived, state } = useAppData();
  const { todayCollected, overdueCount } = derived;
  const [apiStats, setApiStats] = useState({ active_loans: 0, total_outstanding: 0, total_collected: 0 });

  useEffect(() => {
    apiFetch('/api/loans/stats')
      .then(r => r.json())
      .then(setApiStats)
      .catch(() => {});
  }, []);

  const todayInstallments = state.installments.filter(i => {
    const today = new Date().toISOString().split('T')[0];
    return i.dueDate === today;
  });
  const todayPaid = todayInstallments.filter(i => i.status === 'paid').length;
  const todayPending = todayInstallments.filter(i => i.status !== 'paid').length;
  const overdueItems = state.installments.filter(i => i.status === 'overdue');

  const activeCount = apiStats.active_loans || derived.activeLoans.length;
  const outstanding = apiStats.total_outstanding || derived.totalOutstanding;

  return (
    <div className="animate-fadeUp">
      <div className="stat-grid">
        {[
          { label: "Today's Collection", value: todayCollected, prefix: '₹', color: 'green', icon: '💰' },
          { label: 'Active Borrowers', value: activeCount, color: 'indigo', icon: '📋' },
          { label: 'Total Outstanding', value: outstanding, prefix: '₹', color: 'amber', icon: '⏳' },
          { label: 'Total Collected', value: apiStats.total_collected || derived.totalCollected, prefix: '₹', color: 'cyan', icon: '📥' },
        ].map((s, i) => (
          <div key={s.label} className={`stat-card ${s.color} card-hover`} style={{ animationDelay: `${i * 0.08}s`, animation: 'fadeUp .4s ease both' }}>
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.color === 'green' ? 'var(--green)' : s.color === 'indigo' ? 'var(--brand-light)' : s.color === 'amber' ? 'var(--amber)' : 'var(--cyan)' }}>
              <AnimatedNumber value={s.value} prefix={s.prefix || ''} />
            </div>
            {s.label === 'Active Borrowers' && overdueCount > 0 && (
              <div className="stat-card-trend" style={{ color: 'var(--red)' }}>
                <AlertTriangle size={12} /> {overdueCount} overdue
              </div>
            )}
            <div className="stat-card-icon">{s.icon}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div className="chart-card animate-fadeUp-1">
          <div className="chart-title"><Wallet size={16} style={{ color: 'var(--green)' }} />Today's Ledger</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--mono)', marginBottom: 12 }}>
            ₹{todayCollected.toLocaleString()}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, background: 'var(--green-soft)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--green)' }}>{todayPaid}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Paid</div>
            </div>
            <div style={{ flex: 1, background: 'var(--amber-soft)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--amber)' }}>{todayPending}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Pending</div>
            </div>
          </div>
        </div>

        <div className="chart-card animate-fadeUp-2">
          <div className="chart-title"><AlertTriangle size={16} style={{ color: 'var(--red)' }} />Overdue Alerts</div>
          {overdueItems.length === 0 ? (
            <div style={{ color: 'var(--text-2)', fontSize: 13 }}>No overdue accounts ✅</div>
          ) : (
            overdueItems.slice(0, 5).map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{i.borrowerName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Due: {i.dueDate}</div>
                </div>
                <span className="badge badge-red">₹{i.amount.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>

        <div className="chart-card animate-fadeUp-3">
          <div className="chart-title"><Target size={16} style={{ color: 'var(--brand-light)' }} />Staff Performance</div>
          {state.staff.filter(s => s.role === 'collector').map(s => {
            const pct = Math.round((s.collected / s.target) * 100);
            return (
              <div key={s.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ color: pct >= 80 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>{pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)', transition: 'width 0.6s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
