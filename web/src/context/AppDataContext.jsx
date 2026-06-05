import { createContext, useContext, useReducer, useMemo } from 'react';

// ── Interest Calculators ────────────────────────────────────────────────────
export function calcDailyLoan({ principal, interestRate, duration }) {
  // Flat daily rate — total = P * (1 + rate/100)
  const total = Math.round(principal * (1 + interestRate / 100));
  const daily = Math.round(total / duration);
  return { total, installment: daily, processingFee: Math.round(principal * 0.02), netDisbursement: Math.round(principal * 0.98) };
}
export function calcWeeklyLoan({ principal, interestRate, weeks }) {
  const total = Math.round(principal * (1 + interestRate / 100));
  const weekly = Math.round(total / weeks);
  return { total, installment: weekly, processingFee: Math.round(principal * 0.015), netDisbursement: Math.round(principal * 0.985) };
}
export function calcMonthlyEMI({ principal, annualRate, months }) {
  const r = annualRate / 12 / 100;
  const emi = r === 0 ? principal / months : Math.round(principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1));
  return { total: emi * months, installment: emi, processingFee: Math.round(principal * 0.01), netDisbursement: Math.round(principal * 0.99) };
}
export function calcInterestOnly({ principal, monthlyRate, months }) {
  const monthlyInterest = Math.round(principal * monthlyRate / 100);
  return { total: monthlyInterest * months + principal, installment: monthlyInterest, processingFee: Math.round(principal * 0.01), netDisbursement: Math.round(principal * 0.99) };
}

export function generateAmortization(loan) {
  const schedule = [];
  const start = new Date(loan.startDate);
  for (let i = 1; i <= loan.duration; i++) {
    const due = new Date(start);
    if (loan.type === 'daily') due.setDate(start.getDate() + i);
    else if (loan.type === 'weekly') due.setDate(start.getDate() + i * 7);
    else if (loan.type === 'monthly' || loan.type === 'interest_only') due.setMonth(start.getMonth() + i);
    schedule.push({ installmentNo: i, dueDate: due.toISOString().split('T')[0], amount: loan.installment, status: 'unpaid', paidDate: null, paidAmount: 0 });
  }
  return schedule;
}

// ── Seed Data ───────────────────────────────────────────────────────────────
const today = new Date();
const d = (offset) => { const x = new Date(today); x.setDate(today.getDate() + offset); return x.toISOString().split('T')[0]; };
const m = (offset) => { const x = new Date(today); x.setMonth(today.getMonth() + offset); return x.toISOString().split('T')[0]; };

const SEED_BORROWERS = [
  { id: 'b1', name: 'Rajan Kumar',    phone: '9876543210', address: '12 Gandhi Nagar, Chennai', guarantor: 'Suresh K', rating: 4, kyc: 'verified', photo: null, loans: ['l1', 'l4'] },
  { id: 'b2', name: 'Meena Devi',     phone: '8765432109', address: '45 Anna Street, Coimbatore', guarantor: 'Ramesh M', rating: 5, kyc: 'verified', photo: null, loans: ['l2'] },
  { id: 'b3', name: 'Selvam P',       phone: '7654321098', address: '7 Nehru Road, Madurai', guarantor: 'Kavitha S', rating: 3, kyc: 'pending', photo: null, loans: ['l3'] },
  { id: 'b4', name: 'Priya Lakshmi',  phone: '6543210987', address: '89 KK Nagar, Chennai', guarantor: 'Venkat P', rating: 5, kyc: 'verified', photo: null, loans: ['l5'] },
  { id: 'b5', name: 'Murugan S',      phone: '9988776655', address: '23 RS Puram, Coimbatore', guarantor: 'Arjun M', rating: 2, kyc: 'rejected', photo: null, loans: ['l6'] },
  { id: 'b6', name: 'Anitha R',       phone: '9876541230', address: '56 T Nagar, Chennai', guarantor: 'Lakshmi A', rating: 4, kyc: 'verified', photo: null, loans: ['l7'] },
  { id: 'b7', name: 'Karthik V',      phone: '8877665544', address: '34 Gandhipuram, Coimbatore', guarantor: 'Suresh V', rating: 3, kyc: 'pending', photo: null, loans: [] },
  { id: 'b8', name: 'Saranya M',      phone: '7766554433', address: '11 Besant Nagar, Chennai', guarantor: 'Kumar M', rating: 5, kyc: 'verified', photo: null, loans: ['l8'] },
  { id: 'b9', name: 'Vijay C',        phone: '6655443322', address: '78 Vadapalani, Chennai', guarantor: 'Devi C', rating: 4, kyc: 'verified', photo: null, loans: ['l9'] },
  { id: 'b10', name: 'Deepa N',       phone: '9911223344', address: '45 Trichy Road, Madurai', guarantor: 'Nair D', rating: 3, kyc: 'pending', photo: null, loans: ['l10'] },
];

const SEED_LOANS = [
  { id: 'l1', borrowerId: 'b1', borrowerName: 'Rajan Kumar',   type: 'daily',    principal: 50000,  interestRate: 10, duration: 100, installment: 550,  total: 55000, startDate: d(-30), status: 'active',   collectedAmount: 16500,  staff: 'Collector 1' },
  { id: 'l2', borrowerId: 'b2', borrowerName: 'Meena Devi',    type: 'weekly',   principal: 25000,  interestRate: 8,  duration: 12,  installment: 2250, total: 27000, startDate: d(-60), status: 'active',   collectedAmount: 22500,  staff: 'Collector 2' },
  { id: 'l3', borrowerId: 'b3', borrowerName: 'Selvam P',      type: 'monthly',  principal: 100000, interestRate: 18, duration: 12,  installment: 9168, total: 110016,startDate: d(-90), status: 'active',   collectedAmount: 27504,  staff: 'Collector 1' },
  { id: 'l4', borrowerId: 'b1', borrowerName: 'Rajan Kumar',   type: 'daily',    principal: 20000,  interestRate: 10, duration: 100, installment: 220,  total: 22000, startDate: d(-120),status: 'closed',   collectedAmount: 22000,  staff: 'Collector 1' },
  { id: 'l5', borrowerId: 'b4', borrowerName: 'Priya Lakshmi', type: 'interest_only', principal: 200000, interestRate: 2, duration: 6, installment: 4000, total: 224000, startDate: d(-10), status: 'active', collectedAmount: 8000, staff: 'Collector 2' },
  { id: 'l6', borrowerId: 'b5', borrowerName: 'Murugan S',     type: 'daily',    principal: 15000,  interestRate: 12, duration: 100, installment: 168,  total: 16800, startDate: d(-45), status: 'defaulted',collectedAmount: 5040,   staff: 'Collector 1' },
  { id: 'l7', borrowerId: 'b6', borrowerName: 'Anitha R',      type: 'weekly',   principal: 30000,  interestRate: 9,  duration: 26,  installment: 1280, total: 33280, startDate: d(-20), status: 'active',   collectedAmount: 3840,   staff: 'Collector 2' },
  { id: 'l8', borrowerId: 'b8', borrowerName: 'Saranya M',     type: 'monthly',  principal: 50000,  interestRate: 15, duration: 24,  installment: 2424, total: 58176, startDate: d(-5),  status: 'active',   collectedAmount: 2424,   staff: 'Collector 1' },
  { id: 'l9', borrowerId: 'b9', borrowerName: 'Vijay C',       type: 'enterprise',principal: 500000, interestRate: 14, duration: 36, installment: 17086, total: 615096,startDate: m(-3), status: 'active',  collectedAmount: 51258,  staff: 'Collector 2' },
  { id: 'l10',borrowerId: 'b10',borrowerName: 'Deepa N',       type: 'daily',    principal: 10000,  interestRate: 10, duration: 100, installment: 110,  total: 11000, startDate: d(-7),  status: 'active',   collectedAmount: 770,    staff: 'Collector 1' },
];

const SEED_INSTALLMENTS = [
  // Today's due installments (mix of paid/unpaid/partial)
  { id: 'i1',  loanId: 'l1',  borrowerId: 'b1', borrowerName: 'Rajan Kumar',   phone: '9876543210', dueDate: d(0), amount: 550,   paidAmount: 550,  status: 'paid',    staff: 'Collector 1', type: 'daily' },
  { id: 'i2',  loanId: 'l2',  borrowerId: 'b2', borrowerName: 'Meena Devi',    phone: '8765432109', dueDate: d(0), amount: 2250,  paidAmount: 0,    status: 'unpaid',  staff: 'Collector 2', type: 'weekly' },
  { id: 'i3',  loanId: 'l3',  borrowerId: 'b3', borrowerName: 'Selvam P',      phone: '7654321098', dueDate: d(0), amount: 9168,  paidAmount: 5000, status: 'partial', staff: 'Collector 1', type: 'monthly' },
  { id: 'i4',  loanId: 'l5',  borrowerId: 'b4', borrowerName: 'Priya Lakshmi', phone: '6543210987', dueDate: d(0), amount: 4000,  paidAmount: 4000, status: 'paid',    staff: 'Collector 2', type: 'interest_only' },
  { id: 'i5',  loanId: 'l7',  borrowerId: 'b6', borrowerName: 'Anitha R',      phone: '9876541230', dueDate: d(0), amount: 1280,  paidAmount: 0,    status: 'unpaid',  staff: 'Collector 2', type: 'weekly' },
  { id: 'i6',  loanId: 'l8',  borrowerId: 'b8', borrowerName: 'Saranya M',     phone: '7766554433', dueDate: d(0), amount: 2424,  paidAmount: 0,    status: 'unpaid',  staff: 'Collector 1', type: 'monthly' },
  { id: 'i7',  loanId: 'l10', borrowerId: 'b10',borrowerName: 'Deepa N',       phone: '9911223344', dueDate: d(0), amount: 110,   paidAmount: 110,  status: 'paid',    staff: 'Collector 1', type: 'daily' },
  // Yesterday overdue
  { id: 'i8',  loanId: 'l6',  borrowerId: 'b5', borrowerName: 'Murugan S',     phone: '9988776655', dueDate: d(-2), amount: 168, paidAmount: 0,    status: 'overdue', staff: 'Collector 1', type: 'daily' },
  { id: 'i9',  loanId: 'l9',  borrowerId: 'b9', borrowerName: 'Vijay C',       phone: '6655443322', dueDate: d(-5), amount:17086, paidAmount: 0,   status: 'overdue', staff: 'Collector 2', type: 'enterprise' },
];

// 30-day collection history for charts
const genCollectionHistory = () => Array.from({ length: 30 }, (_, i) => ({
  date: d(i - 29),
  day: new Date(d(i - 29)).toLocaleDateString('en', { weekday: 'short' }),
  amount: Math.round(5000 + Math.random() * 25000),
  target: 20000,
}));

const SEED_EXPENSES = [
  { id: 'e1', category: 'Staff Salary',  amount: 35000, date: d(-30), description: 'April salaries for 3 staff' },
  { id: 'e2', category: 'Fuel',          amount: 3500,  date: d(-15), description: 'Field collection fuel' },
  { id: 'e3', category: 'Office Rent',   amount: 8000,  date: d(-30), description: 'May office rent' },
  { id: 'e4', category: 'Printing',      amount: 1200,  date: d(-7),  description: 'Receipt books & forms' },
  { id: 'e5', category: 'Staff Salary',  amount: 35000, date: d(-60), description: 'March salaries' },
  { id: 'e6', category: 'Miscellaneous', amount: 2300,  date: d(-5),  description: 'Office supplies' },
];

const SEED_CAPITAL = [
  { id: 'c1', amount: 500000, date: d(-120), note: 'Initial capital injection' },
  { id: 'c2', amount: 200000, date: d(-60),  note: 'Second round capital' },
  { id: 'c3', amount: 100000, date: d(-20),  note: 'Working capital top-up' },
];

const SEED_STAFF = [
  { id: 's1', name: 'Arjun Nair',    role: 'admin',       phone: '9001234567', email: 'arjun@vasool.in',  target: 100000, collected: 85000, loans: 8 },
  { id: 's2', name: 'Collector 1',   role: 'collector',   phone: '9001234568', email: 'col1@vasool.in',   target: 60000,  collected: 52000, loans: 5 },
  { id: 's3', name: 'Collector 2',   role: 'collector',   phone: '9001234569', email: 'col2@vasool.in',   target: 50000,  collected: 38000, loans: 5 },
  { id: 's4', name: 'Kavya Rao',     role: 'manager',     phone: '9001234570', email: 'kavya@vasool.in',  target: 80000,  collected: 75000, loans: 6 },
];

// ── Reducer ─────────────────────────────────────────────────────────────────
const initialState = {
  borrowers: SEED_BORROWERS,
  loans: SEED_LOANS,
  installments: SEED_INSTALLMENTS,
  expenses: SEED_EXPENSES,
  capital: SEED_CAPITAL,
  staff: SEED_STAFF,
  collectionHistory: genCollectionHistory(),
  notifications: [
    { id: 'n1', type: 'overdue', message: 'Murugan S missed payment (₹168)', time: '2 days ago', read: false },
    { id: 'n2', type: 'overdue', message: 'Vijay C missed EMI (₹17,086)', time: '5 days ago', read: false },
    { id: 'n3', type: 'payment', message: 'Priya Lakshmi paid ₹4,000', time: 'Today', read: true },
    { id: 'n4', type: 'payment', message: 'Rajan Kumar paid ₹550', time: 'Today', read: true },
  ],
};

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_BORROWER':
      return { ...state, borrowers: [...state.borrowers, { ...action.payload, id: `b${Date.now()}`, loans: [] }] };
    case 'ADD_LOAN': {
      const loan = { ...action.payload, id: `l${Date.now()}`, collectedAmount: 0, status: 'active' };
      const updatedBorrowers = state.borrowers.map(b => b.id === loan.borrowerId ? { ...b, loans: [...b.loans, loan.id] } : b);
      return { ...state, loans: [loan, ...state.loans], borrowers: updatedBorrowers };
    }
    case 'ADD_PAYMENT': {
      const { installmentId, amount, penalty } = action.payload;
      const paid = amount + (penalty || 0);
      return {
        ...state,
        installments: state.installments.map(i =>
          i.id === installmentId ? { ...i, paidAmount: paid, status: paid >= i.amount ? 'paid' : 'partial' } : i
        ),
        loans: state.loans.map(l => {
          const inst = state.installments.find(i => i.id === installmentId);
          return l.id === inst?.loanId ? { ...l, collectedAmount: l.collectedAmount + paid } : l;
        }),
        notifications: [{ id: `n${Date.now()}`, type: 'payment', message: `Payment of ₹${paid.toLocaleString()} recorded`, time: 'Just now', read: false }, ...state.notifications],
      };
    }
    case 'ADD_EXPENSE':
      return { ...state, expenses: [{ ...action.payload, id: `e${Date.now()}` }, ...state.expenses] };
    case 'ADD_CAPITAL':
      return { ...state, capital: [{ ...action.payload, id: `c${Date.now()}` }, ...state.capital] };
    case 'ADD_STAFF':
      return { ...state, staff: [...state.staff, { ...action.payload, id: `s${Date.now()}`, collected: 0, loans: 0 }] };
    case 'MARK_NOTIFICATIONS_READ':
      return { ...state, notifications: state.notifications.map(n => ({ ...n, read: true })) };
    case 'MERGE_BORROWERS': {
      const { keepId, mergeId } = action.payload;
      const keepB = state.borrowers.find(b => b.id === keepId);
      const mergeB = state.borrowers.find(b => b.id === mergeId);
      if (!keepB || !mergeB) return state;

      const mergedLoansList = [...new Set([...keepB.loans, ...mergeB.loans])];
      const updatedBorrowers = state.borrowers
        .map(b => b.id === keepId ? { ...b, loans: mergedLoansList } : b)
        .filter(b => b.id !== mergeId);

      const updatedLoans = state.loans.map(l =>
        l.borrowerId === mergeId ? { ...l, borrowerId: keepId, borrowerName: keepB.name } : l
      );

      const updatedInstallments = state.installments.map(i =>
        i.borrowerId === mergeId ? { ...i, borrowerId: keepId, borrowerName: keepB.name } : i
      );

      return {
        ...state,
        borrowers: updatedBorrowers,
        loans: updatedLoans,
        installments: updatedInstallments,
      };
    }
    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────
const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const derived = useMemo(() => {
    const activeLoans = state.loans.filter(l => l.status === 'active');
    const totalOutstanding = activeLoans.reduce((s, l) => s + (l.total - l.collectedAmount), 0);
    const totalCapital = state.capital.reduce((s, c) => s + c.amount, 0);
    const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
    const totalDisbursed = state.loans.reduce((s, l) => s + l.principal, 0);
    const totalCollected = state.loans.reduce((s, l) => s + l.collectedAmount, 0);
    const todayInstallments = state.installments.filter(i => i.dueDate === d(0));
    const todayCollected = todayInstallments.filter(i => i.status === 'paid').reduce((s, i) => s + i.paidAmount, 0);
    const overdueCount = state.installments.filter(i => i.status === 'overdue').length;
    const unreadNotifications = state.notifications.filter(n => !n.read).length;
    return { activeLoans, totalOutstanding, totalCapital, totalExpenses, totalDisbursed, totalCollected, todayCollected, overdueCount, unreadNotifications };
  }, [state]);

  return (
    <AppDataContext.Provider value={{ state, dispatch, derived }}>
      {children}
    </AppDataContext.Provider>
  );
}

export const useAppData = () => useContext(AppDataContext);
