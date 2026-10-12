// Printable portfolio report; the browser's print dialog saves it as PDF.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (v) => '₹' + Number(v || 0).toLocaleString('en-IN');

export function downloadReportPdf({ loans, totals }) {
  const summary = [
    ['Total disbursed', totals.disbursed], ['Total collected', totals.collected],
    ['Outstanding', totals.outstanding], ['Expenses', totals.expenses],
  ].map(([k, v]) => `<div class="card"><div class="k">${esc(k)}</div><div class="v">${inr(v)}</div></div>`).join('');
  const rows = loans.map(l => `<tr><td>${esc(l.borrowerName)}</td><td>${esc(l.status)}</td>
    <td class="n">${inr(l.principal)}</td><td class="n">${inr(l.collectedAmount)}</td><td class="n">${inr(l.pendingAmount)}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>DigiVasool Report</title><style>
  body{font-family:system-ui,'Segoe UI',sans-serif;color:#111;margin:28px;font-size:12px} h1{font-size:20px;margin:0}
  .sub{color:#666;margin:2px 0 16px} .cards{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
  .card{flex:1;min-width:120px;border:1px solid #ddd;border-radius:8px;padding:10px} .k{color:#666;font-size:11px} .v{font-size:16px;font-weight:700}
  table{width:100%;border-collapse:collapse} th,td{padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:left} th{background:#f5f5f5} .n{text-align:right}
  </style></head><body><h1>DigiVasool — Portfolio Report</h1>
  <div class="sub">Generated ${esc(new Date().toLocaleString('en-IN'))} · ${loans.length} borrowers</div>
  <div class="cards">${summary}</div>
  <table><thead><tr><th>Borrower</th><th>Status</th><th class="n">Principal</th><th class="n">Collected</th><th class="n">Pending</th></tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
