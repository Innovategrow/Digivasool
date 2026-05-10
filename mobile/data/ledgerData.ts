export type LedgerEntryType = 'GAVE' | 'GOT';
export type PartyKind = 'Customer' | 'Supplier';

export type Party = {
  id: string;
  name: string;
  kind: PartyKind;
  phone: string;
  lastActivity: string;
  balance: number;
  outstandingAmount: number;
  reminderDue: string;
  notes: string;
};

export type LedgerTransaction = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  type: LedgerEntryType;
  amount: number;
  outstandingAmount: number;
  dateLabel: string;
  dueDate?: string;
  notes: string;
  interestRateMonthly?: number;
  reminderDays: number[];
};

export type CashbookDay = {
  id: string;
  dateLabel: string;
  dailyBalance: number;
  totalBalance: number;
  cashInHand: number;
  online: number;
};

export type MoreShortcut = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  tint: string;
};

export type ReportItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  target: '/cashbook-report' | '/(admin)';
};

export const businessProfile = {
  name: 'My Business',
  initials: 'MB',
  ownerName: 'Rahul Kumar',
  profileStrength: 72,
};

export const reminderCadenceDays = [5, 7, 10, 60];

export const parties: Party[] = [
  {
    id: 'party-1',
    name: 'Ramesh Traders',
    kind: 'Customer',
    phone: '+91 99990 00111',
    lastActivity: '2 days ago',
    balance: 8200,
    outstandingAmount: 8200,
    reminderDue: 'Day 5 reminder due tomorrow',
    notes: 'Weekly grocery stock on credit',
  },
  {
    id: 'party-2',
    name: 'Priya Textiles',
    kind: 'Customer',
    phone: '+91 99990 00222',
    lastActivity: 'Today',
    balance: 3100,
    outstandingAmount: 3100,
    reminderDue: 'Day 7 reminder scheduled',
    notes: 'Festival order balance still pending',
  },
  {
    id: 'party-3',
    name: 'Metro Packaging',
    kind: 'Supplier',
    phone: '+91 99990 00333',
    lastActivity: '1 week ago',
    balance: -1800,
    outstandingAmount: 0,
    reminderDue: 'No reminder pending',
    notes: 'Payment completed last week',
  },
];

export const ledgerTransactions: LedgerTransaction[] = [
  {
    id: 'tx-1001',
    customerId: 'cust-001',
    customerName: 'Ramesh Traders',
    customerPhone: '+91 99990 00111',
    type: 'GAVE',
    amount: 8200,
    outstandingAmount: 8200,
    dateLabel: '01 Apr 2026',
    dueDate: '10 Apr 2026',
    notes: 'Seed inventory on weekly credit',
    interestRateMonthly: 2.5,
    reminderDays: reminderCadenceDays,
  },
  {
    id: 'tx-1002',
    customerId: 'cust-002',
    customerName: 'Priya Textiles',
    customerPhone: '+91 99990 00222',
    type: 'GAVE',
    amount: 4600,
    outstandingAmount: 3100,
    dateLabel: '03 Apr 2026',
    dueDate: '12 Apr 2026',
    notes: 'Festival stock top-up',
    interestRateMonthly: 1.75,
    reminderDays: reminderCadenceDays,
  },
  {
    id: 'tx-1003',
    customerId: 'cust-003',
    customerName: 'Karan Electronics',
    customerPhone: '+91 99990 00333',
    type: 'GOT',
    amount: 1500,
    outstandingAmount: 0,
    dateLabel: '05 Apr 2026',
    notes: 'Partial repayment received',
    reminderDays: [],
  },
  {
    id: 'tx-1004',
    customerId: 'cust-004',
    customerName: 'Noor Dairy',
    customerPhone: '+91 99990 00444',
    type: 'GAVE',
    amount: 2200,
    outstandingAmount: 2200,
    dateLabel: '06 Apr 2026',
    dueDate: '18 Apr 2026',
    notes: 'Milk route short-term advance',
    interestRateMonthly: 1.2,
    reminderDays: reminderCadenceDays,
  },
];

export const cashbookDays: CashbookDay[] = [
  { id: '30-apr', dateLabel: '30 Apr', dailyBalance: 0, totalBalance: 0, cashInHand: 0, online: 0 },
  { id: '29-apr', dateLabel: '29 Apr', dailyBalance: 2400, totalBalance: 2400, cashInHand: 1600, online: 800 },
  { id: '28-apr', dateLabel: '28 Apr', dailyBalance: -750, totalBalance: 1650, cashInHand: 1250, online: 400 },
  { id: '27-apr', dateLabel: '27 Apr', dailyBalance: 1800, totalBalance: 2400, cashInHand: 900, online: 1500 },
  { id: '26-apr', dateLabel: '26 Apr', dailyBalance: 0, totalBalance: 600, cashInHand: 600, online: 0 },
];

export const moreShortcuts: MoreShortcut[] = [
  { id: 'cashbook', title: 'Cashbook', subtitle: 'Track daily cash', icon: 'account-balance-wallet', tint: '#0B56B3' },
  { id: 'bills', title: 'Bills', subtitle: 'Create and share', icon: 'receipt-long', tint: '#D43B47' },
  { id: 'items', title: 'Items', subtitle: 'Manage stock', icon: 'inventory-2', tint: '#B145C7' },
  { id: 'staff', title: 'Staff', subtitle: 'Roles and access', icon: 'groups', tint: '#A88614' },
  { id: 'collection', title: 'Collection', subtitle: 'Follow up due', icon: 'event-note', tint: '#D59B1A' },
  { id: 'insurance', title: 'Shop Cover', subtitle: 'Protect business', icon: 'verified-user', tint: '#E01382' },
];

export const settingsRows = ['Settings', 'Help & Support', 'About Us', 'Invite Friends'];

export const reportFilters = ['All', 'Customer', 'Bills', 'GST', 'Day-wise'];

export const customerReportItems: ReportItem[] = [
  {
    id: 'customer-transactions',
    title: 'Customer transactions report',
    subtitle: 'Summary of all customer ledger entries',
    icon: 'description',
    target: '/cashbook-report',
  },
  {
    id: 'customer-list',
    title: 'Customer list PDF',
    subtitle: 'Export a clean list for sharing',
    icon: 'picture-as-pdf',
    target: '/cashbook-report',
  },
  {
    id: 'recovery-reminders',
    title: 'Recovery reminder schedule',
    subtitle: 'Track WhatsApp reminder stages',
    icon: 'notifications-active',
    target: '/(admin)',
  },
];

export const durationOptions = ['This Month', 'Single Day', 'Last Week', 'Last Month', 'All', 'Date Range'];

export function formatCurrency(value: number) {
  const prefix = value < 0 ? '-₹ ' : '₹ ';
  return `${prefix}${Math.abs(value).toLocaleString('en-IN')}`;
}

export function getPartySummary(kind: PartyKind) {
  return parties
    .filter((party) => party.kind === kind)
    .reduce(
      (summary, party) => {
        if (party.balance >= 0) {
          summary.youWillGet += party.balance;
        } else {
          summary.youWillGive += Math.abs(party.balance);
        }
        return summary;
      },
      { youWillGive: 0, youWillGet: 0 }
    );
}

export function getCashbookSummary() {
  return cashbookDays.reduce(
    (summary, day) => {
      summary.totalBalance = day.totalBalance;
      summary.todayBalance = cashbookDays[0]?.dailyBalance ?? 0;
      summary.cashInHand += day.cashInHand;
      summary.online += day.online;
      return summary;
    },
    { totalBalance: 0, todayBalance: 0, cashInHand: 0, online: 0 }
  );
}

export function getAdminSummary() {
  const lendings = ledgerTransactions.filter((item) => item.type === 'GAVE');
  const outstanding = lendings.reduce((sum, item) => sum + item.outstandingAmount, 0);
  const averageInterest =
    lendings.reduce((sum, item) => sum + (item.interestRateMonthly ?? 0), 0) / Math.max(lendings.length, 1);

  return {
    activeLendings: lendings.length,
    outstanding,
    averageInterest: Number(averageInterest.toFixed(2)),
  };
}

export const mockLoanRecord = {
  id: 'loan-456',
  customerId: 'cust-109',
  customerName: 'பழனிசாமி டீக்கடை', // Tamil script as requested implicitly
  loanAmount: 25000,
  interestDocument: 5000,
  startDate: '08-03-2026',
  closingDate: '17-05-2026',
  dueAmount: 30000,
  collectedAmount: 2000,
  pendingAmount: 28000,
  status: 'active',
  totalDaysPaid: 0,
  totalDaysNotPaid: 3,
};
