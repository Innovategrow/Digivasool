import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useLanguage } from '../../context/LanguageContext';
import { CheckCircle, Clock, AlertTriangle, DollarSign, X, Calendar, CalendarDays, Landmark, ClipboardList } from 'lucide-react';

function PayModal({ installment, onClose, onPay }) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState(installment.amount);
  const [penalty, setPenalty] = useState(0);
  const [mode, setMode] = useState('full');
  const total = Number(amount) + Number(penalty);
  const MODE_LABELS = { full: t('modeFull'), partial: t('modePartial'), advance: t('modeAdvance') };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{t('recordPayment')}</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{installment.borrowerName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('due')}: ₹{installment.amount.toLocaleString()} · {installment.type}</div>
        </div>

        {/* Payment Mode Toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['full', 'partial', 'advance'].map(m => (
            <button key={m} onClick={() => { setMode(m); if (m === 'full') setAmount(installment.amount); }} className="btn btn-secondary btn-sm"
              style={{ flex: 1, background: mode === m ? 'var(--brand-soft)' : undefined, color: mode === m ? 'var(--brand-light)' : undefined, borderColor: mode === m ? 'var(--brand)' : undefined }}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('amountReceived')}</label>
            <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('penaltyLateFee')}</label>
            <input className="form-input" type="number" value={penalty} onChange={e => setPenalty(e.target.value)} placeholder="0" />
          </div>
        </div>

        <div style={{ background: 'var(--green-soft)', borderRadius: 10, padding: 14, marginBottom: 20, border: '1px solid rgba(16,185,129,.2)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('totalCollected')}</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--green)' }}>₹{total.toLocaleString()}</div>
        </div>

        <button className="btn btn-success w-full" style={{ fontSize: 15 }} onClick={() => { onPay(installment.id, Number(amount), Number(penalty)); onClose(); }}>
          <CheckCircle size={16} /> {t('confirmPayment')}
        </button>
      </div>
    </div>
  );
}

export default function Ledger() {
  const { state, dispatch } = useAppData();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [paying, setPaying] = useState(null);
  const [toast, setToast] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const filtered = state.installments.filter(i => {
    const tabMatch = activeTab === 'all' ? (i.dueDate === today || i.status === 'overdue') : i.type === activeTab && (i.dueDate === today || i.status === 'overdue');
    const staffMatch = staffFilter === 'all' || i.staff === staffFilter;
    return tabMatch && staffMatch;
  });

  const totalDue = filtered.reduce((s, i) => s + i.amount, 0);
  const totalCollected = filtered.filter(i => i.status !== 'unpaid' && i.status !== 'overdue').reduce((s, i) => s + i.paidAmount, 0);
  const collectPct = totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0;

  const staffList = ['all', ...new Set(state.installments.map(i => i.staff))];

  function handlePay(installmentId, amount, penalty) {
    dispatch({ type: 'ADD_PAYMENT', payload: { installmentId, amount, penalty } });
    showToast(`Payment of ₹${(amount + penalty).toLocaleString()} recorded!`);
  }

  const TAB_CONFIG = [
    { id: 'daily',   label: t('daily'),   icon: Calendar },
    { id: 'weekly',  label: t('weekly'),  icon: CalendarDays },
    { id: 'monthly', label: t('monthly'), icon: Landmark },
    { id: 'all',     label: t('allDue'),  icon: ClipboardList },
  ];

  const statusConfig = {
    paid:    { label: t('statusPaid'),    cls: 'badge-green', icon: <CheckCircle size={11} /> },
    partial: { label: t('statusPartial'), cls: 'badge-amber', icon: <Clock size={11} /> },
    unpaid:  { label: t('statusPending'), cls: 'badge-gray',  icon: <Clock size={11} /> },
    overdue: { label: t('statusOverdue'), cls: 'badge-red',   icon: <AlertTriangle size={11} /> },
  };

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      {toast && (
        <div className="toast" style={{ borderLeft: '3px solid var(--green)' }}><CheckCircle size={16} style={{ color: 'var(--green)' }} />{toast}</div>
      )}

      <div className="page-header">
        <div>
          <div className="page-title">{t('ledgerPageTitle')}</div>
          <div className="page-subtitle">{today} · {filtered.length} {t('entriesSuffix')}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="form-input" style={{ width: 160, padding: '8px 12px' }} value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
            {staffList.map(s => <option key={s} value={s}>{s === 'all' ? t('allStaff') : s}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Strips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { id: 'totalDueToday', label: t('totalDueToday'), value: `₹${totalDue.toLocaleString()}`, color: 'var(--text)', bg: 'var(--surface-2)' },
          { id: 'collected',     label: t('collectedLabel'), value: `₹${totalCollected.toLocaleString()}`, color: 'var(--green)', bg: 'var(--green-soft)' },
          { id: 'pending',       label: t('pendingLabel'), value: `₹${(totalDue - totalCollected).toLocaleString()}`, color: 'var(--amber)', bg: 'var(--amber-soft)' },
          { id: 'collectionPct', label: t('collectionPercent'), value: `${collectPct}%`, color: collectPct >= 80 ? 'var(--green)' : 'var(--amber)', bg: 'var(--surface-2)' },
        ].map(s => (
          <div key={s.id} style={{ background: s.bg, border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: 'var(--mono)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: 20 }}>
        <div className="progress-bar" style={{ height: 10 }}>
          <div className="progress-fill" style={{ width: `${collectPct}%`, background: `linear-gradient(to right, var(--brand), var(--green))` }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>{t('collectionProgress')}: {collectPct}%</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TAB_CONFIG.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="btn btn-secondary btn-sm"
            style={{ background: activeTab === tab.id ? 'var(--brand-soft)' : undefined, color: activeTab === tab.id ? 'var(--brand-light)' : undefined, borderColor: activeTab === tab.id ? 'var(--brand)' : undefined }}>
            <tab.icon size={13} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Ledger Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('tableBorrower')}</th>
              <th>{t('tablePhone')}</th>
              <th>{t('tableType')}</th>
              <th>{t('tableDueAmount')}</th>
              <th>{t('tablePaid')}</th>
              <th>{t('tableStatus')}</th>
              <th>{t('tableStaff')}</th>
              <th>{t('tableAction')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-2)' }}>{t('noInstallmentsDue')}</td></tr>
            ) : filtered.map(inst => {
              const sc = statusConfig[inst.status] || statusConfig.unpaid;
              const rowCls = inst.status === 'paid' ? 'ledger-row-paid' : inst.status === 'partial' ? 'ledger-row-partial' : inst.status === 'overdue' ? 'ledger-row-overdue' : '';
              return (
                <tr key={inst.id} className={rowCls}>
                  <td style={{ fontWeight: 700 }}>{inst.borrowerName}</td>
                  <td style={{ color: 'var(--text-2)', fontSize: 13 }}>{inst.phone}</td>
                  <td><span className="badge badge-indigo" style={{ textTransform: 'capitalize' }}>{inst.type.replace('_', ' ')}</span></td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>₹{inst.amount.toLocaleString()}</td>
                  <td style={{ fontWeight: 700, color: inst.paidAmount > 0 ? 'var(--green)' : 'var(--text-2)', fontFamily: 'var(--mono)' }}>
                    {inst.paidAmount > 0 ? `₹${inst.paidAmount.toLocaleString()}` : '—'}
                  </td>
                  <td><span className={`badge ${sc.cls}`}>{sc.icon} {sc.label}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{inst.staff}</td>
                  <td>
                    {inst.status !== 'paid' && (
                      <button className="btn btn-success btn-sm" onClick={() => setPaying(inst)}>
                        <DollarSign size={13} /> {t('collect')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {paying && <PayModal installment={paying} onClose={() => setPaying(null)} onPay={handlePay} />}
    </div>
  );
}
