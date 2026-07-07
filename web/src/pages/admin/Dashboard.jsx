import { useAppData } from '../../context/AppDataContext';
import { TrendingUp, AlertTriangle, Wallet, Target, ArrowRight, CheckCircle2, Clock, Activity, IndianRupee, ClipboardList, Hourglass, Inbox, UserPlus, Banknote, BarChart3 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

// Animated circular progress ring for recovery rate
function RecoveryRing({ percent }) {
  const size = 132, stroke = 12, r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circ);
  useEffect(() => {
    const t = setTimeout(() => setOffset(circ - (Math.min(percent, 100) / 100) * circ), 120);
    return () => clearTimeout(t);
  }, [percent, circ]);
  const color = percent >= 75 ? 'var(--green)' : percent >= 50 ? 'var(--amber)' : 'var(--red)';
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} className="metric-ring">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: 'var(--mono)' }}>{percent}%</div>
        <div style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1 }}>Recovered</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { derived, state } = useAppData();
  const navigate = useNavigate();
  const { todayCollected, overdueCount } = derived;
  const [apiStats, setApiStats] = useState(null);

  useEffect(() => {
    apiFetch('/api/loans/stats')
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setApiStats(d))
      .catch(() => {});
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const todayInstallments = state.installments.filter(i => i.dueDate === today);
  const todayPaid = todayInstallments.filter(i => i.status === 'paid').length;
  const todayPending = todayInstallments.filter(i => i.status !== 'paid').length;
  const dueToday = todayInstallments.filter(i => i.status !== 'paid');
  const overdueItems = state.installments.filter(i => i.status === 'overdue');

  const activeCount = apiStats?.active_loans || derived.activeLoans.length;
  const outstanding = apiStats?.total_outstanding || derived.totalOutstanding;
  const totalCollected = apiStats?.total_collected || derived.totalCollected;
  const recoveryRate = apiStats?.recovery_rate ?? Math.round(
    (derived.totalCollected / Math.max(derived.totalCollected + derived.totalOutstanding, 1)) * 100
  );
  const expectedToday = todayInstallments.reduce((s, i) => s + i.amount, 0);
  const todayProgress = expectedToday > 0 ? Math.round((todayCollected / expectedToday) * 100) : 0;

  return (
    <div className="animate-fadeUp">
      {/* Stat cards */}
      <div className="stat-grid">
        {[
          { label: "Today's Collection", value: todayCollected, prefix: '₹', color: 'green', icon: IndianRupee },
          { label: 'Active Borrowers', value: activeCount, color: 'indigo', icon: ClipboardList },
          { label: 'Total Outstanding', value: outstanding, prefix: '₹', color: 'amber', icon: Hourglass },
          { label: 'Total Collected', value: totalCollected, prefix: '₹', color: 'cyan', icon: Inbox },
        ].map((s, i) => (
          <div key={s.label} className={`stat-card ${s.color} card-hover`} style={{ animationDelay: `${i * 0.08}s`, animation: 'popIn .45s ease both' }}>
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.color === 'green' ? 'var(--green)' : s.color === 'indigo' ? 'var(--brand-light)' : s.color === 'amber' ? 'var(--amber)' : 'var(--cyan)' }}>
              <AnimatedNumber value={s.value} prefix={s.prefix || ''} />
            </div>
            {s.label === 'Active Borrowers' && overdueCount > 0 && (
              <div className="stat-card-trend" style={{ color: 'var(--red)' }}>
                <AlertTriangle size={12} /> {overdueCount} overdue
              </div>
            )}
            <div className="stat-card-icon"><s.icon size={36} /></div>
          </div>
        ))}
      </div>

      {/* Recovery + Today progress + Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="chart-card card-hover animate-fadeUp-1" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <RecoveryRing percent={recoveryRate} />
          <div>
            <div className="chart-title" style={{ marginBottom: 8 }}><Activity size={16} style={{ color: 'var(--brand-light)' }} />Portfolio Recovery</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
              Collected <strong style={{ color: 'var(--green)' }}>₹{totalCollected.toLocaleString()}</strong><br />
              Outstanding <strong style={{ color: 'var(--amber)' }}>₹{outstanding.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        <div className="chart-card card-hover animate-fadeUp-2">
          <div className="chart-title"><Wallet size={16} style={{ color: 'var(--green)' }} />Today's Ledger</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--mono)', marginBottom: 6 }}>
            ₹{todayCollected.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 8 }}>of ₹{expectedToday.toLocaleString()} expected today</div>
          <div className="progress-bar" style={{ marginBottom: 12 }}>
            <div className="progress-fill" style={{ width: `${Math.min(todayProgress, 100)}%`, background: 'var(--green)' }} />
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

        <div className="chart-card card-hover animate-fadeUp-3">
          <div className="chart-title"><Target size={16} style={{ color: 'var(--brand-light)' }} />Quick Actions</div>
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-primary w-full" onClick={() => navigate('/borrowers')}>
              <UserPlus size={16} /> New Borrower + Loan
            </button>
            <button className="btn btn-secondary w-full" onClick={() => navigate('/collection')}>
              <Banknote size={16} /> Record Collection
            </button>
            <button className="btn btn-secondary w-full" onClick={() => navigate('/reports')}>
              <BarChart3 size={16} /> View Reports
            </button>
          </div>
        </div>
      </div>

      {/* Due Today + Overdue + Staff */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <div className="chart-card card-hover animate-fadeUp-1">
          <div className="chart-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={16} style={{ color: 'var(--amber)' }} />Due Today</span>
            {dueToday.length > 0 && <span className="badge badge-amber">{dueToday.length}</span>}
          </div>
          {dueToday.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontSize: 13 }}>
              <CheckCircle2 size={16} /> All today's dues collected!
            </div>
          ) : (
            <div className="stagger">
              {dueToday.slice(0, 5).map(i => (
                <div key={i.id} onClick={() => navigate('/collection')} className="card-hover"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', marginBottom: 8, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{i.borrowerName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{i.phone}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--amber)' }}>₹{i.amount.toLocaleString()}</span>
                    <ArrowRight size={14} style={{ color: 'var(--text-3)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="chart-card card-hover animate-fadeUp-2">
          <div className="chart-title"><AlertTriangle size={16} style={{ color: 'var(--red)' }} />Overdue Alerts</div>
          {overdueItems.length === 0 ? (
            <div style={{ color: 'var(--text-2)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} style={{ color: 'var(--green)' }} /> No overdue accounts</div>
          ) : (
            <div className="stagger">
              {overdueItems.slice(0, 5).map(i => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{i.borrowerName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Due: {i.dueDate}</div>
                  </div>
                  <span className="badge badge-red">₹{i.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="chart-card card-hover animate-fadeUp-3">
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
                  <div className="progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
