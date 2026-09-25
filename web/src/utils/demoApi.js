const DEMO_API_STORAGE_KEY = 'dk_demo_data_v1';
// Demo mode runs entirely in the browser with sample data — placeholder numbers only.
const DEMO_ADMINS = [
  { name: 'Rahul', phone: '+919000000001' },
];
const ALLOWED_ADMIN_PHONES = DEMO_ADMINS.map(a => a.phone);
const normalizePhone = raw => (raw || '').replace(/\s|-/g, '').replace(/^\+/, '');

function buildWhatsAppUrl(phone, message) {
  const clean = (phone || '').replace(/[+\s-]/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

function buildPaymentWhatsAppLinks(loan, payment, isPaidDay) {
  const dateLabel = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ', ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const collectorTag = payment.collector_name || 'Collector';
  const amountStr = `₹${Number(payment.amount || 0).toLocaleString('en-IN')}`;
  const collectedStr = `₹${Number(loan.collected_amount || 0).toLocaleString('en-IN')}`;
  const remainingStr = `₹${Math.max(0, Number(loan.pending_amount || 0)).toLocaleString('en-IN')}`;
  const paidDays = Number(loan.total_days_paid || 0);
  const notPaidDays = Number(loan.total_days_not_paid || 0);
  const notPaidAmountStr = `₹${(notPaidDays * Number(loan.repayment_amount || 0)).toLocaleString('en-IN')}`;

  const adminMsg = isPaidDay
    ? `✅ *Payment Received*\n👤 Borrower: ${loan.customer_name}\n💰 Amount: ${amountStr}\n💳 Method: ${payment.payment_method}\n👷 Collected by: ${collectorTag}\n🗒 Notes: ${payment.notes || 'None'}\n📅 Date: ${dateLabel}\n📊 Total Paid Days: ${paidDays}\n❌ Not Paid Days: ${notPaidDays}\n🟠 Not Paid Amount: ${notPaidAmountStr}\n💵 Total Paid Amount: ${collectedStr}\n🔴 Remaining Amount: ${remainingStr}`
    : `⚠️ *Not Paid Today*\n👤 Borrower: ${loan.customer_name}\n👷 Visited by: ${collectorTag}\n🗒 Notes: ${payment.notes || 'None'}\n📅 Date: ${dateLabel}\n📊 Total Paid Days: ${paidDays}\n❌ Not Paid Days: ${notPaidDays}\n🟠 Not Paid Amount: ${notPaidAmountStr}\n💵 Total Paid Amount: ${collectedStr}\n🔴 Remaining Amount: ${remainingStr}`;

  const borrowerMsg = isPaidDay
    ? `✅ *Payment Confirmation*\nHello ${loan.customer_name},\nYour payment of ${amountStr} (${payment.payment_method}) has been received.\n📅 Date: ${dateLabel}\n📊 Total Paid Days: ${paidDays}\n❌ Not Paid Days: ${notPaidDays}\n🟠 Not Paid Amount: ${notPaidAmountStr}\n💵 Total Paid Amount: ${collectedStr}\n💰 Remaining Amount: ${remainingStr}\nThank you! — DigiVasool`
    : `⚠️ *Payment Reminder*\nHello ${loan.customer_name},\nWe noted no payment was collected from you today.\n📅 Date: ${dateLabel}\n📊 Total Paid Days: ${paidDays}\n❌ Not Paid Days: ${notPaidDays}\n🟠 Not Paid Amount: ${notPaidAmountStr}\n💵 Total Paid Amount: ${collectedStr}\n💰 Remaining Amount: ${remainingStr}\nThank you! — DigiVasool`;

  return {
    notify_borrower_url: loan.customer_phone ? buildWhatsAppUrl(loan.customer_phone, borrowerMsg) : null,
    notify_admin_urls: DEMO_ADMINS.map(a => ({ name: a.name, phone: a.phone, url: buildWhatsAppUrl(a.phone, adminMsg) })),
    message_preview: adminMsg,
  };
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

const initialState = {
  loans: [
    {
      id: 'l-1001',
      customer_id: 'cust-001',
      customer_name: 'Rajan Kumar',
      customer_email: 'rajan@gmail.com',
      customer_phone: '9876543210',
      customer_address: '12 3rd Street, Gandhipuram, Coimbatore',
      alternate_phone: '9876543211',
      shop_name: 'Rajan Stores',
      aadhaar_number: '123456789012',
      photo_url: '',
      zone: 'Gandhipuram',
      guarantor_name: 'Suresh K',
      guarantor_phone: '9876543212',
      guarantor_address: '14 Gandhi Nagar, Chennai',
      account_number: 'AC001',
      preferred_language: 'en',
      loan_amount: 50000,
      monthly_interest_amount: 2000,
      field_visit_charge: 500,
      document_fee: 200,
      processing_fee: 300,
      due_amount: 53000,
      collected_amount: 15000,
      pending_amount: 38000,
      status: 'active',
      total_days_paid: 3,
      total_days_not_paid: 0,
      repayment_frequency: 'daily',
      repayment_amount: 500,
      start_date: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
      closing_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      created_at: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString(),
    },
    {
      id: 'l-1002',
      customer_id: 'cust-002',
      customer_name: 'Meena Devi',
      customer_email: 'meena@gmail.com',
      customer_phone: '8765432109',
      customer_address: '45 Cross Cut Rd, Gandhipuram, Coimbatore',
      alternate_phone: '',
      shop_name: '',
      aadhaar_number: '987654321098',
      photo_url: '',
      zone: 'Gandhipuram',
      guarantor_name: 'Ramesh M',
      guarantor_phone: '8765432108',
      guarantor_address: '46 Anna Street, Coimbatore',
      account_number: 'AC002',
      preferred_language: 'en',
      loan_amount: 20000,
      monthly_interest_amount: 1000,
      field_visit_charge: 200,
      document_fee: 100,
      processing_fee: 200,
      due_amount: 21500,
      collected_amount: 21500,
      pending_amount: 0,
      status: 'closed',
      total_days_paid: 5,
      total_days_not_paid: 0,
      repayment_frequency: 'weekly',
      repayment_amount: 4300,
      start_date: new Date(new Date().setDate(new Date().getDate() - 60)).toISOString().split('T')[0],
      closing_date: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0],
      created_at: new Date(new Date().setDate(new Date().getDate() - 60)).toISOString(),
    },
  ],
  payments: [
    { id: 'p-1001', loan_id: 'l-1001', amount: 5000, payment_method: 'Cash', payment_date: new Date(new Date().setDate(new Date().getDate() - 25)).toISOString(), collector_name: 'Collector 1', collector_phone: '9001234568', notes: 'First payment' },
    { id: 'p-1002', loan_id: 'l-1001', amount: 10000, payment_method: 'GPay', payment_date: new Date(new Date().setDate(new Date().getDate() - 20)).toISOString(), collector_name: 'Collector 1', collector_phone: '9001234568', notes: 'Second payment' },
    { id: 'p-1003', loan_id: 'l-1002', amount: 21500, payment_method: 'GPay', payment_date: new Date(new Date().setDate(new Date().getDate() - 15)).toISOString(), collector_name: 'Collector 2', collector_phone: '9001234569', notes: 'Full loan closure payment' },
  ],
  collectors: [
    { name: 'Collector 1', phone: '+919001234568' },
    { name: 'Collector 2', phone: '+919001234569' },
  ],
  adminAccessRequests: [],
  approvedAdminPhones: [],
  expenses: [
    { id: 'e1', category: 'Staff Salary', amount: 35000, date: daysAgo(30), description: 'Monthly salaries' },
    { id: 'e2', category: 'Fuel', amount: 3500, date: daysAgo(15), description: 'Field collection fuel' },
    { id: 'e3', category: 'Printing', amount: 1200, date: daysAgo(7), description: 'Receipt books & forms' },
  ],
  capital: [
    { id: 'c1', amount: 500000, date: daysAgo(120), note: 'Initial capital' },
  ],
  staff: [
    { id: 'cfg-admin-0', name: 'Rahul', role: 'admin', phone: '+919000000001', email: '', target: 0, source: 'config' },
    { id: 'cfg-collector-0', name: 'Collector 1', role: 'collector', phone: '+919001234568', email: '', target: 60000, source: 'config' },
    { id: 'cfg-collector-1', name: 'Collector 2', role: 'collector', phone: '+919001234569', email: '', target: 50000, source: 'config' },
  ],
};

function loadDemoState() {
  try {
    const saved = localStorage.getItem(DEMO_API_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...initialState,
        ...parsed,
        adminAccessRequests: parsed.adminAccessRequests || [],
        approvedAdminPhones: parsed.approvedAdminPhones || [],
      };
    }
  } catch (error) {
    console.warn('Failed loading demo state', error);
  }
  return initialState;
}

function saveDemoState(state) {
  try {
    localStorage.setItem(DEMO_API_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed saving demo state', error);
  }
}

const state = loadDemoState();
let nextLoanId = state.loans.reduce((highest, loan) => {
  const numericId = Number(String(loan.id).replace(/\D/g, '')) || 0;
  return Math.max(highest, numericId);
}, 1003);
let nextPaymentId = state.payments.reduce((highest, payment) => {
  const numericId = Number(String(payment.id).replace(/\D/g, '')) || 0;
  return Math.max(highest, numericId);
}, 1003);

function makeResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function matchPath(path) {
  const normalized = path.replace(/^(?:https?:\/\/[^/]+)?/, '');
  const url = new URL(normalized, 'http://demo');
  return url;
}

function buildLoanResponse(loan) {
  return {
    status: 'success',
    data: loan,
    sms: {
      send_sms_url: null,
      message_preview: `Hi ${loan.customer_name}, your loan of ₹${loan.loan_amount} has been created. Please repay ₹${loan.repayment_amount || 0} per ${loan.repayment_frequency}.`,
      language: loan.preferred_language || 'en',
    },
  };
}

function sanitizeLoanInput(body) {
  const now = new Date().toISOString();
  const monthlyInterest = Number(body.monthly_interest_amount) || 0;
  const loanAmount = Number(body.loan_amount) || 0;
  const fieldVisit = Number(body.field_visit_charge) || 0;
  const documentFee = Number(body.document_fee) || 0;
  const processingFee = Number(body.processing_fee) || 0;
  const dueAmount = loanAmount;
  return {
    id: `l-${++nextLoanId}`,
    customer_id: body.customer_id || `CUST-${Date.now()}`,
    customer_name: body.customer_name || 'Unknown',
    customer_email: body.customer_email || '',
    customer_phone: body.customer_phone || '',
    customer_address: body.customer_address || '',
    alternate_phone: body.alternate_phone || '',
    shop_name: body.shop_name || '',
    aadhaar_number: body.aadhaar_number || '',
    photo_url: body.photo_url || '',
    zone: body.zone || '',
    guarantor_name: body.guarantor_name || '',
    guarantor_phone: body.guarantor_phone || '',
    guarantor_address: body.guarantor_address || '',
    account_number: `AC${String(nextLoanId).padStart(3, '0')}`,
    preferred_language: body.preferred_language || 'en',
    loan_amount: loanAmount,
    monthly_interest_amount: monthlyInterest,
    field_visit_charge: fieldVisit,
    document_fee: documentFee,
    processing_fee: processingFee,
    due_amount: dueAmount,
    collected_amount: 0,
    pending_amount: dueAmount,
    status: 'active',
    total_days_paid: 0,
    total_days_not_paid: 0,
    repayment_frequency: body.repayment_frequency || 'monthly',
    repayment_amount: Number(body.repayment_amount) || 0,
    start_date: body.start_date || new Date().toISOString().split('T')[0],
    closing_date: body.closing_date || new Date().toISOString().split('T')[0],
    created_at: now,
  };
}

function computeStats() {
  const active_loans = state.loans.filter(l => l.status === 'active').length;
  const total_outstanding = state.loans.reduce((sum, l) => sum + (Number(l.pending_amount) || 0), 0);
  const total_collected = state.loans.reduce((sum, l) => sum + (Number(l.collected_amount) || 0), 0);
  const recovery_rate = total_outstanding + total_collected > 0
    ? Math.round((total_collected / (total_collected + total_outstanding)) * 100)
    : 0;
  return { active_loans, total_outstanding, total_collected, recovery_rate };
}

function normalizeBody(options) {
  if (!options || !options.body) return {};
  try {
    return JSON.parse(options.body);
  } catch {
    return {};
  }
}

const ALLOWED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function samePhone(a, b) {
  const clean = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 12 && d.startsWith('91') ? d.slice(2) : d; };
  return Boolean(clean(a)) && clean(a) === clean(b);
}

function findBorrowerLoan(phone) {
  return state.loans.find(l => !['deleted', 'merged'].includes(l.status) && (samePhone(l.customer_phone, phone) || samePhone(l.alternate_phone, phone)));
}

function currentDemoUser() {
  try { return JSON.parse(localStorage.getItem('dk_user') || 'null'); } catch { return null; }
}

export async function demoFetch(path, options = {}) {
  const url = matchPath(path);
  const pathname = url.pathname;
  const method = (options.method || 'GET').toUpperCase();

  const proofUploadMatch = pathname.match(/^\/api\/payments\/([^/]+)\/proof$/);
  if (proofUploadMatch && method === 'POST') {
    const payment = state.payments.find(p => p.id === proofUploadMatch[1]);
    if (!payment) return makeResponse({ detail: 'Payment not found' }, 404);
    const file = options.body instanceof FormData ? options.body.get('file') : null;
    if (!file) return makeResponse({ detail: 'No file provided' }, 400);
    if (file.type && !ALLOWED_PROOF_TYPES.includes(file.type)) {
      return makeResponse({ detail: 'Only image or PDF files are allowed' }, 400);
    }
    const dataUrl = await readFileAsDataUrl(file);
    payment.proof_url = dataUrl;
    payment.proof_filename = file.name;
    saveDemoState(state);
    return makeResponse({ status: 'success', data: payment });
  }

  const body = normalizeBody(options);

  if (pathname === '/api/collectors/' && method === 'GET') {
    return makeResponse(state.collectors.map(c => ({ name: c.name })));
  }

  if (pathname === '/api/admin/audit-log' && method === 'GET') {
    return makeResponse(state.payments.slice(-10).reverse().map(p => ({
      actor: p.collector_name || 'Collector', action: 'PAYMENT_RECORDED',
      detail: `₹${p.amount} collected`, created_at: p.payment_date,
    })));
  }
  if (pathname === '/api/expenses/' && method === 'GET') return makeResponse(state.expenses);
  if (pathname === '/api/capital/' && method === 'GET') return makeResponse(state.capital);
  if (pathname === '/api/staff/' && method === 'GET') return makeResponse(state.staff);
  if (['/api/expenses/', '/api/capital/', '/api/staff/'].includes(pathname) && method === 'POST') {
    const key = pathname.split('/')[2];
    if (key !== 'staff' && !(Number(body.amount) > 0)) return makeResponse({ detail: 'Amount must be greater than 0' }, 422);
    if (key === 'staff' && String(body.name || '').trim().length < 2) return makeResponse({ detail: 'Name must be at least 2 characters' }, 422);
    const row = { ...body, id: `${key}-${Date.now()}`, created_at: new Date().toISOString(), created_by: 'Demo', ...(key === 'staff' ? { source: 'app' } : {}) };
    state[key] = key === 'staff' ? [...state[key], row] : [row, ...state[key]];
    saveDemoState(state);
    return makeResponse(row);
  }

  if (pathname === '/api/loans/' && method === 'GET') {
    return makeResponse(state.loans.filter(l => !['deleted', 'merged'].includes(l.status)).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
  }

  if (pathname === '/api/loans/deleted' && method === 'GET') {
    const deleted = state.loans
      .filter(l => l.status === 'deleted')
      .slice()
      .sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0));
    return makeResponse(deleted);
  }

  if (pathname === '/api/loans/' && method === 'POST') {
    const loan = sanitizeLoanInput(body);
    state.loans.unshift(loan);
    saveDemoState(state);
    return makeResponse(buildLoanResponse(loan), 201);
  }

  if (pathname === '/api/loans/merge' && method === 'POST') {
    const { primary_loan_id, secondary_loan_id } = body;
    const primary = state.loans.find(l => l.id === primary_loan_id);
    const secondary = state.loans.find(l => l.id === secondary_loan_id);
    if (!primary || !secondary) {
      return makeResponse({ detail: 'One or both loans not found' }, 404);
    }
    primary.loan_amount += Number(secondary.loan_amount) || 0;
    primary.monthly_interest_amount += Number(secondary.monthly_interest_amount) || 0;
    primary.field_visit_charge += Number(secondary.field_visit_charge) || 0;
    primary.document_fee += Number(secondary.document_fee) || 0;
    primary.processing_fee += Number(secondary.processing_fee) || 0;
    primary.due_amount += Number(secondary.due_amount) || 0;
    primary.collected_amount += Number(secondary.collected_amount) || 0;
    primary.pending_amount += Number(secondary.pending_amount) || 0;
    primary.total_days_paid += Number(secondary.total_days_paid) || 0;
    primary.total_days_not_paid += Number(secondary.total_days_not_paid) || 0;
    state.payments.forEach(p => { if (p.loan_id === secondary_loan_id) { p.loan_id = primary_loan_id; p.merged_from_loan_id = secondary_loan_id; } });
    Object.assign(secondary, { previous_status: secondary.status, status: 'merged', merged_into: primary_loan_id, is_deleted: true, deleted_at: new Date().toISOString() });
    saveDemoState(state);
    return makeResponse({ status: 'success', data: primary });
  }

  const loanRestoreMatch = pathname.match(/^\/api\/loans\/([^/]+)\/restore$/);
  if (loanRestoreMatch && method === 'POST') {
    const loan = state.loans.find(candidate => candidate.id === loanRestoreMatch[1]);
    if (!loan) return makeResponse({ detail: 'Loan not found' }, 404);
    if (loan.status !== 'deleted') return makeResponse({ detail: 'Loan is not in the recycle bin' }, 400);
    loan.status = loan.previous_status || 'active';
    loan.previous_status = null;
    loan.is_deleted = false;
    loan.deleted_at = null;
    loan.deleted_by = null;
    saveDemoState(state);
    return makeResponse(loan);
  }

  const loanPermanentDeleteMatch = pathname.match(/^\/api\/loans\/([^/]+)\/permanent$/);
  if (loanPermanentDeleteMatch && method === 'DELETE') {
    const loan = state.loans.find(candidate => candidate.id === loanPermanentDeleteMatch[1]);
    if (!loan) return makeResponse({ detail: 'Loan not found' }, 404);
    if (loan.status !== 'deleted') return makeResponse({ detail: 'Only loans in the recycle bin can be permanently deleted' }, 400);
    if (state.payments.some(payment => payment.loan_id === loan.id)) {
      return makeResponse({ detail: 'This borrower has payment history, so it cannot be erased. It stays safely archived in the Recycle Bin.' }, 409);
    }
    state.loans = state.loans.filter(candidate => candidate.id !== loan.id);
    saveDemoState(state);
    return makeResponse({ status: 'success', message: 'Loan permanently deleted' });
  }

  const loanCloseMatch = pathname.match(/^\/api\/loans\/([^/]+)\/close$/);
  if (loanCloseMatch && method === 'POST') {
    const loan = state.loans.find(candidate => candidate.id === loanCloseMatch[1]);
    if (!loan) return makeResponse({ detail: 'Loan not found' }, 404);
    if (Number(loan.pending_amount || 0) > 0) {
      return makeResponse({ detail: 'Loan still has a pending amount' }, 400);
    }
    loan.status = 'closed';
    saveDemoState(state);
    return makeResponse({ status: 'success', data: loan, message: 'Loan marked as closed' });
  }

  if (pathname === '/api/loans/stats' && method === 'GET') {
    return makeResponse(computeStats());
  }

  if (pathname.startsWith('/api/loans/by-customer') && method === 'GET') {
    const me = currentDemoUser();
    const active = state.loans.filter(l => !['deleted', 'merged'].includes(l.status));
    const matching = me?.role === 'borrower'
      ? active.filter(l => samePhone(l.customer_phone, me.phone) || samePhone(l.alternate_phone, me.phone))
      : active.filter(l => l.customer_name.toLowerCase().includes((url.searchParams.get('name') || '').toLowerCase()));
    return matching.length ? makeResponse(matching) : makeResponse({ detail: 'No loans found' }, 404);
  }

  const loanIdMatch = pathname.match(/^\/api\/loans\/([^/]+)$/);
  if (loanIdMatch && method === 'PATCH') {
    const loan = state.loans.find(candidate => candidate.id === loanIdMatch[1]);
    if (!loan) return makeResponse({ detail: 'Loan not found' }, 404);
    if (loan.status === 'deleted') return makeResponse({ detail: 'Cannot edit a borrower in the recycle bin' }, 400);
    if ('customer_name' in body && String(body.customer_name || '').trim().length < 2) {
      return makeResponse({ detail: 'Full name must be at least 2 characters' }, 422);
    }
    const EDITABLE_FIELDS = [
      'customer_name', 'customer_email', 'customer_phone', 'customer_address',
      'alternate_phone', 'shop_name', 'aadhaar_number', 'photo_url', 'zone',
      'guarantor_name', 'guarantor_phone', 'guarantor_address', 'preferred_language',
    ];
    EDITABLE_FIELDS.forEach(field => {
      if (field in body) loan[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
    });
    loan.updated_at = new Date().toISOString();
    loan.updated_by = currentDemoUser()?.name || 'Demo';
    saveDemoState(state);
    return makeResponse(loan);
  }

  if (loanIdMatch && method === 'DELETE') {
    const loan = state.loans.find(candidate => candidate.id === loanIdMatch[1]);
    if (!loan) return makeResponse({ detail: 'Loan not found' }, 404);
    if (loan.status === 'deleted') return makeResponse({ detail: 'Borrower is already deleted' }, 400);
    loan.previous_status = loan.status;
    loan.status = 'deleted';
    loan.is_deleted = true;
    loan.deleted_at = new Date().toISOString();
    loan.deleted_by = currentDemoUser()?.name || 'Demo';
    saveDemoState(state);
    return makeResponse({ status: 'success', message: 'Loan moved to recycle bin' });
  }

  if (pathname === '/api/collector/payments' && method === 'GET') {
    const collectorName = url.searchParams.get('collector_name') || '';
    const payments = state.payments
      .filter(payment => !collectorName || payment.collector_name === collectorName)
      .map(payment => {
        const loan = state.loans.find(candidate => candidate.id === payment.loan_id);
        return {
          ...payment,
          customer_name: loan?.customer_name || 'Unknown customer',
          customer_phone: loan?.customer_phone || '',
        };
      })
      .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
    return makeResponse(payments);
  }

  const loanPaymentsMatch = pathname.match(/^\/api\/loans\/([^/]+)\/payments$/);
  if (loanPaymentsMatch && method === 'GET') {
    const loanId = loanPaymentsMatch[1];
    const payments = state.payments.filter(p => p.loan_id === loanId);
    return makeResponse(payments);
  }

  if (loanPaymentsMatch && method === 'POST') {
    const loanId = loanPaymentsMatch[1];
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) return makeResponse({ detail: 'Loan not found' }, 404);
    if (['deleted', 'merged'].includes(loan.status)) return makeResponse({ detail: 'This borrower has been deleted. Payments cannot be recorded.' }, 400);
    const idemKey = (options.headers || {})['Idempotency-Key'];
    if (idemKey && state.idempotency?.[idemKey]) return makeResponse(state.idempotency[idemKey]);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) return makeResponse({ detail: 'Payment amount must be 0 or greater' }, 400);
    const isPaidDay = amount > 0;
    const payment = {
      id: `p-${++nextPaymentId}`,
      loan_id: loan.id,
      amount,
      payment_method: body.payment_method || 'Cash',
      payment_date: body.payment_date || new Date().toISOString(),
      collector_name: body.collector_name || 'Collector 1',
      collector_phone: body.collector_phone || '+919001234568',
      notes: body.notes || (isPaidDay ? 'Payment recorded' : 'Not paid today'),
    };
    loan.collected_amount = Number(loan.collected_amount || 0) + amount;
    loan.pending_amount = Math.max(0, Number(loan.due_amount || 0) - loan.collected_amount);
    loan.status = loan.pending_amount <= 0 ? 'closed' : 'active';
    loan.total_days_paid = Number(loan.total_days_paid || 0) + (isPaidDay ? 1 : 0);
    loan.total_days_not_paid = Number(loan.total_days_not_paid || 0) + (isPaidDay ? 0 : 1);
    state.payments.push(payment);
    saveDemoState(state);
    const whatsapp = buildPaymentWhatsAppLinks(loan, payment, isPaidDay);
    const result = { status: 'success', data: loan, whatsapp, payment };
    if (idemKey) {
      state.idempotency = { ...(state.idempotency || {}), [idemKey]: result };
      saveDemoState(state);
    }
    return makeResponse(result);
  }

  const collectorPaymentMatch = pathname.match(/^\/api\/collector\/payments\/([^/]+)$/);
  if (collectorPaymentMatch && (method === 'PATCH' || method === 'DELETE')) {
    const payment = state.payments.find(candidate => candidate.id === collectorPaymentMatch[1]);
    if (!payment) return makeResponse({ detail: 'Payment not found' }, 404);

    const loan = state.loans.find(candidate => candidate.id === payment.loan_id);
    if (!loan) return makeResponse({ detail: 'Loan not found' }, 404);

    if (method === 'DELETE') {
      const wasPaidDay = Number(payment.amount || 0) > 0;
      loan.collected_amount = Math.max(0, Number(loan.collected_amount || 0) - Number(payment.amount || 0));
      loan.pending_amount = Math.max(0, Number(loan.due_amount || 0) - loan.collected_amount);
      loan.status = loan.pending_amount <= 0 ? 'closed' : 'active';
      loan.total_days_paid = Math.max(0, Number(loan.total_days_paid || 0) - (wasPaidDay ? 1 : 0));
      loan.total_days_not_paid = Math.max(0, Number(loan.total_days_not_paid || 0) - (wasPaidDay ? 0 : 1));
      state.payments = state.payments.filter(candidate => candidate.id !== payment.id);
      saveDemoState(state);
      return makeResponse({ status: 'success', loan });
    }

    const nextAmount = Number(body.amount);
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      return makeResponse({ detail: 'Payment amount must be 0 or greater' }, 400);
    }
    const wasPaidDay = Number(payment.amount || 0) > 0;
    const isPaidDay = nextAmount > 0;
    loan.collected_amount = Math.max(0, Number(loan.collected_amount || 0) - Number(payment.amount || 0) + nextAmount);
    loan.pending_amount = Math.max(0, Number(loan.due_amount || 0) - loan.collected_amount);
    loan.status = loan.pending_amount <= 0 ? 'closed' : 'active';
    if (wasPaidDay !== isPaidDay) {
      loan.total_days_paid = Math.max(0, Number(loan.total_days_paid || 0) + (isPaidDay ? 1 : -1));
      loan.total_days_not_paid = Math.max(0, Number(loan.total_days_not_paid || 0) + (isPaidDay ? -1 : 1));
    }
    Object.assign(payment, {
      amount: nextAmount,
      payment_method: body.payment_method || payment.payment_method,
      payment_date: body.payment_date || payment.payment_date,
      notes: body.notes ?? payment.notes,
    });
    saveDemoState(state);
    const linkedPayment = {
      ...payment,
      customer_name: loan.customer_name || 'Unknown customer',
      customer_phone: loan.customer_phone || '',
    };
    return makeResponse({ status: 'success', data: linkedPayment, loan });
  }

  if (pathname === '/api/auth/borrower/send-otp' && method === 'POST') {
    return makeResponse({ status: 'success', dev_otp: '123456' });
  }

  if (pathname === '/api/auth/borrower/verify-otp' && method === 'POST') {
    return makeResponse({ status: 'success' });
  }

  const isAllowedAdminPhone = phone => {
    const normalized = normalizePhone(phone);
    return ALLOWED_ADMIN_PHONES.map(normalizePhone).includes(normalized) || state.approvedAdminPhones.includes(normalized);
  };

  if (pathname === '/api/auth/request-otp' && method === 'POST') {
    if (body.role === 'borrower' && !findBorrowerLoan(body.contact)) {
      return makeResponse({ detail: 'No loan account found for this mobile number.' }, 404);
    }
    if (body.role === 'admin' && !isAllowedAdminPhone(body.contact)) {
      if (!body.admin_name || !body.admin_name.trim()) {
        return makeResponse({ detail: 'Please enter your name so an admin can review your request.' }, 400);
      }
      const normalized = normalizePhone(body.contact);
      const existing = state.adminAccessRequests.find(r => r.status === 'pending' && normalizePhone(r.phone) === normalized);
      if (!existing) {
        state.adminAccessRequests.push({
          id: `req-${Date.now()}`,
          name: body.admin_name.trim(),
          phone: (body.contact || '').trim(),
          status: 'pending',
          requested_at: new Date().toISOString(),
        });
        saveDemoState(state);
      }
      return makeResponse({ status: 'pending_approval', message: "Your request has been sent to the admin for approval. You'll be notified once approved." });
    }
    return makeResponse({ status: 'otp_sent', message: 'OTP generated', dev_mode: true, dev_otp: '123456' });
  }

  if (pathname === '/api/auth/verify-otp' && method === 'POST') {
    if (body.role === 'admin' && !isAllowedAdminPhone(body.contact)) {
      return makeResponse({ detail: 'This number is not yet approved for admin access.' }, 403);
    }
    if (body.role === 'borrower') {
      const loan = findBorrowerLoan(body.contact);
      if (!loan) return makeResponse({ detail: 'No loan account found for this mobile number.' }, 404);
      return makeResponse({ role: 'borrower', name: loan.customer_name, phone: body.contact, token: 'demo' });
    }
    return makeResponse({ status: 'success', role: body.role || 'admin', name: body.admin_name || body.collector_name || 'Demo User', phone: body.contact, token: 'demo' });
  }

  if (pathname === '/api/admin/access-requests' && method === 'GET') {
    return makeResponse(state.adminAccessRequests.filter(r => r.status === 'pending'));
  }

  const approveAccessMatch = pathname.match(/^\/api\/admin\/access-requests\/([^/]+)\/approve$/);
  if (approveAccessMatch && method === 'POST') {
    const request = state.adminAccessRequests.find(r => r.id === approveAccessMatch[1]);
    if (!request) return makeResponse({ detail: 'Request not found' }, 404);
    if (request.status === 'pending') {
      request.status = 'approved';
      state.approvedAdminPhones.push(normalizePhone(request.phone));
      saveDemoState(state);
    }
    return makeResponse({ status: 'success', data: request });
  }

  const denyAccessMatch = pathname.match(/^\/api\/admin\/access-requests\/([^/]+)\/deny$/);
  if (denyAccessMatch && method === 'POST') {
    const request = state.adminAccessRequests.find(r => r.id === denyAccessMatch[1]);
    if (!request) return makeResponse({ detail: 'Request not found' }, 404);
    if (request.status === 'pending') {
      request.status = 'denied';
      saveDemoState(state);
    }
    return makeResponse({ status: 'success', data: request });
  }

  return makeResponse({ detail: 'Demo API endpoint not found' }, 404);
}
