import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { CheckCircle, Clock, AlertTriangle, DollarSign, X } from 'lucide-react';

const TAB_CONFIG = [
  { id: 'daily',   label: 'Daily',   icon: '📅' },
  { id: 'weekly',  label: 'Weekly',  icon: '📆' },
  { id: 'monthly', label: 'Monthly', icon: '🏦' },
  { id: 'all',     label: 'All Due', icon: '📋' },
];

function PayModal({ installment, onClose, onPay }) {
  const [amount, setAmount] = useState(installment.amount);
  const [penalty, setPenalty] = useState(0);
  const [mode, setMode] = useState('full');
  const total = Number(amount) + Number(penalty);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Record Payment</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{installment.borrowerName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Due: ₹{installment.amount.toLocaleString()} · {installment.type}</div>
        </div>

        {/* Payment Mode Toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['full', 'partial', 'advance'].map(m => (
            <button key={m} onClick={() => { setMode(m); if (m === 'full') setAmount(installment.amount); }} className="btn btn-secondary btn-sm"
              style={{ flex: 1, background: mode === m ? 'var(--brand-soft)' : undefined, color: mode === m ? 'var(--brand-light)' : undefined, borderColor: mode === m ? 'var(--brand)' : undefined }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Amount Received (₹)</label>
            <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Penalty / Late Fee (₹)</label>
            <input className="form-input" type="number" value={penalty} onChange={e => setPenalty(e.target.value)} placeholder="0" />
          </div>
        </div>

        <div style={{ background: 'var(--green-soft)', borderRadius: 10, padding: 14, marginBottom: 20, border: '1px solid rgba(16,185,129,.2)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Total Collected</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--green)' }}>₹{total.toLocaleString()}</div>
        </div>

        <button className="btn btn-success w-full" style={{ fontSize: 15 }} onClick={() => { onPay(installment.id, Number(amount), Number(penalty)); onClose(); }}>
          ✅ Confirm Payment
        </button>
      </div>
    </div>
  );
}

export default function Ledger() {
  const { state, dispatch } = useAppData();
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
    showToast(`✅ Payment of ₹${(amount + penalty).toLocaleString()} recorded!`);
  }

  const statusConfig = {
    paid:    { label: 'Paid',    cls: 'badge-green', icon: <CheckCircle size={11} /> },
    partial: { label: 'Partial', cls: 'badge-amber', icon: <Clock size={11} /> },
    unpaid:  { label: 'Pending', cls: 'badge-gray',  icon: <Clock size={11} /> },
    overdue: { label: 'Overdue', cls: 'badge-red',   icon: <AlertTriangle size={11} /> },
  };

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      {toast && (
        <div className="toast" style={{ borderLeft: '3px solid var(--green)' }}><CheckCircle size={16} style={{ color: 'var(--green)' }} />{toast}</div>
      )}

      <div className="page-header">
        <div>
          <div className="page-title">Collection Ledger</div>
          <div className="page-subtitle">{today} · {filtered.length} entries</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="form-input" style={{ width: 160, padding: '8px 12px' }} value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
            {staffList.map(s => <option key={s} value={s}>{s === 'all' ? 'All Staff' : s}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Strips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Due Today', value: `₹${totalDue.toLocaleString()}`, color: 'var(--text)', bg: 'var(--surface-2)' },
          { label: 'Collected',       value: `₹${totalCollected.toLocaleString()}`, color: 'var(--green)', bg: 'var(--green-soft)' },
          { label: 'Pending',         value: `₹${(totalDue - totalCollected).toLocaleString()}`, color: 'var(--amber)', bg: 'var(--amber-soft)' },
          { label: 'Collection %',    value: `${collectPct}%`, color: collectPct >= 80 ? 'var(--green)' : 'var(--amber)', bg: 'var(--surface-2)' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
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
        <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>Collection Progress: {collectPct}%</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TAB_CONFIG.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className="btn btn-secondary btn-sm"
            style={{ background: activeTab === t.id ? 'var(--brand-soft)' : undefined, color: activeTab === t.id ? 'var(--brand-light)' : undefined, borderColor: activeTab === t.id ? 'var(--brand)' : undefined }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Ledger Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Borrower</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Due Amount</th>
              <th>Paid</th>
              <th>Status</th>
              <th>Staff</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-2)' }}>No installments due for this filter</td></tr>
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
                        <DollarSign size={13} /> Collect
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
