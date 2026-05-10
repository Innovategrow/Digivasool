import { useAppData } from '../../context/AppDataContext';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Users, CreditCard, Wallet, Target } from 'lucide-react';
import { useState, useEffect } from 'react';

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

const CUSTOM_TOOLTIP = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ color: 'var(--text-2)', fontSize: 11, marginBottom: 4 }}>{payload[0]?.payload?.date}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 700 }}>₹{p.value?.toLocaleString()}</div>
      ))}
    </div>
  );
};

const SCHEME_COLORS = { daily: '#6366f1', weekly: '#10b981', monthly: '#f59e0b', enterprise: '#ec4899', interest_only: '#06b6d4' };

export default function Dashboard() {
  const { derived, state } = useAppData();
  const { activeLoans, totalOutstanding, todayCollected, netProfit, overdueCount } = derived;

  const schemeData = Object.entries(
    state.loans.filter(l => l.status === 'active').reduce((acc, l) => {
      acc[l.type] = (acc[l.type] || 0) + l.principal;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const todayInstallments = state.installments.filter(i => {
    const today = new Date().toISOString().split('T')[0];
    return i.dueDate === today;
  });
  const todayPaid = todayInstallments.filter(i => i.status === 'paid').length;
  const todayPending = todayInstallments.filter(i => i.status !== 'paid').length;
  const overdueItems = state.installments.filter(i => i.status === 'overdue');

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      {/* Stat Cards */}
      <div className="stat-grid animate-fadeUp">
        {[
          { label: "Today's Collection", value: todayCollected, prefix: '₹', color: 'green', icon: '💰', trend: '+12%' },
          { label: 'Active Loans', value: activeLoans.length, color: 'indigo', icon: '📋', trend: `${overdueCount} overdue` },
          { label: 'Total Outstanding', value: totalOutstanding, prefix: '₹', color: 'amber', icon: '⏳', trend: 'To recover' },
          { label: 'Net Profit (MTD)', value: Math.max(0, netProfit), prefix: '₹', color: 'pink', icon: '📈', trend: '+8.2%' },
        ].map((s, i) => (
          <div key={s.label} className={`stat-card ${s.color}`} style={{ animationDelay: `${i * 0.08}s`, animation: 'fadeUp .4s ease both' }}>
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.color === 'green' ? 'var(--green)' : s.color === 'indigo' ? 'var(--brand-light)' : s.color === 'amber' ? 'var(--amber)' : 'var(--pink)' }}>
              <AnimatedNumber value={s.value} prefix={s.prefix || ''} />
            </div>
            <div className="stat-card-trend" style={{ color: 'var(--text-2)' }}>
              <TrendingUp size={12} /> {s.trend}
            </div>
            <div className="stat-card-icon">{s.icon}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="chart-grid animate-fadeUp-1">
        {/* Collection Trend */}
        <div className="chart-card">
          <div className="chart-title">
            <TrendingUp size={16} style={{ color: 'var(--brand-light)' }} />
            Collections — Last 30 Days
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-2)' }}>vs ₹20k target</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={state.collectionHistory.slice(-14)}>
              <defs>
                <linearGradient id="colGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="tgtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CUSTOM_TOOLTIP />} />
              <Area type="monotone" dataKey="target" stroke="#10b981" strokeWidth={1} strokeDasharray="4 4" fill="url(#tgtGrad)" />
              <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2} fill="url(#colGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Scheme Breakdown Pie */}
        <div className="chart-card">
          <div className="chart-title">
            <CreditCard size={16} style={{ color: 'var(--amber)' }} />
            Portfolio by Scheme
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={schemeData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                {schemeData.map((entry, i) => (
                  <Cell key={i} fill={SCHEME_COLORS[entry.name] || '#6366f1'} />
                ))}
              </Pie>
              <Tooltip formatter={v => `₹${v.toLocaleString()}`} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {schemeData.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: SCHEME_COLORS[s.name] }} />
                <span style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>{s.name.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Today's Ledger Summary */}
        <div className="chart-card">
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

        {/* Overdue Alerts */}
        <div className="chart-card">
          <div className="chart-title"><AlertTriangle size={16} style={{ color: 'var(--red)' }} />Overdue Alerts</div>
          {overdueItems.length === 0 ? (
            <div style={{ color: 'var(--text-2)', fontSize: 13 }}>No overdue accounts ✅</div>
          ) : (
            overdueItems.map(i => (
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

        {/* Staff Performance */}
        <div className="chart-card">
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
                  <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
