import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useLanguage } from '../../context/LanguageContext';
import { Plus, X, TrendingDown, TrendingUp, Briefcase, Inbox, Send } from 'lucide-react';

const CATEGORIES = ['Staff Salary', 'Fuel', 'Office Rent', 'Printing', 'Miscellaneous'];
const CAT_COLORS = { 'Staff Salary': '#6366f1', 'Fuel': '#f59e0b', 'Office Rent': '#10b981', 'Printing': '#ec4899', 'Miscellaneous': '#06b6d4' };

function AddExpenseModal({ onClose, onAdd }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ category: 'Staff Salary', amount: '', date: new Date().toISOString().split('T')[0], description: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{t('logExpense')}</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('category')}</label>
            <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('amountRs')}</label>
            <input className="form-input" type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="e.g. 5000" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{t('dateLabel')}</label>
          <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">{t('descriptionLabel')}</label>
          <input className="form-input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description..." />
        </div>
        <button className="btn btn-primary w-full" onClick={() => { if (form.amount) { onAdd({ ...form, amount: Number(form.amount) }); onClose(); } }}>
          <TrendingDown size={16} /> {t('logExpense')}
        </button>
      </div>
    </div>
  );
}

function AddCapitalModal({ onClose, onAdd }) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{t('logCapitalInvestment')}</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-group">
          <label className="form-label">{t('amountInvested')}</label>
          <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 100000" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('noteLabel')}</label>
          <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Capital round description" />
        </div>
        <button className="btn btn-success w-full" onClick={() => { if (amount) { onAdd({ amount: Number(amount), note, date: new Date().toISOString().split('T')[0] }); onClose(); } }}>
          <TrendingUp size={16} /> {t('logInvestment')}
        </button>
      </div>
    </div>
  );
}

export default function Expenses() {
  const { state, dispatch, derived } = useAppData();
  const { t } = useLanguage();
  const [showExpense, setShowExpense] = useState(false);
  const [showCapital, setShowCapital] = useState(false);
  const [activeTab, setActiveTab] = useState('expenses');

  const { totalExpenses, totalCapital, totalCollected } = derived;

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <div className="page-header">
        <div>
          <div className="page-title">{t('expensesAndCapital')}</div>
          <div className="page-subtitle">{t('businessFinancialHealth')}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowCapital(true)}><TrendingUp size={16} />{t('logInvestment')}</button>
          <button className="btn btn-primary" onClick={() => setShowExpense(true)}><TrendingDown size={16} />{t('addExpense')}</button>
        </div>
      </div>

      {/* P&L Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { id: 'totalInvested', label: t('totalInvested'),  value: totalCapital,   color: 'var(--brand-light)', bg: 'var(--brand-soft)', icon: Briefcase },
          { id: 'totalCollected', label: t('totalCollected'), value: totalCollected, color: 'var(--green)',        bg: 'var(--green-soft)', icon: Inbox },
          { id: 'totalExpenses', label: t('totalExpenses'),  value: totalExpenses,  color: 'var(--red)',          bg: 'var(--red-soft)',   icon: Send },
        ].map(s => (
          <div key={s.id} style={{ background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 16, padding: 18 }}>
            <div style={{ marginBottom: 8, color: s.color }}><s.icon size={22} /></div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: 'var(--mono)' }}>₹{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Tabs: Expenses / Capital */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[{ id: 'expenses', icon: Send, label: t('expenses') }, { id: 'capital', icon: Briefcase, label: t('capitalInvestments') }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="btn btn-secondary btn-sm"
            style={{ background: activeTab === tab.id ? 'var(--brand-soft)' : undefined, color: activeTab === tab.id ? 'var(--brand-light)' : undefined, borderColor: activeTab === tab.id ? 'var(--brand)' : undefined }}>
            <tab.icon size={13} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'expenses' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>{t('dateLabel')}</th><th>{t('category')}</th><th>{t('amountRs')}</th><th>{t('descriptionLabel')}</th></tr>
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
              <tr><th>{t('dateLabel')}</th><th>{t('amountRs')}</th><th>{t('noteLabel')}</th></tr>
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
