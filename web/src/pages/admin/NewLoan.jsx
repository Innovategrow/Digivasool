import { useState, useMemo } from 'react';
import { useAppData, calcDailyLoan, calcWeeklyLoan, calcMonthlyEMI, calcInterestOnly, generateAmortization } from '../../context/AppDataContext';
import { Check, ChevronRight, User, CreditCard, FileText } from 'lucide-react';

const SCHEMES = [
  { id: 'daily',         icon: '📅', name: 'Daily Collection',  desc: 'Fixed daily installments' },
  { id: 'weekly',        icon: '📆', name: 'Weekly Collection', desc: 'Collected once a week' },
  { id: 'monthly',       icon: '🏦', name: 'Monthly EMI',       desc: 'Reducing balance EMI' },
  { id: 'enterprise',    icon: '🏢', name: 'Enterprise Loan',   desc: 'High-value business loan' },
  { id: 'interest_only', icon: '💹', name: 'Interest Only',     desc: 'Monthly interest, principal at end' },
];

function useCalc(scheme, principal, rate, duration) {
  return useMemo(() => {
    const p = Number(principal) || 0, r = Number(rate) || 0, d = Number(duration) || 1;
    if (!p || !d) return null;
    try {
      if (scheme === 'daily') return calcDailyLoan({ principal: p, interestRate: r, duration: d });
      if (scheme === 'weekly') return calcWeeklyLoan({ principal: p, interestRate: r, weeks: d });
      if (scheme === 'monthly' || scheme === 'enterprise') return calcMonthlyEMI({ principal: p, annualRate: r, months: d });
      if (scheme === 'interest_only') return calcInterestOnly({ principal: p, monthlyRate: r, months: d });
    } catch { return null; }
    return null;
  }, [scheme, principal, rate, duration]);
}

const STEP_LABELS = ['Select Borrower', 'Loan Details', 'Confirm & Disburse'];

export default function NewLoan() {
  const { state, dispatch } = useAppData();
  const [step, setStep] = useState(0);
  const [borrowerId, setBorrowerId] = useState('');
  const [scheme, setScheme] = useState('daily');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('10');
  const [duration, setDuration] = useState('100');
  const [staff, setStaff] = useState('Collector 1');
  const [done, setDone] = useState(false);

  const borrower = state.borrowers.find(b => b.id === borrowerId);
  const calc = useCalc(scheme, principal, rate, duration);
  const schemeObj = SCHEMES.find(s => s.id === scheme);

  const durationLabel = scheme === 'daily' ? 'Days' : scheme === 'weekly' ? 'Weeks' : 'Months';

  const amortization = useMemo(() => {
    if (!calc) return [];
    return generateAmortization({
      type: scheme, startDate: new Date().toISOString().split('T')[0],
      installment: calc.installment, duration: Math.min(Number(duration), 12)
    });
  }, [calc, scheme, duration]);

  function handleDisburse() {
    if (!borrower || !calc) return;
    dispatch({
      type: 'ADD_LOAN',
      payload: {
        borrowerId, borrowerName: borrower.name, type: scheme,
        principal: Number(principal), interestRate: Number(rate),
        duration: Number(duration), installment: calc.installment,
        total: calc.total, startDate: new Date().toISOString().split('T')[0],
        staff,
      }
    });
    setDone(true);
  }

  if (done) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, animation: 'fadeUp .4s ease' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--green-soft)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>✅</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>Loan Disbursed!</div>
      <div style={{ color: 'var(--text-2)', fontSize: 15 }}>₹{Number(principal).toLocaleString()} disbursed to {borrower?.name}</div>
      <button className="btn btn-primary" onClick={() => { setStep(0); setBorrowerId(''); setPrincipal(''); setDone(false); }}>
        Disburse Another Loan
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', animation: 'fadeUp .4s ease' }}>
      <div className="page-header">
        <div>
          <div className="page-title">New Loan Disbursement</div>
          <div className="page-subtitle">Complete all steps to disburse a loan</div>
        </div>
      </div>

      {/* Step Progress */}
      <div className="wizard-steps" style={{ marginBottom: 32 }}>
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="wizard-step">
            <div className={`wizard-step-dot ${i < step ? 'done' : i === step ? 'active' : 'pending'}`}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            <div className="wizard-step-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 28 }}>
        {/* Step 0: Select Borrower */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={18} style={{ color: 'var(--brand-light)' }} /> Select Borrower
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {state.borrowers.map(b => (
                <div key={b.id} onClick={() => setBorrowerId(b.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12,
                  border: `2px solid ${borrowerId === b.id ? 'var(--brand)' : 'var(--border)'}`,
                  background: borrowerId === b.id ? 'var(--brand-soft)' : 'var(--surface-2)',
                  cursor: 'pointer', transition: 'all .2s',
                }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--brand-light)' }}>
                    {b.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{b.phone} · {b.loans.length} loan(s)</div>
                  </div>
                  {borrowerId === b.id && <Check size={18} style={{ color: 'var(--green)' }} />}
                </div>
              ))}
            </div>
            <button className="btn btn-primary w-full" style={{ marginTop: 20 }} disabled={!borrowerId} onClick={() => setStep(1)}>
              Next: Loan Details <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 1: Loan Details */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={18} style={{ color: 'var(--brand-light)' }} /> Loan Scheme & Details
            </div>

            {/* Scheme Selection */}
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Loan Type</label>
              <div className="scheme-grid">
                {SCHEMES.map(s => (
                  <div key={s.id} className={`scheme-card ${scheme === s.id ? 'selected' : ''}`} onClick={() => setScheme(s.id)}>
                    <div className="scheme-icon">{s.icon}</div>
                    <div className="scheme-name">{s.name}</div>
                    <div className="scheme-desc">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Principal Amount (₹)</label>
                <input className="form-input" type="number" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="e.g. 50000" />
              </div>
              <div className="form-group">
                <label className="form-label">Interest Rate (%)</label>
                <input className="form-input" type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 10" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Duration ({durationLabel})</label>
                <input className="form-input" type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 100" />
              </div>
              <div className="form-group">
                <label className="form-label">Assigned Staff</label>
                <select className="form-input" value={staff} onChange={e => setStaff(e.target.value)}>
                  {state.staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Auto Calculation */}
            {calc && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: 20, marginBottom: 20, border: '1px solid var(--brand-soft)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-light)', marginBottom: 14 }}>📊 Auto-Calculated Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {[
                    { label: 'Processing Fee', value: `₹${calc.processingFee.toLocaleString()}`, color: 'var(--amber)' },
                    { label: 'Net Disbursement', value: `₹${calc.netDisbursement.toLocaleString()}`, color: 'var(--green)' },
                    { label: `Per ${durationLabel.slice(0,-1)}`, value: `₹${calc.installment.toLocaleString()}`, color: 'var(--brand-light)' },
                    { label: 'Total Repayable', value: `₹${calc.total.toLocaleString()}`, color: 'var(--text)' },
                    { label: 'Interest Earned', value: `₹${(calc.total - Number(principal)).toLocaleString()}`, color: 'var(--pink)' },
                    { label: 'Duration', value: `${duration} ${durationLabel}`, color: 'var(--cyan)' },
                  ].map(i => (
                    <div key={i.label} style={{ background: 'var(--surface)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{i.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: i.color }}>{i.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => setStep(0)}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={!calc} onClick={() => setStep(2)}>
                Next: Review Schedule <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Amortization + Confirm */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} style={{ color: 'var(--brand-light)' }} /> Confirm & Disburse
            </div>

            <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: 16, marginBottom: 20, border: '1px solid var(--border-2)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Borrower', value: borrower?.name },
                  { label: 'Scheme', value: schemeObj?.name },
                  { label: 'Principal', value: `₹${Number(principal).toLocaleString()}` },
                  { label: 'Net Amount', value: `₹${calc?.netDisbursement.toLocaleString()}` },
                  { label: 'Installment', value: `₹${calc?.installment.toLocaleString()}/${durationLabel.toLowerCase().slice(0,-1)}` },
                  { label: 'Total Due', value: `₹${calc?.total.toLocaleString()}` },
                ].map(i => (
                  <div key={i.label}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{i.label}</div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{i.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Amortization Schedule (first 12) */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Repayment Schedule (first {amortization.length} installments)</div>
              <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th>#</th><th>Due Date</th><th>Amount</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {amortization.map(row => (
                      <tr key={row.installmentNo}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>{row.installmentNo}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>{row.dueDate}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700 }}>₹{row.amount.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}><span className="badge badge-amber">UPCOMING</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-success" style={{ flex: 1, fontSize: 15, fontWeight: 800 }} onClick={handleDisburse}>
                ✅ Confirm & Disburse ₹{calc?.netDisbursement.toLocaleString()}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
