// Printable subscription invoice: opens the browser print dialog ("Save as PDF" downloads it).
// Same approach as the borrower agreement, so no PDF library is needed. The data comes from the server.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (paise, cur = 'INR') => `${cur === 'INR' ? '₹' : cur + ' '}${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v) => { const d = new Date(v); return isNaN(d) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };

export function downloadInvoice(inv) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const rows = [
    ['Invoice number', inv.invoice_number], ['Date', day(inv.paid_at)], ['Organisation', `${inv.organization_name} (${inv.organization_id})`],
    ['Plan', `${inv.plan_name} subscription`], ['Service period', `${day(inv.period_start)} to ${day(inv.period_end)}`],
    ['Payment method', (inv.payment_method || '-').toUpperCase()], ['Razorpay order', inv.gateway_order_id], ['Razorpay payment', inv.gateway_payment_id],
  ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.invoice_number)}</title>
<style>@page{size:A4;margin:16mm}body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px}
h1{font-size:22px;margin:0}.sub{color:#666;margin:2px 0 22px}table{width:100%;border-collapse:collapse}th{text-align:left;width:38%;color:#555;padding:7px 0;border-bottom:1px solid #eee}
td{padding:7px 0;border-bottom:1px solid #eee}.total{margin-top:20px;font-size:20px;font-weight:700;text-align:right}.foot{margin-top:30px;color:#888;font-size:12px}</style></head>
<body><h1>DigiVasool</h1><div class="sub">Subscription invoice</div><table>${rows}</table>
<div class="total">Amount paid: ${esc(money(inv.amount, inv.currency))}</div>
<div class="foot">This is a computer-generated receipt for your DigiVasool subscription payment.</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
  return true;
}
