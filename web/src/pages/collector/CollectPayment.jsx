import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, isDemoMode, newIdempotencyKey, readError } from '../../utils/api';
import { API_BASE_URL } from '../../config';
import {
  ArrowLeft,
  Banknote,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Check,
  Clock3,
  Download,
  FileText,
  Filter,
  Image as ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Pencil,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';

const money = value => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

function resolveProofUrl(url) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
  return `${API_BASE_URL}${url}`;
}

function buildReportMessage(loan) {
  const notPaidDays = Number(loan.total_days_not_paid || 0);
  const notPaidAmount = notPaidDays * Number(loan.repayment_amount || 0);
  return `Hi ${loan.customer_name}, here is your collection report:\n` +
    `✅ Total Paid Days: ${Number(loan.total_days_paid || 0)}\n` +
    `❌ Not Paid Days: ${notPaidDays}\n` +
    `🟠 Not Paid Amount: ${money(notPaidAmount)}\n` +
    `💰 Total Paid Amount: ${money(loan.collected_amount)}\n` +
    `🔴 Remaining Amount: ${money(loan.pending_amount)}`;
}

function buildWeeklyReportMessage(loan, payments = []) {
  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - 6);
  const weekPayments = payments.filter(p => {
    const d = new Date(p.payment_date);
    return !Number.isNaN(d.getTime()) && d >= windowStart;
  });
  const paidDays = weekPayments.filter(p => Number(p.amount) > 0).length;
  const notPaidDays = weekPayments.filter(p => Number(p.amount) <= 0).length;
  const notPaidAmount = notPaidDays * Number(loan.repayment_amount || 0);
  const paidAmount = weekPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return `Hi ${loan.customer_name}, here is your weekly collection report:\n` +
    `✅ Paid Days (Last 7 Days): ${paidDays}\n` +
    `❌ Not Paid Days (Last 7 Days): ${notPaidDays}\n` +
    `🟠 Not Paid Amount (Last 7 Days): ${money(notPaidAmount)}\n` +
    `💰 Total Paid Amount (Last 7 Days): ${money(paidAmount)}\n` +
    `🔴 Remaining Amount: ${money(loan.pending_amount)}`;
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'C';
}

function timeAgo(dateValue) {
  if (!dateValue) return 'Recently';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diff = Date.now() - date.getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return { date: 'Today', time: '' };
  return {
    date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  };
}

function localDateInputValue(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function paymentDateIso(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

export default function CollectPayment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [activePartyType, setActivePartyType] = useState('customers');
  const [activeDetailTab, setActiveDetailTab] = useState('report');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('balance');
  const [showFilters, setShowFilters] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentDate, setPaymentDate] = useState(localDateInputValue());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [proofUploadingId, setProofUploadingId] = useState(null);
  const receiptRef = useRef(null);
  const proofFileInput = useRef(null);
  const proofInputRefs = useRef({});
  const demo = isDemoMode();
  const paymentKeyRef = useRef(null);
  // A changed entry is a new payment; an unchanged retry keeps its key
  useEffect(() => { paymentKeyRef.current = null; }, [selectedLoan?.id, amount, paymentMethod, paymentDate]);

  async function uploadProof(paymentId, file) {
    if (!paymentId || !file) return;
    setProofUploadingId(paymentId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch(`/api/payments/${paymentId}/proof`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload failed');
      setPayments(current => current.map(p => p.id === paymentId ? { ...p, ...data.data } : p));
      setSuccessData(current => (current?.payment?.id === paymentId) ? { ...current, payment: { ...current.payment, ...data.data } } : current);
    } catch (err) {
      alert('Error uploading proof: ' + err.message);
    } finally {
      setProofUploadingId(null);
    }
  }

  useEffect(() => {
    apiFetch('/api/loans/')
      .then(r => r.json())
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        setLoans(rows.filter(l => l.status === 'active' && Number(l.pending_amount) > 0));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedLoan?.id) return;
    apiFetch(`/api/loans/${selectedLoan.id}/payments`)
      .then(r => r.json())
      .then(data => setPayments(Array.isArray(data) ? data : []))
      .catch(() => setPayments([]));
  }, [selectedLoan?.id]);

  const filteredLoans = useMemo(() => {
    if (activePartyType === 'suppliers') return [];
    const query = searchQuery.trim().toLowerCase();
    let list = loans;
    if (query) {
      list = loans.filter(loan =>
        loan.customer_name?.toLowerCase().includes(query) ||
        loan.customer_phone?.toLowerCase().includes(query) ||
        loan.customer_address?.toLowerCase().includes(query) ||
        loan.zone?.toLowerCase().includes(query)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return (a.customer_name || '').localeCompare(b.customer_name || '');
      if (sortBy === 'recent') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      return Number(b.pending_amount || 0) - Number(a.pending_amount || 0);
    });
  }, [activePartyType, loans, searchQuery, sortBy]);

  const totals = useMemo(() => ({
    due: loans.reduce((sum, loan) => sum + Number(loan.due_amount || 0), 0),
    collected: loans.reduce((sum, loan) => sum + Number(loan.collected_amount || 0), 0),
    remaining: loans.reduce((sum, loan) => sum + Number(loan.pending_amount || 0), 0),
  }), [loans]);

  async function handleSave() {
    if (loading || !selectedLoan || amount === '' || !paymentDate) return;
    // Same key for every retry of this entry, so a slow network or double tap can't record it twice
    if (!paymentKeyRef.current) paymentKeyRef.current = newIdempotencyKey();
    setLoading(true);
    try {
      const res = await apiFetch(`/api/loans/${selectedLoan.id}/payments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': paymentKeyRef.current },
        body: JSON.stringify({
          amount: parseFloat(amount),
          payment_method: paymentMethod,
          payment_date: paymentDateIso(paymentDate),
          collector_name: user.name,
          collector_phone: user.phone || '',
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Payment could not be saved. Please try again.'));
      const data = await res.json();
      paymentKeyRef.current = null;
      setSuccessData({
        ...data,
        amount: parseFloat(amount),
        customerName: selectedLoan.customer_name,
        customerPhone: selectedLoan.customer_phone,
        paymentMethod: data.payment?.payment_method || paymentMethod,
        paymentDate: data.payment?.payment_date || paymentDateIso(paymentDate),
        collectorName: user.name,
      });
      setSelectedLoan(data.data);
      setLoans(prev => prev.map(loan => loan.id === data.data.id ? data.data : loan).filter(loan => Number(loan.pending_amount) > 0));
      apiFetch(`/api/loans/${selectedLoan.id}/payments`)
        .then(historyRes => historyRes.json())
        .then(history => setPayments(Array.isArray(history) ? history : []))
        .catch(() => {});
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function syncUpdatedLoan(updatedLoan) {
    if (!updatedLoan?.id) return;
    setSelectedLoan(updatedLoan);
    setLoans(prev => prev
      .map(loan => loan.id === updatedLoan.id ? updatedLoan : loan)
      .filter(loan => loan.status === 'active' && Number(loan.pending_amount) > 0));
  }

  function startEditingPayment(payment) {
    setEditingPayment({
      ...payment,
      amount: String(payment.amount || ''),
      payment_date: localDateInputValue(payment.payment_date),
      payment_method: payment.payment_method || 'Cash',
      notes: payment.notes || '',
    });
  }

  async function savePaymentEdit() {
    if (!editingPayment || !editingPayment.amount || !editingPayment.payment_date) return;
    const response = await apiFetch(`/api/collector/payments/${editingPayment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        amount: Number(editingPayment.amount),
        payment_method: editingPayment.payment_method,
        payment_date: paymentDateIso(editingPayment.payment_date),
        notes: editingPayment.notes || '',
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.detail || 'Could not update transaction');
      return;
    }
    setPayments(current => current.map(payment => payment.id === data.data.id ? { ...payment, ...data.data } : payment));
    syncUpdatedLoan(data.loan);
    setEditingPayment(null);
  }

  async function deletePayment(payment) {
    if (!window.confirm(`Delete ${money(payment.amount)} from this customer report?`)) return;
    const response = await apiFetch(`/api/collector/payments/${payment.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      alert(data.detail || 'Could not delete transaction');
      return;
    }
    setPayments(current => current.filter(item => item.id !== payment.id));
    syncUpdatedLoan(data.loan);
    if (editingPayment?.id === payment.id) setEditingPayment(null);
  }

  function resetPayment(keepCustomer = false) {
    setSuccessData(null);
    setAmount('');
    setPaymentDate(localDateInputValue());
    setNotes('');
    if (!keepCustomer) setSelectedLoan(null);
  }

  if (successData) {
    const isGPay = successData.paymentMethod === 'GPay' && Number(successData.amount) > 0;
    const whatsapp = successData.whatsapp || {};
    const notifyTargets = [
      ...(whatsapp.notify_borrower_url ? [{ key: 'borrower', label: `Notify ${successData.customerName}`, url: whatsapp.notify_borrower_url }] : []),
      ...(whatsapp.notify_admin_urls || []).map(a => ({ key: a.phone, label: `Notify ${a.name}`, url: a.url })),
    ];
    const notifySection = notifyTargets.length > 0 && (
      <div className="collector-notify-section">
        <div className="collector-notify-label">Notify on WhatsApp</div>
        {notifyTargets.map(target => (
          <a key={target.key} className="collector-notify-btn" href={target.url} target="_blank" rel="noreferrer">
            <MessageCircle size={14} /> {target.label}
          </a>
        ))}
      </div>
    );
    const successActions = (
      <>
        <div className="collector-success-actions">
          <button type="button" className="collector-outline-action" disabled title="Disbursement is not available for collectors yet">
            <Wallet size={18} /> YOU GAVE ₹
          </button>
          <button type="button" className="collector-outline-action active" onClick={() => resetPayment(true)}>
            <Banknote size={18} /> YOU GOT ₹
          </button>
        </div>
        <button className="collector-done-btn" type="button" onClick={() => resetPayment(false)}>DONE</button>
      </>
    );

    if (isGPay) {
      const receiptDate = new Date(successData.paymentDate);
      const receiptId = successData.payment?.id ? String(successData.payment.id).slice(-8).toUpperCase() : '—';
      const remaining = Number(successData.data?.pending_amount ?? 0);
      const dateLabel = Number.isNaN(receiptDate.getTime()) ? '' : receiptDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const shareMessage =
        `🧾 *GPay Payment Receipt*\n` +
        `Receipt No: ${receiptId}\n` +
        `Customer: ${successData.customerName}\n` +
        `Amount: ${money(successData.amount)}\n` +
        `Method: GPay\n` +
        `Date: ${dateLabel}\n` +
        `Collected by: ${successData.collectorName}\n` +
        `Remaining Balance: ${money(remaining)}\n` +
        `— DigiVasool`;
      const shareUrl = successData.customerPhone
        ? `https://wa.me/91${String(successData.customerPhone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(shareMessage)}`
        : '';

      const downloadReceiptImage = async () => {
        if (!receiptRef.current || downloading) return;
        setDownloading('image');
        try {
          const canvas = await html2canvas(receiptRef.current, { backgroundColor: '#ffffff', scale: 2 });
          const link = document.createElement('a');
          link.download = `GPay-Receipt-${receiptId}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        } catch (err) {
          alert('Could not save the receipt image: ' + err.message);
        } finally {
          setDownloading(null);
        }
      };

      const downloadReceiptPdf = async () => {
        if (!receiptRef.current || downloading) return;
        setDownloading('pdf');
        try {
          const canvas = await html2canvas(receiptRef.current, { backgroundColor: '#ffffff', scale: 2 });
          const imgData = canvas.toDataURL('image/jpeg', 0.92);
          const pdf = new jsPDF({ unit: 'px', format: [canvas.width, canvas.height] });
          pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
          pdf.save(`GPay-Receipt-${receiptId}.pdf`);
        } catch (err) {
          alert('Could not save the receipt PDF: ' + err.message);
        } finally {
          setDownloading(null);
        }
      };

      return (
        <div className="collector-phone-page collector-success-page">
          <div className="collector-receipt-card">
            <div ref={receiptRef} className="collector-receipt-printable">
              <div className="collector-receipt-head">
                <Wallet size={26} />
                <h2>GPay Receipt</h2>
                <span>Receipt No. {receiptId}</span>
              </div>
              <div className="collector-receipt-amount">{money(successData.amount)}</div>
              <div className="collector-receipt-rows">
                <div><span>Customer</span><strong>{successData.customerName}</strong></div>
                <div><span>Method</span><strong>GPay</strong></div>
                <div><span>Date</span><strong>{dateLabel}</strong></div>
                <div><span>Collected by</span><strong>{successData.collectorName}</strong></div>
                <div><span>Remaining Balance</span><strong>{money(remaining)}</strong></div>
              </div>
            </div>
            {shareUrl && (
              <a className="collector-receipt-share" href={shareUrl} target="_blank" rel="noreferrer">
                <MessageCircle size={16} /> Share Receipt on WhatsApp
              </a>
            )}
            <div className="collector-receipt-download-row">
              <button type="button" className="collector-receipt-download-btn" disabled={!!downloading} onClick={downloadReceiptImage}>
                <ImageIcon size={15} /> {downloading === 'image' ? 'Saving...' : 'Save as Image'}
              </button>
              <button type="button" className="collector-receipt-download-btn" disabled={!!downloading} onClick={downloadReceiptPdf}>
                <Download size={15} /> {downloading === 'pdf' ? 'Saving...' : 'Save as PDF'}
              </button>
            </div>
            <input
              ref={proofFileInput}
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file && successData.payment?.id) uploadProof(successData.payment.id, file);
              }}
            />
            {successData.payment?.proof_url ? (
              <a className="collector-proof-status uploaded" href={resolveProofUrl(successData.payment.proof_url)} target="_blank" rel="noreferrer">
                <Check size={14} /> Proof uploaded{successData.payment.proof_filename ? `: ${successData.payment.proof_filename}` : ''}
              </a>
            ) : (
              <button
                type="button"
                className="collector-proof-upload-btn"
                disabled={proofUploadingId === successData.payment?.id}
                onClick={() => proofFileInput.current?.click()}
              >
                <Upload size={15} /> {proofUploadingId === successData.payment?.id ? 'Uploading...' : 'Upload Payment Proof (from borrower)'}
              </button>
            )}
          </div>
          {notifySection}
          {successActions}
        </div>
      );
    }

    return (
      <div className="collector-phone-page collector-success-page">
        <div className="collector-success-check"><CheckCircle2 size={52} /></div>
        <h1>Transaction saved</h1>
        <div className="collector-success-amount">{money(successData.amount)}</div>
        <p>Add another transaction for<br /><strong>{successData.customerName}</strong>?</p>
        {notifySection}
        {successActions}
      </div>
    );
  }

  if (selectedLoan) {
    const progress = Math.min((Number(selectedLoan.collected_amount || 0) / Number(selectedLoan.due_amount || 1)) * 100, 100);
    const whatsappUrl = selectedLoan.customer_phone
      ? `https://wa.me/91${String(selectedLoan.customer_phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(buildReportMessage(selectedLoan))}`
      : '';
    const weeklyWhatsappUrl = selectedLoan.customer_phone
      ? `https://wa.me/91${String(selectedLoan.customer_phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(buildWeeklyReportMessage(selectedLoan, payments))}`
      : '';

    return (
      <div className="collector-phone-page">
        <header className="collector-detail-header">
          <button className="collector-icon-btn" type="button" onClick={() => setSelectedLoan(null)}><ArrowLeft size={21} /></button>
          <div>
            <h1>{selectedLoan.customer_name}</h1>
            <button type="button">View settings</button>
          </div>
          {selectedLoan.customer_phone ? (
            <a className="collector-icon-btn" href={`tel:${selectedLoan.customer_phone}`}><Phone size={20} /></a>
          ) : (
            <button className="collector-icon-btn" type="button"><MoreHorizontal size={20} /></button>
          )}
        </header>

        <section className="collector-amount-card">
          <div>
            <span>You will get</span>
            <strong>{money(selectedLoan.pending_amount)}</strong>
          </div>
          <div className="collector-progress-track"><div style={{ width: `${progress}%` }} /></div>
          <div className="collector-reminder-row">
            <span>Set collection reminder</span>
            <button type="button" onClick={() => setActiveDetailTab('reminder')}>SET DATE</button>
          </div>
        </section>

        <section className="collector-payment-entry">
          <div className="collector-amount-input">
            <span>₹</span>
            <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>
          <button type="button" className="collector-not-paid-toggle" onClick={() => setAmount('0')}>
            Customer didn't pay today? Mark as ₹0
          </button>
          <div className="collector-method-row">
            {['Cash', 'GPay'].map(method => (
              <button key={method} className={paymentMethod === method ? 'active' : ''} type="button" onClick={() => setPaymentMethod(method)}>
                {method === 'Cash' ? <Banknote size={17} /> : <Wallet size={17} />} {method}
              </button>
            ))}
          </div>
          <label className="collector-date-input">
            <Calendar size={17} />
            <span>Payment date</span>
            <input
              type="date"
              value={paymentDate}
              max={localDateInputValue()}
              onChange={e => setPaymentDate(e.target.value)}
            />
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} />
          <button className="collector-primary-action" type="button" disabled={loading || amount === '' || !paymentDate} onClick={handleSave}>
            <CheckCircle2 size={18} /> {loading ? 'Saving...' : Number(amount) > 0 ? `YOU GOT ${money(amount)}` : 'SAVE — NOT PAID TODAY'}
          </button>
        </section>

        <div className="collector-detail-tabs">
          {[
            { id: 'report', icon: FileText, label: 'Report' },
            { id: 'reminder', icon: Calendar, label: 'Reminder' },
            { id: 'sms', icon: Send, label: 'SMS' },
          ].map(tab => {
            const TabIcon = tab.icon;
            return (
              <button key={tab.id} className={activeDetailTab === tab.id ? 'active' : ''} type="button" onClick={() => setActiveDetailTab(tab.id)}>
                <TabIcon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>

        {activeDetailTab === 'report' && (
          <section className="collector-history-list">
            {editingPayment && (
              <div className="collector-inline-edit">
                <div className="collector-inline-edit-head">
                  <strong>Edit transaction</strong>
                  <button type="button" title="Cancel editing" onClick={() => setEditingPayment(null)}><X size={16} /></button>
                </div>
                <div className="collector-inline-edit-grid">
                  <label>Amount<input type="number" min="0" value={editingPayment.amount} onChange={e => setEditingPayment({ ...editingPayment, amount: e.target.value })} /></label>
                  <label>Date<input type="date" max={localDateInputValue()} value={editingPayment.payment_date} onChange={e => setEditingPayment({ ...editingPayment, payment_date: e.target.value })} /></label>
                  <label>Method<select value={editingPayment.payment_method} onChange={e => setEditingPayment({ ...editingPayment, payment_method: e.target.value })}><option>Cash</option><option>GPay</option></select></label>
                  <label>Notes<input value={editingPayment.notes} onChange={e => setEditingPayment({ ...editingPayment, notes: e.target.value })} /></label>
                </div>
                <button className="collector-inline-save" type="button" onClick={savePaymentEdit}><Check size={15} /> SAVE</button>
              </div>
            )}
            {payments.length === 0 ? (
              <div className="collector-empty">No transactions recorded yet.</div>
            ) : payments.slice().reverse().map(payment => {
              const when = formatDate(payment.payment_date);
              const isGPayPayment = payment.payment_method === 'GPay';
              return (
                <div key={payment.id} className="collector-history-row">
                  <div className="collector-history-row-main">
                    <div>
                      <strong>{when.date}</strong>
                      <span>{when.time || 'Payment'}</span>
                    </div>
                    <div>
                      <span className="collector-got-label">{Number(payment.amount) > 0 ? 'YOU GOT' : 'NOT PAID'}</span>
                      <strong>{money(payment.amount)}</strong>
                      {demo && (
                        <div className="collector-row-actions">
                          <button type="button" title="Edit transaction" onClick={() => startEditingPayment(payment)}><Pencil size={13} /></button>
                          <button type="button" title="Delete transaction" onClick={() => deletePayment(payment)}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                  {isGPayPayment && (
                    <div className="collector-row-proof">
                      <input
                        ref={el => { proofInputRefs.current[payment.id] = el; }}
                        type="file"
                        accept="image/*,application/pdf"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) uploadProof(payment.id, file);
                        }}
                      />
                      {payment.proof_url ? (
                        <a className="collector-proof-chip done" href={resolveProofUrl(payment.proof_url)} target="_blank" rel="noreferrer">
                          <Check size={12} /> Proof attached
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="collector-proof-chip"
                          disabled={proofUploadingId === payment.id}
                          onClick={() => proofInputRefs.current[payment.id]?.click()}
                        >
                          <Upload size={12} /> {proofUploadingId === payment.id ? 'Uploading...' : 'Attach GPay Proof'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {activeDetailTab === 'reminder' && (
          <section className="collector-action-panel">
            <div>
              <Clock3 size={18} />
              <span>Next due date</span>
              <strong>{selectedLoan.closing_date || 'Not set'}</strong>
            </div>
            <button type="button" onClick={() => alert('Reminder date can be set once the reminder endpoint is enabled for collectors.')}>SET DATE</button>
          </section>
        )}

        {activeDetailTab === 'sms' && (
          <section className="collector-action-panel">
            <div>
              <MessageCircle size={18} />
              <span>Send payment reminder</span>
              <strong>{selectedLoan.customer_phone || 'No phone number'}</strong>
            </div>
            <div className="collector-action-panel-buttons">
              {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer">DAILY REPORT</a> : <button type="button" disabled>DAILY REPORT</button>}
              {weeklyWhatsappUrl ? <a href={weeklyWhatsappUrl} target="_blank" rel="noreferrer">WEEKLY REPORT</a> : <button type="button" disabled>WEEKLY REPORT</button>}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="collector-phone-page">
      <header className="collector-home-header">
        <div>
          <button className="collector-name-btn" type="button">
            {user.name || 'Collector'} <ChevronDown size={16} />
          </button>
          <p>DigiVasool field collections</p>
        </div>
        <button className="collector-profile-btn" type="button"><Bell size={18} /></button>
      </header>

      <div className="collector-party-tabs">
        <button className={activePartyType === 'customers' ? 'active' : ''} type="button" onClick={() => setActivePartyType('customers')}>Customers</button>
        <button className={activePartyType === 'suppliers' ? 'active' : ''} type="button" onClick={() => setActivePartyType('suppliers')}>Suppliers</button>
      </div>

      <section className="collector-summary-card">
        <div><span>You will receive</span><strong>{money(totals.due)}</strong></div>
        <div><span>Collected</span><strong>{money(totals.collected)}</strong></div>
        <div><span>Remaining</span><strong>{money(totals.remaining)}</strong></div>
        <button type="button" onClick={() => navigate('/collector/history')}>View Report</button>
      </section>

      <div className="collector-search-row">
        <label>
          <Search size={18} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search Customer" />
        </label>
        <button className={showFilters ? 'active' : ''} type="button" onClick={() => setShowFilters(v => !v)}><Filter size={19} /></button>
      </div>

      {showFilters && (
        <div className="collector-filter-row">
          {[
            { id: 'balance', icon: SlidersHorizontal, label: 'Highest' },
            { id: 'name', icon: UserRound, label: 'A-Z' },
            { id: 'recent', icon: Clock3, label: 'Recent' },
          ].map(option => {
            const OptionIcon = option.icon;
            return (
              <button key={option.id} className={sortBy === option.id ? 'active' : ''} type="button" onClick={() => setSortBy(option.id)}>
                <OptionIcon size={14} /> {option.label}
              </button>
            );
          })}
        </div>
      )}

      <section className="collector-customer-list">
        {filteredLoans.length === 0 ? (
          <div className="collector-empty">
            {activePartyType === 'suppliers' ? 'No suppliers are connected to this collector account.' : 'No customers match your search.'}
          </div>
        ) : filteredLoans.map(loan => (
          <article key={loan.id} className="collector-customer-row" onClick={() => setSelectedLoan(loan)}>
            <div className="collector-avatar">{initials(loan.customer_name)}</div>
            <div className="collector-row-main">
              <h3>{loan.customer_name}</h3>
              <span>{timeAgo(loan.created_at)}{loan.zone ? ` · ${loan.zone}` : ''}</span>
            </div>
            <div className="collector-row-side">
              <strong>{money(loan.pending_amount)}</strong>
              {loan.customer_phone ? (
                <a href={`https://wa.me/91${String(loan.customer_phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(buildReportMessage(loan))}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>REMIND</a>
              ) : (
                <button type="button" onClick={e => e.stopPropagation()}>REMIND</button>
              )}
            </div>
          </article>
        ))}
      </section>

      <button className="collector-add-customer" type="button" onClick={() => navigate('/collector/borrowers')}>
        <Plus size={19} /> ADD CUSTOMER
      </button>

    </div>
  );
}
