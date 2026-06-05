import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { Plus, X, TrendingDown, TrendingUp } from 'lucide-react';

const CATEGORIES = ['Staff Salary', 'Fuel', 'Office Rent', 'Printing', 'Miscellaneous'];
const CAT_COLORS = { 'Staff Salary': '#6366f1', 'Fuel': '#f59e0b', 'Office Rent': '#10b981', 'Printing': '#ec4899', 'Miscellaneous': '#06b6d4' };

function AddExpenseModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ category: 'Staff Salary', amount: '', date: new Date().toISOString().split('T')[0], description: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Log Expense</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Amount (₹)</label>
            <input className="form-input" type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="e.g. 5000" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description..." />
        </div>
        <button className="btn btn-primary w-full" onClick={() => { if (form.amount) { onAdd({ ...form, amount: Number(form.amount) }); onClose(); } }}>
          <TrendingDown size={16} /> Log Expense
        </button>
      </div>
    </div>
  );
}

function AddCapitalModal({ onClose, onAdd }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Log Capital Investment</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-group">
          <label className="form-label">Amount Invested (₹)</label>
          <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 100000" />
        </div>
        <div className="form-group">
          <label className="form-label">Note</label>
          <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Capital round description" />
        </div>
        <button className="btn btn-success w-full" onClick={() => { if (amount) { onAdd({ amount: Number(amount), note, date: new Date().toISOString().split('T')[0] }); onClose(); } }}>
          <TrendingUp size={16} /> Log Investment
        </button>
      </div>
    </div>
  );
}

export default function Expenses() {
  const { state, dispatch, derived } = useAppData();
  const [showExpense, setShowExpense] = useState(false);
  const [showCapital, setShowCapital] = useState(false);
  const [activeTab, setActiveTab] = useState('expenses');

  const { totalExpenses, totalCapital, totalCollected } = derived;

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <div className="page-header">
        <div>
          <div className="page-title">Expenses & Capital</div>
          <div className="page-subtitle">Business financial health overview</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowCapital(true)}><TrendingUp size={16} />Log Investment</button>
          <button className="btn btn-primary" onClick={() => setShowExpense(true)}><TrendingDown size={16} />Add Expense</button>
        </div>
      </div>

      {/* P&L Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Invested',  value: totalCapital,   color: 'var(--brand-light)', bg: 'var(--brand-soft)', icon: '💼' },
          { label: 'Total Collected', value: totalCollected, color: 'var(--green)',        bg: 'var(--green-soft)', icon: '📥' },
          { label: 'Total Expenses',  value: totalExpenses,  color: 'var(--red)',          bg: 'var(--red-soft)',   icon: '📤' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: 'var(--mono)' }}>₹{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Tabs: Expenses / Capital */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['expenses', '📤 Expenses'], ['capital', '💼 Capital Investments']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} className="btn btn-secondary btn-sm"
            style={{ background: activeTab === id ? 'var(--brand-soft)' : undefined, color: activeTab === id ? 'var(--brand-light)' : undefined, borderColor: activeTab === id ? 'var(--brand)' : undefined }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'expenses' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Amount</th><th>Description</th></tr>
            </thead>
            <tbody>
              {state.expenses.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: 13 }}>{e.date}</td>
                  <td><span className="badge" style={{ background: `${CAT_COLORS[e.category]}22`, color: CAT_COLORS[e.category] }}>{e.category}</span></td>
                  <td style={{ fontWeight: 700, color: 'var(--red)', fontFamily: 'var(--mono)' }}>₹{e.amount.toLocaleString()}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'capital' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Amount</th><th>Note</th></tr>
            </thead>
            <tbody>
              {state.capital.map(c => (
                <tr key={c.id}>
                  <td style={{ fontSize: 13 }}>{c.date}</td>
                  <td style={{ fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--mono)' }}>₹{c.amount.toLocaleString()}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showExpense && <AddExpenseModal onClose={() => setShowExpense(false)} onAdd={p => dispatch({ type: 'ADD_EXPENSE', payload: p })} />}
      {showCapital && <AddCapitalModal onClose={() => setShowCapital(false)} onAdd={p => dispatch({ type: 'ADD_CAPITAL', payload: p })} />}
    </div>
  );
}
