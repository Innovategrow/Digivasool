import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiFetch, newIdempotencyKey, readError } from '../utils/api';

// ── Coimbatore collection areas (location-wise sorting & filtering) ───────
export const ZONES = [
  'Gandhipuram',
  'RS Puram',
  'Peelamedu',
  'Saibaba Colony',
  'Singanallur',
  'Avinashi Road',
  'Saravanampatti',
  'Ukkadam',
  'Town Hall',
  'Sukrawarpet',
  'Race Course',
  'Vadavalli',
];

// ── Date helpers (YYYY-MM-DD, same convention the API uses) ────────────────
const DAY_MS = 86400000;
export const todayStr = () => new Date().toISOString().split('T')[0];
const dateOnly = value => String(value || '').slice(0, 10);
const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS);
const PERIOD_DAYS = { daily: 1, weekly: 7, monthly: 30, custom: 30 };

// Is an installment for this loan due on the given day?
function isDueOn(loan, day) {
  const start = dateOnly(loan.start_date || loan.created_at);
  if (!start || day <= start) return false;
  const diff = daysBetween(start, day);
  const freq = loan.repayment_frequency || 'monthly';
  if (freq === 'daily') return true;
  if (freq === 'weekly') return diff % 7 === 0;
  const startDay = Number(start.slice(8, 10));
  const d = new Date(`${day}T00:00:00Z`);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return d.getUTCDate() === Math.min(startDay, lastDay);
}

// Turn real loans + payments into the shapes the dashboard/ledger/report screens use.
function deriveState(apiLoans, payments, expenses, capital, staffRows, lastReadAt) {
  const today = todayStr();
  const paymentsByLoan = {};
  payments.forEach(p => { (paymentsByLoan[p.loan_id] ||= []).push(p); });
  const lastCollector = loanId => {
    const rows = paymentsByLoan[loanId] || [];
    const latest = rows.slice().sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))[0];
    return latest?.collector_name || 'Unassigned';
  };

  const loans = apiLoans.map(l => ({
    id: l.id,
    borrowerId: l.id,
    borrowerName: l.customer_name,
    type: l.repayment_frequency || 'monthly',
    principal: Number(l.loan_amount) || 0,
    total: Number(l.due_amount) || 0,
    collectedAmount: Number(l.collected_amount) || 0,
    pendingAmount: Number(l.pending_amount) || 0,
    installment: Number(l.repayment_amount) || 0,
    startDate: dateOnly(l.start_date || l.created_at) || today,
    closingDate: dateOnly(l.closing_date),
    status: l.status || 'active',
    staff: lastCollector(l.id),
    phone: l.customer_phone || '',
  }));

  const borrowers = apiLoans.map(l => ({
    id: l.id,
    name: l.customer_name,
    phone: l.customer_phone || '',
    zone: l.zone || '',
    address: l.customer_address || '',
    guarantor: l.guarantor_name || '',
    loans: [l.id],
  }));

  // Today's dues and overdue accounts
  const installments = [];
  loans.forEach(l => {
    if (l.status !== 'active' || l.pendingAmount <= 0) return;
    const paidToday = (paymentsByLoan[l.id] || [])
      .filter(p => dateOnly(p.payment_date) === today)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const base = { loanId: l.id, borrowerId: l.id, borrowerName: l.borrowerName, phone: l.phone, staff: l.staff, type: l.type };
    if (l.closingDate && l.closingDate < today) {
      installments.push({ ...base, id: `${l.id}:overdue`, dueDate: l.closingDate, amount: l.pendingAmount, paidAmount: paidToday, status: 'overdue' });
      return;
    }
    if (!isDueOn({ start_date: l.startDate, repayment_frequency: l.type }, today)) return;
    const amount = Math.min(l.installment || l.pendingAmount, l.pendingAmount);
    const status = paidToday >= amount ? 'paid' : paidToday > 0 ? 'partial' : 'unpaid';
    installments.push({ ...base, id: `${l.id}:${today}`, dueDate: today, amount, paidAmount: paidToday, status });
  });

  // Daily collection history (from the first payment, at least 30 days, at most a year)
  const expectedDaily = Math.round(loans
    .filter(l => l.status === 'active')
    .reduce((s, l) => s + l.installment / (PERIOD_DAYS[l.type] || 30), 0));
  const collectedByDay = {};
  payments.forEach(p => {
    const day = dateOnly(p.payment_date);
    if (day) collectedByDay[day] = (collectedByDay[day] || 0) + (Number(p.amount) || 0);
  });
  const firstDay = Object.keys(collectedByDay).sort()[0];
  const span = Math.min(366, Math.max(30, firstDay ? daysBetween(firstDay, today) + 1 : 30));
  const collectionHistory = Array.from({ length: span }, (_, i) => {
    const date = new Date(Date.now() - (span - 1 - i) * DAY_MS).toISOString().split('T')[0];
    return {
      date,
      day: new Date(`${date}T00:00:00`).toLocaleDateString('en', { weekday: 'short' }),
      amount: collectedByDay[date] || 0,
      target: expectedDaily,
    };
  });

  // Staff with this month's real collections
  const month = today.slice(0, 7);
  const staff = staffRows.map(s => {
    const mine = payments.filter(p => p.collector_name === s.name);
    return {
      ...s,
      target: Number(s.target) || 0,
      collected: mine.filter(p => dateOnly(p.payment_date).startsWith(month)).reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      loans: new Set(mine.map(p => p.loan_id)).size,
    };
  });

  // Notifications: latest collections + overdue accounts
  const readAt = lastReadAt || '';
  const recent = payments.slice(0, 5).map(p => ({
    id: `pay-${p.id}`,
    type: 'payment',
    message: Number(p.amount) > 0
      ? `${p.customer_name || 'Borrower'} paid ₹${Number(p.amount).toLocaleString('en-IN')}`
      : `${p.customer_name || 'Borrower'} did not pay`,
    time: new Date(p.payment_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    read: String(p.created_at || p.payment_date) <= readAt,
  }));
  const overdueNotes = installments.filter(i => i.status === 'overdue').slice(0, 5).map(i => ({
    id: `od-${i.loanId}`,
    type: 'overdue',
    message: `${i.borrowerName} is overdue (₹${i.amount.toLocaleString('en-IN')})`,
    time: `Due ${i.dueDate}`,
    read: Boolean(readAt),
  }));

  return {
    apiLoans,
    payments,
    loans,
    borrowers,
    installments,
    expenses,
    capital,
    staff,
    collectionHistory,
    notifications: [...recent, ...overdueNotes],
  };
}

const EMPTY = deriveState([], [], [], [], [], '');

async function getJson(path) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

// ── Context ──────────────────────────────────────────────────────────────────
const AppDataContext = createContext(null);
const READ_KEY = 'dk_notifications_read_at';

export function AppDataProvider({ children }) {
  const { user } = useAuth();
  const [raw, setRaw] = useState({ loans: [], payments: [], expenses: [], capital: [], staff: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastReadAt, setLastReadAt] = useState(() => {
    try { return localStorage.getItem(READ_KEY) || ''; } catch { return ''; }
  });

  const refresh = useCallback(async () => {
    if (user?.role !== 'admin') return;
    setLoading(true);
    setError('');
    try {
      const [loans, payments, expenses, capital, staff] = await Promise.all([
        getJson('/api/loans/'),
        getJson('/api/collector/payments'),
        getJson('/api/expenses/'),
        getJson('/api/capital/'),
        getJson('/api/staff/'),
      ]);
      setRaw({ loans, payments, expenses, capital, staff });
    } catch (err) {
      setError(err.message || 'Could not load data');
    } finally {
      setLoading(false);
    }
  }, [user?.role, user?.token, user?.demo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.role === 'admin') refresh();
  }, [user?.role, refresh]);

  const state = useMemo(() => {
    if (user?.role !== 'admin') return { ...EMPTY, loading, error };
    return { ...deriveState(raw.loans, raw.payments, raw.expenses, raw.capital, raw.staff, lastReadAt), loading, error };
  }, [raw, lastReadAt, loading, error, user?.role]);

  const derived = useMemo(() => {
    const activeLoans = state.loans.filter(l => l.status === 'active');
    const today = todayStr();
    return {
      activeLoans,
      totalOutstanding: activeLoans.reduce((s, l) => s + Math.max(0, l.pendingAmount), 0),
      totalCapital: state.capital.reduce((s, c) => s + (Number(c.amount) || 0), 0),
      totalExpenses: state.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      totalDisbursed: state.loans.reduce((s, l) => s + l.principal, 0),
      totalCollected: state.loans.reduce((s, l) => s + l.collectedAmount, 0),
      todayCollected: state.payments.filter(p => dateOnly(p.payment_date) === today).reduce((s, p) => s + (Number(p.amount) || 0), 0),
      overdueCount: state.installments.filter(i => i.status === 'overdue').length,
      unreadNotifications: state.notifications.filter(n => !n.read).length,
    };
  }, [state]);

  const post = useCallback(async (path, body, headers = {}) => {
    const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body), headers });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }, []);

  const actions = useMemo(() => ({
    refresh,
    markNotificationsRead() {
      const now = new Date().toISOString();
      setLastReadAt(now);
      try { localStorage.setItem(READ_KEY, now); } catch { /* storage unavailable — read state stays in memory */ }
    },
    async addExpense(payload) {
      const row = await post('/api/expenses/', payload);
      setRaw(r => ({ ...r, expenses: [row, ...r.expenses] }));
      return row;
    },
    async addCapital(payload) {
      const row = await post('/api/capital/', payload);
      setRaw(r => ({ ...r, capital: [row, ...r.capital] }));
      return row;
    },
    async addStaff(payload) {
      const row = await post('/api/staff/', payload);
      setRaw(r => ({ ...r, staff: [...r.staff, row] }));
      return row;
    },
    // idempotencyKey must stay the same when the user retries the same payment
    async recordPayment({ loanId, amount, method = 'Cash', notes = '', idempotencyKey = newIdempotencyKey() }) {
      const data = await post(`/api/loans/${loanId}/payments`, {
        amount,
        payment_method: method,
        collector_name: user?.name,
        notes: notes || null,
      }, { 'Idempotency-Key': idempotencyKey });
      await refresh();
      return data;
    },
  }), [post, refresh, user?.name]);

  // Legacy reducer-style entry point kept for the notification bell
  const dispatch = useCallback((action) => {
    if (action?.type === 'MARK_NOTIFICATIONS_READ') actions.markNotificationsRead();
  }, [actions]);

  return (
    <AppDataContext.Provider value={{ state, dispatch, derived, actions }}>
      {children}
    </AppDataContext.Provider>
  );
}

export const useAppData = () => useContext(AppDataContext);
