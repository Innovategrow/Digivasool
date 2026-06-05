import { useState, useMemo } from 'react';
import { useAppData, ZONES } from '../../context/AppDataContext';
import { Check, ChevronRight, User, CreditCard, FileText, MapPin, UserPlus, Users } from 'lucide-react';
import PhotoCapture from '../../components/PhotoCapture';

const SCHEMES = [
  { id: 'daily',         icon: '📅', name: 'Daily Collection',  desc: 'Fixed daily installments' },
  { id: 'weekly',        icon: '📆', name: 'Weekly Collection', desc: 'Collected once a week' },
  { id: 'monthly',       icon: '🏦', name: 'Monthly EMI',       desc: 'Reducing balance EMI' },
  { id: 'enterprise',    icon: '🏢', name: 'Enterprise Loan',   desc: 'High-value business loan' },
  { id: 'interest_only', icon: '💹', name: 'Interest Only',     desc: 'Monthly interest, principal at end' },
];

const EMPTY_BORROWER = {
  name: '', phone: '', alternate_phone: '', zone: '', address: '',
  shop_name: '', aadhaar_number: '',
  guarantor: '', guarantor_phone: '', guarantor_address: '',
  rating: 4, kyc: 'pending', photo: null,
};

function useCalc(scheme, principal, monthlyInterest, duration) {
  return useMemo(() => {
    const p = Number(principal) || 0;
    const mi = Number(monthlyInterest) || 0;
    const d = Number(duration) || 1;
    if (!p || !d) return null;
    try {
      if (scheme === 'daily') {
        const totalInterest = mi * Math.ceil(d / 30);
        const total = p + totalInterest;
        const installment = Math.round(total / d);
        return { installment, total, processingFee: 0 };
      }
      if (scheme === 'weekly') {
        const months = Math.ceil(d / 4);
        const totalInterest = mi * months;
        const total = p + totalInterest;
        const installment = Math.round(total / d);
        return { installment, total, processingFee: 0 };
      }
      if (scheme === 'monthly' || scheme === 'enterprise') {
        const totalInterest = mi * d;
        const total = p + totalInterest;
        const installment = Math.round(total / d);
        return { installment, total, processingFee: 0 };
      }
      if (scheme === 'interest_only') {
        const total = p + mi * d;
        return { installment: mi, total, processingFee: 0 };
      }
    } catch { return null; }
    return null;
  }, [scheme, principal, monthlyInterest, duration]);
}

function generateAmortization({ type, startDate, installment, duration }) {
  const rows = [];
  const d = new Date(startDate);
  for (let i = 1; i <= Math.min(duration, 12); i++) {
    let due = new Date(d);
    if (type === 'daily') due.setDate(d.getDate() + i);
    else if (type === 'weekly') due.setDate(d.getDate() + i * 7);
    else { due.setMonth(d.getMonth() + i); }
    rows.push({ installmentNo: i, dueDate: due.toISOString().split('T')[0], amount: installment });
  }
  return rows;
}

const STEP_LABELS = ['Borrower', 'Loan Details', 'Confirm & Disburse'];

export default function NewLoan() {
  const { state, dispatch } = useAppData();
  const [step, setStep] = useState(0);

  // Borrower selection / creation
  const [borrowerMode, setBorrowerMode] = useState('existing'); // 'existing' | 'new'
  const [borrowerId, setBorrowerId] = useState('');
  const [newBorrower, setNewBorrower] = useState(EMPTY_BORROWER);
  const setNB = (k, v) => setNewBorrower(f => ({ ...f, [k]: v }));

  // Loan details
  const [scheme, setScheme] = useState('daily');
  const [principal, setPrincipal] = useState('');
  const [monthlyInterest, setMonthlyInterest] = useState('');
  const [fieldVisit, setFieldVisit] = useState('');
  const [docFee, setDocFee] = useState('');
  const [processingFee, setProcessingFee] = useState('');
  const [duration, setDuration] = useState('100');
  const [staff, setStaff] = useState('Collector 1');
  const [done, setDone] = useState(false);

  const existingBorrower = state.borrowers.find(b => b.id === borrowerId);
  const isNew = borrowerMode === 'new';
  const borrowerName = isNew ? newBorrower.name : existingBorrower?.name;
  const borrowerZone = isNew ? newBorrower.zone : existingBorrower?.zone;

  const calc = useCalc(scheme, principal, monthlyInterest, duration);
  const schemeObj = SCHEMES.find(s => s.id === scheme);
  const durationLabel = scheme === 'daily' ? 'Days' : scheme === 'weekly' ? 'Weeks' : 'Months';

  const totalCharges = [fieldVisit, docFee, processingFee].reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const totalDue = (calc?.total || 0) + totalCharges;

  const borrowerReady = isNew
    ? Boolean(newBorrower.name && newBorrower.phone && newBorrower.zone)
    : Boolean(borrowerId);

  const amortization = useMemo(() => {
    if (!calc) return [];
    return generateAmortization({
      type: scheme, startDate: new Date().toISOString().split('T')[0],
      installment: calc.installment, duration: Math.min(Number(duration), 12),
    });
  }, [calc, scheme, duration]);

  function resetAll() {
    setStep(0); setBorrowerMode('existing'); setBorrowerId('');
    setNewBorrower(EMPTY_BORROWER); setPrincipal(''); setMonthlyInterest('');
    setFieldVisit(''); setDocFee(''); setProcessingFee(''); setDuration('100'); setDone(false);
  }

  function handleDisburse() {
    if (!borrowerReady || !calc) return;
    const loanPayload = {
      type: scheme,
      principal: Number(principal), monthlyInterest: Number(monthlyInterest),
      duration: Number(duration), installment: calc.installment,
      total: totalDue, startDate: new Date().toISOString().split('T')[0],
      staff, fieldVisit: Number(fieldVisit) || 0, docFee: Number(docFee) || 0,
      processingFee: Number(processingFee) || 0,
    };

    if (isNew) {
      dispatch({
        type: 'ADD_BORROWER_WITH_LOAN',
        payload: { borrower: { ...newBorrower }, loan: loanPayload },
      });
    } else {
      dispatch({
        type: 'ADD_LOAN',
        payload: { ...loanPayload, borrowerId, borrowerName: existingBorrower.name },
      });
    }
    setDone(true);
  }

  if (done) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, animation: 'fadeUp .4s ease' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--green-soft)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>✅</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>Loan Disbursed!</div>
      <div style={{ color: 'var(--text-2)', fontSize: 15 }}>₹{Number(principal).toLocaleString()} disbursed to {borrowerName}</div>
      {isNew && <div style={{ color: 'var(--text-2)', fontSize: 13 }}>New borrower added to {borrowerZone} zone (KYC pending — verify on the Borrowers page).</div>}
      <button className="btn btn-primary" onClick={resetAll}>
        Disburse Another Loan
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', animation: 'fadeUp .4s ease' }}>
      <div className="page-header">
        <div>
          <div className="page-title">New Borrower & Loan</div>
          <div className="page-subtitle">Onboard a borrower and disburse their loan in one flow</div>
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
        {/* Step 0: Borrower */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={18} style={{ color: 'var(--brand-light)' }} /> Borrower
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button type="button" onClick={() => setBorrowerMode('existing')}
                className={`btn ${borrowerMode === 'existing' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}>
                <Users size={16} /> Existing Borrower
              </button>
              <button type="button" onClick={() => setBorrowerMode('new')}
                className={`btn ${borrowerMode === 'new' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}>
                <UserPlus size={16} /> New Borrower
              </button>
            </div>

            {borrowerMode === 'existing' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {state.borrowers.map(b => (
                  <div key={b.id} onClick={() => setBorrowerId(b.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12,
                    border: `2px solid ${borrowerId === b.id ? 'var(--brand)' : 'var(--border)'}`,
                    background: borrowerId === b.id ? 'var(--brand-soft)' : 'var(--surface-2)',
                    cursor: 'pointer', transition: 'all .2s',
                  }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--brand-light)', overflow: 'hidden' }}>
                      {b.photo ? <img src={b.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : b.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{b.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{b.phone} · {b.zone || '—'} zone · {b.loans.length} loan(s)</div>
                    </div>
                    {borrowerId === b.id && <Check size={18} style={{ color: 'var(--green)' }} />}
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {/* Photo with live camera */}
                <div style={{ marginBottom: 20 }}>
                  <PhotoCapture value={newBorrower.photo} onChange={v => setNB('photo', v)} label="Add borrower photo (upload or camera)" />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input className="form-input" value={newBorrower.name} onChange={e => setNB('name', e.target.value)} placeholder="e.g. Rajan Kumar" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Shop / Business Name</label>
                    <input className="form-input" value={newBorrower.shop_name} onChange={e => setNB('shop_name', e.target.value)} placeholder="e.g. Rajan Stores" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Primary Phone *</label>
                    <input className="form-input" value={newBorrower.phone} onChange={e => setNB('phone', e.target.value)} placeholder="10-digit mobile" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alternate Phone</label>
                    <input className="form-input" value={newBorrower.alternate_phone} onChange={e => setNB('alternate_phone', e.target.value)} placeholder="Alt number" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} /> Zone *</label>
                    <select className="form-input" value={newBorrower.zone} onChange={e => setNB('zone', e.target.value)}>
                      <option value="">Select zone…</option>
                      {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Aadhaar Number</label>
                    <input className="form-input" value={newBorrower.aadhaar_number} onChange={e => setNB('aadhaar_number', e.target.value)} placeholder="XXXX XXXX XXXX" maxLength={14} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="form-input" value={newBorrower.address} onChange={e => setNB('address', e.target.value)} placeholder="Full address" />
                </div>

                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, margin: '16px 0 10px' }}>Guarantor</div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Guarantor Name</label>
                    <input className="form-input" value={newBorrower.guarantor} onChange={e => setNB('guarantor', e.target.value)} placeholder="Guarantor name" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Guarantor Phone</label>
                    <input className="form-input" value={newBorrower.guarantor_phone} onChange={e => setNB('guarantor_phone', e.target.value)} placeholder="Guarantor phone" />
                  </div>
                </div>
              </div>
            )}

            <button className="btn btn-primary w-full" style={{ marginTop: 20 }} disabled={!borrowerReady} onClick={() => setStep(1)}>
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
                <label className="form-label">Monthly Interest (₹)</label>
                <input className="form-input" type="number" value={monthlyInterest} onChange={e => setMonthlyInterest(e.target.value)} placeholder="e.g. 500" />
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

            <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Charges & Fees (₹)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label className="form-label">Field Visit</label>
                  <input className="form-input" type="number" value={fieldVisit} onChange={e => setFieldVisit(e.target.value)} placeholder="₹0" />
                </div>
                <div>
                  <label className="form-label">Document Fee</label>
                  <input className="form-input" type="number" value={docFee} onChange={e => setDocFee(e.target.value)} placeholder="₹0" />
                </div>
                <div>
                  <label className="form-label">Processing Fee</label>
                  <input className="form-input" type="number" value={processingFee} onChange={e => setProcessingFee(e.target.value)} placeholder="₹0" />
                </div>
              </div>
            </div>

            {calc && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: 20, marginBottom: 20, border: '1px solid var(--brand-soft)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-light)', marginBottom: 14 }}>📊 Auto-Calculated Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  {[
                    { label: `Per ${durationLabel.slice(0,-1)}`, value: `₹${calc.installment.toLocaleString()}`, color: 'var(--brand-light)' },
                    { label: 'Loan + Interest', value: `₹${calc.total.toLocaleString()}`, color: 'var(--text)' },
                    { label: 'Field Visit', value: `₹${(Number(fieldVisit)||0).toLocaleString()}`, color: 'var(--amber)' },
                    { label: 'Document Fee', value: `₹${(Number(docFee)||0).toLocaleString()}`, color: 'var(--amber)' },
                    { label: 'Processing Fee', value: `₹${(Number(processingFee)||0).toLocaleString()}`, color: 'var(--amber)' },
                    { label: 'Total Due', value: `₹${totalDue.toLocaleString()}`, color: 'var(--green)' },
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

        {/* Step 2: Confirm */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} style={{ color: 'var(--brand-light)' }} /> Confirm & Disburse
            </div>

            <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: 16, marginBottom: 20, border: '1px solid var(--border-2)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Borrower', value: borrowerName },
                  { label: 'Zone', value: borrowerZone || '—' },
                  { label: 'Scheme', value: schemeObj?.name },
                  { label: 'Principal', value: `₹${Number(principal).toLocaleString()}` },
                  { label: 'Monthly Interest', value: `₹${Number(monthlyInterest).toLocaleString() || 0}` },
                  { label: 'Installment', value: `₹${calc?.installment.toLocaleString()}/${durationLabel.toLowerCase().slice(0,-1)}` },
                  { label: 'Total Due', value: `₹${totalDue.toLocaleString()}`, highlight: true },
                ].map(i => (
                  <div key={i.label}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{i.label}</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: i.highlight ? 'var(--green)' : undefined }}>{i.value}</div>
                  </div>
                ))}
              </div>

              {isNew && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, fontSize: 12, color: 'var(--text-2)' }}>
                  🆕 New borrower will be created in <strong style={{ color: 'var(--brand-light)' }}>{newBorrower.zone}</strong> zone with KYC <strong>pending</strong>. Verify them from the Borrowers page.
                </div>
              )}

              {totalCharges > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 8 }}>CHARGES BREAKDOWN</div>
                  {[
                    { label: 'Field Visit', value: Number(fieldVisit) || 0 },
                    { label: 'Document Fee', value: Number(docFee) || 0 },
                    { label: 'Processing Fee', value: Number(processingFee) || 0 },
                  ].filter(c => c.value > 0).map(c => (
                    <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-2)' }}>{c.label}</span>
                      <span style={{ color: 'var(--amber)', fontWeight: 700 }}>₹{c.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                ✅ Confirm & Disburse ₹{Number(principal).toLocaleString()}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
