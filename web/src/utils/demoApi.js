const DEMO_API_STORAGE_KEY = 'dk_demo_data_v1';

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
};

function loadDemoState() {
  try {
    const saved = localStorage.getItem(DEMO_API_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
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
let nextLoanId = 1003;
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

export async function demoFetch(path, options = {}) {
  const url = matchPath(path);
  const pathname = url.pathname;
  const method = (options.method || 'GET').toUpperCase();
  const body = normalizeBody(options);

  if (pathname === '/api/collectors/' && method === 'GET') {
    return makeResponse(state.collectors);
  }

  if (pathname === '/api/loans/' && method === 'GET') {
    return makeResponse(state.loans.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
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
    state.loans = state.loans.filter(l => l.id !== secondary_loan_id);
    saveDemoState(state);
    return makeResponse({ status: 'success', data: primary });
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
    const name = url.searchParams.get('name') || '';
    const matching = state.loans.filter(l => l.customer_name.toLowerCase().includes(name.toLowerCase()));
    return makeResponse(matching);
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
    const amount = Number(body.amount) || 0;
    if (amount <= 0) return makeResponse({ detail: 'Payment amount must be greater than 0' }, 400);
    const payment = {
      id: `p-${++nextPaymentId}`,
      loan_id: loan.id,
      amount,
      payment_method: body.payment_method || 'Cash',
      payment_date: body.payment_date || new Date().toISOString(),
      collector_name: body.collector_name || 'Collector 1',
      collector_phone: body.collector_phone || '+919001234568',
      notes: body.notes || 'Payment recorded',
    };
    loan.collected_amount = Number(loan.collected_amount || 0) + amount;
    loan.pending_amount = Math.max(0, Number(loan.due_amount || 0) - loan.collected_amount);
    loan.status = loan.pending_amount <= 0 ? 'closed' : 'active';
    state.payments.push(payment);
    saveDemoState(state);
    return makeResponse({ status: 'success', data: loan, whatsapp: { notify_admin_url: '', notify_borrower_url: '', message_preview: '' } });
  }

  const collectorPaymentMatch = pathname.match(/^\/api\/collector\/payments\/([^/]+)$/);
  if (collectorPaymentMatch && (method === 'PATCH' || method === 'DELETE')) {
    const payment = state.payments.find(candidate => candidate.id === collectorPaymentMatch[1]);
    if (!payment) return makeResponse({ detail: 'Payment not found' }, 404);

    const loan = state.loans.find(candidate => candidate.id === payment.loan_id);
    if (!loan) return makeResponse({ detail: 'Loan not found' }, 404);

    if (method === 'DELETE') {
      loan.collected_amount = Math.max(0, Number(loan.collected_amount || 0) - Number(payment.amount || 0));
      loan.pending_amount = Math.max(0, Number(loan.due_amount || 0) - loan.collected_amount);
      loan.status = loan.pending_amount <= 0 ? 'closed' : 'active';
      state.payments = state.payments.filter(candidate => candidate.id !== payment.id);
      saveDemoState(state);
      return makeResponse({ status: 'success', loan });
    }

    const nextAmount = Number(body.amount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      return makeResponse({ detail: 'Payment amount must be greater than 0' }, 400);
    }
    loan.collected_amount = Math.max(0, Number(loan.collected_amount || 0) - Number(payment.amount || 0) + nextAmount);
    loan.pending_amount = Math.max(0, Number(loan.due_amount || 0) - loan.collected_amount);
    loan.status = loan.pending_amount <= 0 ? 'closed' : 'active';
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

  if (pathname === '/api/auth/request-otp' && method === 'POST') {
    return makeResponse({ status: 'success', dev_mode: true, dev_otp: '123456' });
  }

  if (pathname === '/api/auth/verify-otp' && method === 'POST') {
    return makeResponse({ status: 'success', role: body.role || 'admin', name: body.admin_name || body.collector_name || 'Demo User', phone: body.contact });
  }

  return makeResponse({ detail: 'Demo API endpoint not found' }, 404);
}
