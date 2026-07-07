import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { Download, FileText, PieChart, Inbox, ClipboardList, AlertCircle, CheckCircle2 } from 'lucide-react';

const REPORT_TYPES = [
  { id: 'pl',          label: 'Profit & Loss',       icon: PieChart,      desc: 'Revenue and expenses' },
  { id: 'collection',  label: 'Collection Summary',  icon: Inbox,         desc: 'Day-wise collection performance' },
  { id: 'portfolio',   label: 'Loan Portfolio',      icon: ClipboardList, desc: 'Active loans by type and status' },
  { id: 'overdue',     label: 'Overdue Report',      icon: AlertCircle,   desc: 'All overdue accounts and aging' },
];

export default function Reports() {
  const { state, derived } = useAppData();
  const [reportType, setReportType] = useState('pl');
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
  const handleExport = (type) => showToast(`${type} export ready!`);

  const { totalCollected, totalExpenses, totalOutstanding, totalCapital } = derived;

  const loanByStatus = [
    { name: 'Active',    count: state.loans.filter(l => l.status === 'active').length,   amount: state.loans.filter(l => l.status === 'active').reduce((s, l) => s + l.principal, 0) },
    { name: 'Closed',    count: state.loans.filter(l => l.status === 'closed').length,    amount: state.loans.filter(l => l.status === 'closed').reduce((s, l) => s + l.principal, 0) },
    { name: 'Defaulted', count: state.loans.filter(l => l.status === 'defaulted').length, amount: state.loans.filter(l => l.status === 'defaulted').reduce((s, l) => s + l.principal, 0) },
  ];

  const overdueItems = state.installments.filter(i => i.status === 'overdue');
  const collectionData = state.collectionHistory.slice(-14);

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      {toast && <div className="toast" style={{ borderLeft: '3px solid var(--green)' }}><CheckCircle2 size={16} style={{ color: 'var(--green)' }} /> {toast}</div>}

      <div className="page-header">
        <div>
          <div className="page-title">Financial Reports</div>
          <div className="page-subtitle">Analytics and export center</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => handleExport('Excel')}><Download size={16} />Excel</button>
          <button className="btn btn-primary" onClick={() => handleExport('PDF')}><FileText size={16} />PDF Report</button>
        </div>
      </div>

      {/* Report Type Selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {REPORT_TYPES.map(r => (
          <div key={r.id} onClick={() => setReportType(r.id)} style={{ borderRadius: 14, padding: 16, cursor: 'pointer', transition: 'all .2s', border: `2px solid ${reportType === r.id ? 'var(--brand)' : 'var(--border)'}`, background: reportType === r.id ? 'var(--brand-soft)' : 'var(--surface)' }}>
            <div style={{ marginBottom: 8, color: reportType === r.id ? 'var(--brand-light)' : 'var(--text-2)' }}><r.icon size={22} /></div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.desc}</div>
          </div>
        ))}
      </div>

      {/* P&L Report */}
      {reportType === 'pl' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Gross Revenue',   value: totalCollected,     color: 'var(--green)',        note: 'Total interest + principal collected' },
              { label: 'Total Expenses',  value: totalExpenses,      color: 'var(--red)',           note: 'Salaries, fuel, office, misc' },
              { label: 'Outstanding',     value: totalOutstanding,   color: 'var(--cyan)',         note: 'Pending amount to recover' },
            ].map(s => (
              <div key={s.label} className="card" style={{ borderColor: `${s.color}33` }}>
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
              <thead><tr><th>Date</th><th>Day</th><th>Collected</th><th>Target</th><th>Achievement</th></tr></thead>
              <tbody>
                {collectionData.slice(-7).map((d, i) => {
                  const pct = Math.round((d.amount / d.target) * 100);
                  return (
                    <tr key={i}>
                      <td style={{ fontSize: 13 }}>{d.date}</td>
                      <td style={{ fontWeight: 600 }}>{d.day}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>₹{d.amount.toLocaleString()}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>₹{d.target.toLocaleString()}</td>
                      <td><span className={`badge ${pct >= 100 ? 'badge-green' : pct >= 75 ? 'badge-amber' : 'badge-red'}`}>{pct}%</span></td>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            {loanByStatus.map(s => (
              <div key={s.name} className="card">
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700 }}>{s.name} Loans</div>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)', margin: '6px 0' }}>{s.count}</div>
                <div style={{ fontSize: 14, color: 'var(--text-2)' }}>₹{s.amount.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Borrower</th><th>Type</th><th>Principal</th><th>Total Due</th><th>Collected</th><th>Status</th></tr></thead>
              <tbody>
                {state.loans.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 700 }}>{l.borrowerName}</td>
                    <td><span className="badge badge-indigo" style={{ textTransform: 'capitalize' }}>{l.type.replace('_',' ')}</span></td>
                    <td style={{ fontFamily: 'var(--mono)' }}>₹{l.principal.toLocaleString()}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>₹{l.total.toLocaleString()}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>₹{l.collectedAmount.toLocaleString()}</td>
                    <td><span className={`badge ${l.status==='active'?'badge-green':l.status==='closed'?'badge-gray':'badge-red'}`}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overdue Report */}
      {reportType === 'overdue' && (
        <div>
          {overdueItems.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><CheckCircle2 size={40} style={{ color: 'var(--green)' }} /></div><div className="empty-title">No overdue accounts!</div></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Borrower</th><th>Phone</th><th>Due Date</th><th>Amount Due</th><th>Days Overdue</th><th>Type</th></tr></thead>
                <tbody>
                  {overdueItems.map(i => {
                    const days = Math.round((new Date() - new Date(i.dueDate)) / 86400000);
                    return (
                      <tr key={i.id} className="ledger-row-overdue">
                        <td style={{ fontWeight: 700 }}>{i.borrowerName}</td>
                        <td style={{ fontSize: 13 }}>{i.phone}</td>
                        <td style={{ fontSize: 13 }}>{i.dueDate}</td>
                        <td style={{ fontWeight: 700, color: 'var(--red)', fontFamily: 'var(--mono)' }}>₹{i.amount.toLocaleString()}</td>
                        <td><span className={`badge ${days > 7 ? 'badge-red' : 'badge-amber'}`}>{days} days</span></td>
                        <td style={{ textTransform: 'capitalize', fontSize: 13 }}>{i.type.replace('_',' ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
