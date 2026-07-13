import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useLanguage } from '../../context/LanguageContext';
import { Download, FileText, PieChart, Inbox, ClipboardList, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Reports() {
  const { state, derived } = useAppData();
  const { t } = useLanguage();
  const [reportType, setReportType] = useState('pl');
  const [toast, setToast] = useState('');

  const REPORT_TYPES = [
    { id: 'pl',          label: t('reportPL'),         icon: PieChart,      desc: t('reportPLDesc') },
    { id: 'collection',  label: t('reportCollection'), icon: Inbox,         desc: t('reportCollectionDesc') },
    { id: 'portfolio',   label: t('reportPortfolio'),  icon: ClipboardList, desc: t('reportPortfolioDesc') },
    { id: 'overdue',     label: t('reportOverdue'),    icon: AlertCircle,   desc: t('reportOverdueDesc') },
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

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      {toast && <div className="toast" style={{ borderLeft: '3px solid var(--green)' }}><CheckCircle2 size={16} style={{ color: 'var(--green)' }} /> {toast}</div>}

      <div className="page-header">
        <div>
          <div className="page-title">{t('financialReports')}</div>
          <div className="page-subtitle">{t('analyticsExportCenter')}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => handleExport('Excel')}><Download size={16} />{t('excel')}</button>
          <button className="btn btn-primary" onClick={() => handleExport('PDF')}><FileText size={16} />{t('pdfReport')}</button>
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
              <thead><tr><th>{t('dateLabel')}</th><th>{t('tableDay')}</th><th>{t('collectedLabel')}</th><th>{t('tableTarget')}</th><th>{t('tableAchievement')}</th></tr></thead>
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
              <div key={s.id} className="card">
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700 }}>{s.name} {t('loansSuffix')}</div>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--mono)', margin: '6px 0' }}>{s.count}</div>
                <div style={{ fontSize: 14, color: 'var(--text-2)' }}>₹{s.amount.toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('tableBorrower')}</th><th>{t('tableType')}</th><th>{t('tablePrincipal')}</th><th>{t('tableTotalDue')}</th><th>{t('collectedLabel')}</th><th>{t('tableStatus')}</th></tr></thead>
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
                        <td style={{ fontWeight: 700 }}>{i.borrowerName}</td>
                        <td style={{ fontSize: 13 }}>{i.phone}</td>
                        <td style={{ fontSize: 13 }}>{i.dueDate}</td>
                        <td style={{ fontWeight: 700, color: 'var(--red)', fontFamily: 'var(--mono)' }}>₹{i.amount.toLocaleString()}</td>
                        <td><span className={`badge ${days > 7 ? 'badge-red' : 'badge-amber'}`}>{days} {t('daysSuffix')}</span></td>
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
