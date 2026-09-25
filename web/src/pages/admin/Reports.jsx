import { useEffect, useState } from 'react';
import { useAppData, ZONES } from '../../context/AppDataContext';
import { useLanguage } from '../../context/LanguageContext';
import { Download, FileText, PieChart, Inbox, ClipboardList, AlertCircle, CheckCircle2, BarChart3, TrendingUp, Wallet, Layers, MapPin, Target, Calendar, CalendarDays } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const CHART_COLORS = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#0891b2', '#8b5cf6', '#db2777'];

export default function Reports() {
  const { state, derived, actions } = useAppData();
  useEffect(() => { actions.refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { t } = useLanguage();
  const [reportType, setReportType] = useState('analytics');
  const [toast, setToast] = useState('');

  const REPORT_TYPES = [
    { id: 'analytics',   label: 'Analytics',           icon: BarChart3,     desc: 'Visual overview of all data' },
    { id: 'pl',          label: t('reportPL'),         icon: PieChart,      desc: t('reportPLDesc') },
    { id: 'collection',  label: t('reportCollection'), icon: Inbox,         desc: t('reportCollectionDesc') },
    { id: 'portfolio',   label: t('reportPortfolio'),  icon: ClipboardList, desc: t('reportPortfolioDesc') },
    { id: 'overdue',     label: t('reportOverdue'),    icon: AlertCircle,   desc: t('reportOverdueDesc') },
    { id: 'weekly',      label: 'Weekly Report',       icon: CalendarDays,  desc: 'Week-wise collection & expense trend' },
    { id: 'monthly',     label: 'Monthly Report',      icon: Calendar,      desc: 'Month-wise collection & expense trend' },
  ];

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  const handleExport = (type) => showToast(`${type} export ready!`);

  const { totalCollected, totalExpenses, totalOutstanding, totalCapital } = derived;

  const loanByStatus = [
    { id: 'active', name: t('statusActive'),    count: state.loans.filter(l => l.status === 'active').length,   amount: state.loans.filter(l => l.status === 'active').reduce((s, l) => s + l.principal, 0) },
    { id: 'closed', name: t('statusClosed'),    count: state.loans.filter(l => l.status === 'closed').length,    amount: state.loans.filter(l => l.status === 'closed').reduce((s, l) => s + l.principal, 0) },
    { id: 'defaulted', name: t('statusDefaulted'), count: state.loans.filter(l => l.status === 'defaulted').length, amount: state.loans.filter(l => l.status === 'defaulted').reduce((s, l) => s + l.principal, 0) },
  ];

  const overdueItems = state.installments.filter(i => i.status === 'overdue');
  const collectionData = state.collectionHistory.slice(-14);

  // ── Analytics aggregations (visualize every entity in AppDataContext) ─────
  const installmentStatusData = ['paid', 'partial', 'unpaid', 'overdue'].map(s => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: state.installments.filter(i => i.status === s).length,
  })).filter(d => d.value > 0);

  const expenseByCategory = Object.values(
    state.expenses.reduce((acc, e) => {
      acc[e.category] = acc[e.category] || { name: e.category, value: 0 };
      acc[e.category].value += e.amount;
      return acc;
    }, {})
  );

  const loanTypeData = Object.values(
    state.loans.reduce((acc, l) => {
      acc[l.type] = acc[l.type] || { name: l.type.replace('_', ' '), count: 0, principal: 0 };
      acc[l.type].count += 1;
      acc[l.type].principal += l.principal;
      return acc;
    }, {})
  );

  const zoneData = ZONES
    .map(z => ({ name: z, count: state.borrowers.filter(b => b.zone === z).length }))
    .filter(z => z.count > 0);

  const collectorPerformanceData = state.staff
    .filter(s => s.role === 'collector')
    .map(s => ({ name: s.name, target: s.target, collected: s.collected }));

  // ── Monthly aggregation (collection, target, expenses, capital, disbursal) ─
  const monthKey = (dateStr) => dateStr.slice(0, 7);
  const monthLabel = (key) => new Date(`${key}-01`).toLocaleDateString('en', { month: 'short', year: 'numeric' });
  const monthlyMap = {};
  const ensureMonth = (key) => (monthlyMap[key] ||= { key, collected: 0, target: 0, expenses: 0, capital: 0, newLoans: 0, disbursed: 0 });
  state.collectionHistory.forEach(c => {
    const row = ensureMonth(monthKey(c.date));
    row.collected += c.amount;
    row.target += c.target;
  });
  state.expenses.forEach(e => { ensureMonth(monthKey(e.date)).expenses += e.amount; });
  state.capital.forEach(c => { ensureMonth(monthKey(c.date)).capital += c.amount; });
  state.loans.forEach(l => {
    const row = ensureMonth(monthKey(l.startDate));
    row.newLoans += 1;
    row.disbursed += l.principal;
  });
  const monthlyData = Object.values(monthlyMap)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(row => ({ ...row, label: monthLabel(row.key), net: row.collected - row.expenses }));
  const monthlyTotals = monthlyData.reduce((acc, r) => ({
    collected: acc.collected + r.collected,
    expenses: acc.expenses + r.expenses,
    disbursed: acc.disbursed + r.disbursed,
    newLoans: acc.newLoans + r.newLoans,
  }), { collected: 0, expenses: 0, disbursed: 0, newLoans: 0 });

  // ── Weekly aggregation (collection, target, expenses, disbursal) ──────────
  const weekStart = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`);
    const day = d.getDay();
    d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day));
    return d;
  };
  const weekKey = (dateStr) => weekStart(dateStr).toISOString().slice(0, 10);
  const weekLabel = (key) => {
    const start = new Date(`${key}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en', { day: '2-digit', month: 'short' });
    return `${fmt(start)} – ${fmt(end)}`;
  };
  const weeklyMap = {};
  const ensureWeek = (key) => (weeklyMap[key] ||= { key, collected: 0, target: 0, expenses: 0, newLoans: 0, disbursed: 0 });
  state.collectionHistory.forEach(c => {
    const row = ensureWeek(weekKey(c.date));
    row.collected += c.amount;
    row.target += c.target;
  });
  state.expenses.forEach(e => { ensureWeek(weekKey(e.date)).expenses += e.amount; });
  state.loans.forEach(l => {
    const row = ensureWeek(weekKey(l.startDate));
    row.newLoans += 1;
    row.disbursed += l.principal;
  });
  const weeklyData = Object.values(weeklyMap)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(row => ({ ...row, label: weekLabel(row.key), net: row.collected - row.expenses }));
  const weeklyTotals = weeklyData.reduce((acc, r) => ({
    collected: acc.collected + r.collected,
    expenses: acc.expenses + r.expenses,
    disbursed: acc.disbursed + r.disbursed,
    newLoans: acc.newLoans + r.newLoans,
  }), { collected: 0, expenses: 0, disbursed: 0, newLoans: 0 });

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      {toast && <div className="toast" style={{ borderLeft: '3px solid var(--green)' }}><CheckCircle2 size={16} style={{ color: 'var(--green)' }} /> {toast}</div>}

      <div className="page-header">
        <div>
          <div className="page-title">{t('financialReports')}</div>
          <div className="page-subtitle">{t('analyticsExportCenter')}</div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => handleExport('Excel')}><Download size={16} />{t('excel')}</button>
          <button className="btn btn-primary" onClick={() => handleExport('PDF')}><FileText size={16} />{t('pdfReport')}</button>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="grid-cols-4" style={{ gap: 12, marginBottom: 24 }}>
        {REPORT_TYPES.map(r => (
          <div key={r.id} onClick={() => setReportType(r.id)} style={{ borderRadius: 14, padding: 16, cursor: 'pointer', transition: 'all .2s', border: `2px solid ${reportType === r.id ? 'var(--brand)' : 'var(--border)'}`, background: reportType === r.id ? 'var(--brand-soft)' : 'var(--surface)' }}>
            <div style={{ marginBottom: 8, color: reportType === r.id ? 'var(--brand-light)' : 'var(--text-2)' }}><r.icon size={22} /></div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Analytics — visual overview of all data */}
      {reportType === 'analytics' && (
        <div>
          <div className="grid-cols-5" style={{ gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total Capital',    value: totalCapital,           color: 'var(--brand-light)' },
              { label: 'Total Disbursed',  value: derived.totalDisbursed, color: 'var(--cyan)' },
              { label: 'Total Collected',  value: totalCollected,         color: 'var(--green)' },
              { label: 'Not Paid Amount',  value: totalOutstanding,       color: 'var(--red)' },
              { label: 'Total Expenses',   value: totalExpenses,          color: 'var(--red)' },
            ].map(s => (
              <div key={s.label} className="card">
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: 'var(--mono)', marginTop: 6 }}>₹{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="chart-card" style={{ marginBottom: 16 }}>
            <div className="chart-title"><TrendingUp size={16} style={{ color: 'var(--green)' }} />Collection Trend — Last 30 Days</div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={state.collectionHistory}>
                <defs>
                  <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, name) => [`₹${v.toLocaleString()}`, name]} />
                <Legend />
                <Area type="monotone" dataKey="target" stroke="#9297a8" strokeDasharray="4 4" fill="none" name="Target" />
                <Area type="monotone" dataKey="amount" stroke="#059669" fill="url(#collectedFill)" name="Collected" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid-cols-3" style={{ gap: 16, marginBottom: 16 }}>
            <div className="chart-card">
              <div className="chart-title"><PieChart size={16} style={{ color: 'var(--brand-light)' }} />Loans by Status</div>
              <ResponsiveContainer width="100%" height={220}>
                <RePieChart>
                  <Pie data={loanByStatus.map(s => ({ name: s.name, value: s.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {loanByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </RePieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="chart-title"><ClipboardList size={16} style={{ color: 'var(--cyan)' }} />Installments by Status</div>
              <ResponsiveContainer width="100%" height={220}>
                <RePieChart>
                  <Pie data={installmentStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {installmentStatusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </RePieChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="chart-title"><Wallet size={16} style={{ color: 'var(--amber)' }} />Expenses by Category</div>
              <ResponsiveContainer width="100%" height={220}>
                <RePieChart>
                  <Pie data={expenseByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {expenseByCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid-cols-3" style={{ gap: 16 }}>
            <div className="chart-card">
              <div className="chart-title"><Layers size={16} style={{ color: 'var(--brand-light)' }} />Loans by Type</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={loanTypeData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} name="Loan Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="chart-title"><MapPin size={16} style={{ color: 'var(--red)' }} />Borrowers by Zone</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={zoneData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0891b2" radius={[0, 6, 6, 0]} name="Borrowers" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="chart-title"><Target size={16} style={{ color: 'var(--green)' }} />Collector Performance</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={collectorPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="target" fill="#9297a8" radius={[6, 6, 0, 0]} name="Target" />
                  <Bar dataKey="collected" fill="#059669" radius={[6, 6, 0, 0]} name="Collected" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* P&L Report */}
      {reportType === 'pl' && (
        <div>
          <div className="grid-cols-3" style={{ gap: 12, marginBottom: 24 }}>
            {[
              { id: 'grossRevenue', label: t('grossRevenue'),   value: totalCollected,     color: 'var(--green)',        note: t('grossRevenueNote') },
              { id: 'totalExpenses', label: t('totalExpenses'),  value: totalExpenses,      color: 'var(--red)',           note: t('totalExpensesNote') },
              { id: 'outstanding', label: t('outstandingLabel'),     value: totalOutstanding,   color: 'var(--cyan)',         note: t('outstandingNote') },
            ].map(s => (
              <div key={s.id} className="card" style={{ borderColor: `${s.color}33` }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: s.color, fontFamily: 'var(--mono)', margin: '8px 0' }}>₹{s.value.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collection Summary */}
      {reportType === 'collection' && (
        <div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('dateLabel')}</th><th>{t('tableDay')}</th><th>{t('collectedLabel')}</th><th>{t('tableTarget')}</th><th>Not Paid</th><th>{t('tableAchievement')}</th></tr></thead>
              <tbody>
                {collectionData.slice(-7).map((d, i) => {
                  const pct = Math.round((d.amount / d.target) * 100);
                  const notPaid = Math.max(d.target - d.amount, 0);
                  return (
                    <tr key={i}>
                      <td data-label={t('dateLabel')} style={{ fontSize: 13 }}>{d.date}</td>
                      <td data-label={t('tableDay')} style={{ fontWeight: 600 }}>{d.day}</td>
                      <td data-label={t('collectedLabel')} style={{ fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>₹{d.amount.toLocaleString()}</td>
                      <td data-label={t('tableTarget')} style={{ fontFamily: 'var(--mono)' }}>₹{d.target.toLocaleString()}</td>
                      <td data-label="Not Paid" style={{ fontFamily: 'var(--mono)', color: notPaid > 0 ? 'var(--red)' : 'var(--text-2)' }}>₹{notPaid.toLocaleString()}</td>
                      <td data-label={t('tableAchievement')}><span className={`badge ${pct >= 100 ? 'badge-green' : pct >= 75 ? 'badge-amber' : 'badge-red'}`}>{pct}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Portfolio */}
      {reportType === 'portfolio' && (
        <div>
          <div className="grid-cols-3" style={{ gap: 12, marginBottom: 20 }}>
            {loanByStatus.map(s => (
              <div key={s.id} className="card">
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700 }}>{s.name} {t('loansSuffix')}</div>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)', margin: '6px 0' }}>{s.count}</div>
                <div style={{ fontSize: 14, color: 'var(--text-2)' }}>₹{s.amount.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('tableBorrower')}</th><th>{t('tableType')}</th><th>{t('tablePrincipal')}</th><th>{t('tableTotalDue')}</th><th>{t('collectedLabel')}</th><th>Not Paid</th><th>{t('tableStatus')}</th></tr></thead>
              <tbody>
                {state.loans.map(l => {
                  const notPaid = Math.max(l.total - l.collectedAmount, 0);
                  return (
                    <tr key={l.id}>
                      <td data-label={t('tableBorrower')} style={{ fontWeight: 700 }}>{l.borrowerName}</td>
                      <td data-label={t('tableType')}><span className="badge badge-indigo" style={{ textTransform: 'capitalize' }}>{l.type.replace('_',' ')}</span></td>
                      <td data-label={t('tablePrincipal')} style={{ fontFamily: 'var(--mono)' }}>₹{l.principal.toLocaleString()}</td>
                      <td data-label={t('tableTotalDue')} style={{ fontFamily: 'var(--mono)' }}>₹{l.total.toLocaleString()}</td>
                      <td data-label={t('collectedLabel')} style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>₹{l.collectedAmount.toLocaleString()}</td>
                      <td data-label="Not Paid" style={{ fontFamily: 'var(--mono)', color: notPaid > 0 ? 'var(--red)' : 'var(--text-2)' }}>₹{notPaid.toLocaleString()}</td>
                      <td data-label={t('tableStatus')}><span className={`badge ${l.status==='active'?'badge-green':l.status==='closed'?'badge-gray':'badge-red'}`}>{l.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overdue Report */}
      {reportType === 'overdue' && (
        <div>
          {overdueItems.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><CheckCircle2 size={40} style={{ color: 'var(--green)' }} /></div><div className="empty-title">{t('noOverdueAccounts')}</div></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('tableBorrower')}</th><th>{t('tablePhone')}</th><th>{t('tableDueDate')}</th><th>{t('tableAmountDue')}</th><th>{t('tableDaysOverdue')}</th><th>{t('tableType')}</th></tr></thead>
                <tbody>
                  {overdueItems.map(i => {
                    const days = Math.round((new Date() - new Date(i.dueDate)) / 86400000);
                    return (
                      <tr key={i.id} className="ledger-row-overdue">
                        <td data-label={t('tableBorrower')} style={{ fontWeight: 700 }}>{i.borrowerName}</td>
                        <td data-label={t('tablePhone')} style={{ fontSize: 13 }}>{i.phone}</td>
                        <td data-label={t('tableDueDate')} style={{ fontSize: 13 }}>{i.dueDate}</td>
                        <td data-label={t('tableAmountDue')} style={{ fontWeight: 700, color: 'var(--red)', fontFamily: 'var(--mono)' }}>₹{i.amount.toLocaleString()}</td>
                        <td data-label={t('tableDaysOverdue')}><span className={`badge ${days > 7 ? 'badge-red' : 'badge-amber'}`}>{days} {t('daysSuffix')}</span></td>
                        <td data-label={t('tableType')} style={{ textTransform: 'capitalize', fontSize: 13 }}>{i.type.replace('_',' ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Weekly Report */}
      {reportType === 'weekly' && (
        <div>
          <div className="grid-cols-4" style={{ gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Collected (period)', value: weeklyTotals.collected, color: 'var(--green)' },
              { label: 'Expenses (period)',  value: weeklyTotals.expenses,  color: 'var(--red)' },
              { label: 'Disbursed (period)', value: weeklyTotals.disbursed, color: 'var(--cyan)' },
              { label: 'Not Paid Amount',    value: totalOutstanding,       color: 'var(--red)' },
            ].map(s => (
              <div key={s.label} className="card">
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: 'var(--mono)', marginTop: 6 }}>₹{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="chart-card" style={{ marginBottom: 16 }}>
            <div className="chart-title"><CalendarDays size={16} style={{ color: 'var(--brand-light)' }} />Collected vs Target vs Expenses — Week-wise</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, name) => [`₹${v.toLocaleString()}`, name]} />
                <Legend />
                <Bar dataKey="target" fill="#9297a8" radius={[6, 6, 0, 0]} name="Target" />
                <Bar dataKey="collected" fill="#059669" radius={[6, 6, 0, 0]} name="Collected" />
                <Bar dataKey="expenses" fill="#dc2626" radius={[6, 6, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Week</th><th>{t('collectedLabel')}</th><th>{t('tableTarget')}</th><th>{t('tableAchievement')}</th>
                  <th>Expenses</th><th>Net Profit</th><th>New Loans</th><th>Disbursed</th>
                </tr>
              </thead>
              <tbody>
                {weeklyData.map(row => {
                  const pct = row.target > 0 ? Math.round((row.collected / row.target) * 100) : 0;
                  return (
                    <tr key={row.key}>
                      <td data-label="Week" style={{ fontWeight: 700 }}>{row.label}</td>
                      <td data-label={t('collectedLabel')} style={{ fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>₹{row.collected.toLocaleString()}</td>
                      <td data-label={t('tableTarget')} style={{ fontFamily: 'var(--mono)' }}>₹{row.target.toLocaleString()}</td>
                      <td data-label={t('tableAchievement')}>{row.target > 0 ? <span className={`badge ${pct >= 100 ? 'badge-green' : pct >= 75 ? 'badge-amber' : 'badge-red'}`}>{pct}%</span> : '—'}</td>
                      <td data-label="Expenses" style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>₹{row.expenses.toLocaleString()}</td>
                      <td data-label="Net Profit" style={{ fontFamily: 'var(--mono)', color: row.net >= 0 ? 'var(--green)' : 'var(--red)' }}>₹{row.net.toLocaleString()}</td>
                      <td data-label="New Loans" style={{ fontFamily: 'var(--mono)' }}>{row.newLoans}</td>
                      <td data-label="Disbursed" style={{ fontFamily: 'var(--mono)' }}>₹{row.disbursed.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly Report */}
      {reportType === 'monthly' && (
        <div>
          <div className="grid-cols-4" style={{ gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Collected (period)', value: monthlyTotals.collected, color: 'var(--green)' },
              { label: 'Expenses (period)',  value: monthlyTotals.expenses,  color: 'var(--red)' },
              { label: 'Disbursed (period)', value: monthlyTotals.disbursed, color: 'var(--cyan)' },
              { label: 'Not Paid Amount',    value: totalOutstanding,        color: 'var(--red)' },
            ].map(s => (
              <div key={s.label} className="card">
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: 'var(--mono)', marginTop: 6 }}>₹{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="chart-card" style={{ marginBottom: 16 }}>
            <div className="chart-title"><Calendar size={16} style={{ color: 'var(--brand-light)' }} />Collected vs Target vs Expenses — Month-wise</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, name) => [`₹${v.toLocaleString()}`, name]} />
                <Legend />
                <Bar dataKey="target" fill="#9297a8" radius={[6, 6, 0, 0]} name="Target" />
                <Bar dataKey="collected" fill="#059669" radius={[6, 6, 0, 0]} name="Collected" />
                <Bar dataKey="expenses" fill="#dc2626" radius={[6, 6, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th><th>{t('collectedLabel')}</th><th>{t('tableTarget')}</th><th>{t('tableAchievement')}</th>
                  <th>Expenses</th><th>Net Profit</th><th>New Loans</th><th>Disbursed</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map(row => {
                  const pct = row.target > 0 ? Math.round((row.collected / row.target) * 100) : 0;
                  return (
                    <tr key={row.key}>
                      <td data-label="Month" style={{ fontWeight: 700 }}>{row.label}</td>
                      <td data-label={t('collectedLabel')} style={{ fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>₹{row.collected.toLocaleString()}</td>
                      <td data-label={t('tableTarget')} style={{ fontFamily: 'var(--mono)' }}>₹{row.target.toLocaleString()}</td>
                      <td data-label={t('tableAchievement')}>{row.target > 0 ? <span className={`badge ${pct >= 100 ? 'badge-green' : pct >= 75 ? 'badge-amber' : 'badge-red'}`}>{pct}%</span> : '—'}</td>
                      <td data-label="Expenses" style={{ fontFamily: 'var(--mono)', color: 'var(--red)' }}>₹{row.expenses.toLocaleString()}</td>
                      <td data-label="Net Profit" style={{ fontFamily: 'var(--mono)', color: row.net >= 0 ? 'var(--green)' : 'var(--red)' }}>₹{row.net.toLocaleString()}</td>
                      <td data-label="New Loans" style={{ fontFamily: 'var(--mono)' }}>{row.newLoans}</td>
                      <td data-label="Disbursed" style={{ fontFamily: 'var(--mono)' }}>₹{row.disbursed.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
