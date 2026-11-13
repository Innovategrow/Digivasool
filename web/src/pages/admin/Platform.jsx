import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSubscription } from '../../context/SubscriptionContext';
import { useToast } from '../../components/Toast';
import BottomSheet from '../../components/BottomSheet';
import { apiFetch, readError } from '../../utils/api';

const inr = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const day = (v) => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };
const TONE = { exempt: 'green', grandfathered: 'indigo', trial: 'amber', trial_expired: 'red', active: 'green', cancelled: 'amber', expired: 'red' };

// DigiVasool operators only (the server checks PLATFORM_ADMIN_PHONES on every call; this screen is just a view).
export default function Platform() {
  const { sub } = useSubscription();
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('active');
  const [endAt, setEndAt] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async (query = '') => {
    try {
      const [a, l] = await Promise.all([apiFetch('/api/platform/subscriptions/analytics'),
        apiFetch(`/api/platform/subscriptions?q=${encodeURIComponent(query)}`)]);
      return { stats: a.ok ? await a.json() : null, rows: l.ok ? await l.json() : null };
    } catch { return {}; }   // offline
  }, []);
  const load = useCallback(async (query = '') => {
    const d = await fetchAll(query);
    if (d.stats) setStats(d.stats);
    if (d.rows) setRows(d.rows);
  }, [fetchAll]);

  // Loads on open and (debounced) whenever the search text changes.
  useEffect(() => {
    if (!sub?.is_platform_admin) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      fetchAll(q).then(d => { if (cancelled) return; if (d.stats) setStats(d.stats); if (d.rows) setRows(d.rows); });
    }, q ? 300 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, sub?.is_platform_admin, fetchAll]);

  if (!sub) return null;
  if (!sub.is_platform_admin) return <Navigate to="/" replace />;

  const open = async (orgId) => {
    const res = await apiFetch(`/api/platform/subscriptions/${orgId}`);
    if (res.ok) setDetail(await res.json());
  };
  const act = async (path, body) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/platform/subscriptions/${detail.org_id}/${path}`, { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await readError(res));
      setDetail(await res.json()); setReason(''); load(q);
      showToast('Saved and recorded in the audit log');
    } catch (err) { showToast(err.message, 'error'); }
    setBusy(false);
  };

  const o = stats?.organizations, r = stats?.revenue;
  const tiles = o ? [['Organisations', o.total], ['Lifetime free', o.exempt], ['Existing (grandfathered)', o.grandfathered],
    ['On trial', o.trial], ['Paid active', o.active], ['Expired', o.expired]] : [];
  const money = r ? [['Total revenue', inr(r.total_paise)], ['Monthly recurring', inr(r.monthly_recurring_paise)],
    ['Monthly plans', inr(r.monthly_plan_paise)], ['Annual plans', inr(r.annual_plan_paise)],
    ['Successful', r.successful_payments], ['Failed', r.failed_payments], ['Pending', r.pending_payments], ['Refunds', 'not tracked']] : [];

  return (
    <div className="sub-page">
      <div className="sub-section-title">Organisations</div>
      <div className="plat-tiles">{tiles.map(([k, v]) => <div key={k} className="card plat-tile"><div className="plat-num">{v}</div><div className="sub-muted">{k}</div></div>)}</div>
      <div className="sub-section-title">Revenue</div>
      <div className="plat-tiles">{money.map(([k, v]) => <div key={k} className="card plat-tile"><div className="plat-num">{v}</div><div className="sub-muted">{k}</div></div>)}</div>

      <div className="plat-search"><Search size={16} /><input className="form-input" placeholder="Search name, ID or owner phone" value={q} onChange={e => setQ(e.target.value)} /></div>
      {rows.map(x => (
        <button type="button" key={x.org_id} className="card plat-row" onClick={() => open(x.org_id)}>
          <div className="sub-pay-main"><strong>{x.organization_name}</strong><span className={`badge badge-${TONE[x.state] || 'gray'}`}>{x.state.replace('_', ' ')}</span></div>
          <div className="sub-muted">{x.org_id} · {x.owner_phone || 'no owner'} · {x.plan_id || '—'}</div>
          <div className="sub-muted">{x.state === 'trial' || x.state === 'trial_expired' ? `Trial ends ${day(x.trial_end)}` : x.current_period_end ? `Paid until ${day(x.current_period_end)}` : ''} {x.payments_count ? `· ${inr(x.payments_total)} paid` : ''}</div>
        </button>
      ))}

      <BottomSheet open={Boolean(detail)} title={detail?.organization_name} onClose={() => setDetail(null)}>
        {detail && (
          <div className="sub-page">
            <div className="sub-row"><span className="sub-muted">ID</span><span>{detail.org_id}</span></div>
            <div className="sub-row"><span className="sub-muted">Owner</span><span>{detail.owner_phone || '—'}</span></div>
            <div className="sub-row"><span className="sub-muted">State</span><span className={`badge badge-${TONE[detail.state] || 'gray'}`}>{detail.state.replace('_', ' ')}</span></div>
            <div className="sub-row"><span className="sub-muted">Trial end</span><span>{day(detail.trial_end)}</span></div>
            <div className="sub-row"><span className="sub-muted">Paid until</span><span>{day(detail.current_period_end)}</span></div>
            {detail.is_exempt ? <div className="sub-muted">Lifetime free organisation: it can't be changed here.</div> : (
              <>
                <input className="form-input" placeholder="Reason (required, goes in the audit log)" value={reason} onChange={e => setReason(e.target.value)} />
                <div className="plat-form">
                  <input className="form-input" type="number" min="1" max="365" value={days} onChange={e => setDays(e.target.value)} />
                  <button type="button" className="btn btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => act('extend-trial', { days: Number(days), reason })}>Extend trial (days)</button>
                </div>
                <div className="plat-form">
                  <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="active">Paid active</option><option value="trial">Trial</option><option value="cancelled">Renewal off</option><option value="grandfathered">Grandfathered</option>
                  </select>
                  <input className="form-input" type="date" value={endAt} onChange={e => setEndAt(e.target.value)} />
                </div>
                <button type="button" className="btn btn-secondary" disabled={busy || reason.trim().length < 3 || (status !== 'grandfathered' && !endAt)}
                  onClick={() => act('set-status', { status, end_at: endAt ? new Date(`${endAt}T23:59:59Z`).toISOString() : null, reason })}>Correct status</button>
              </>
            )}
            <div className="sub-section-title">Payments</div>
            {detail.payments.length === 0 && <div className="sub-muted">None</div>}
            {detail.payments.map(p => <div key={p.id} className="sub-row"><span className="sub-muted">{day(p.paid_at || p.created_at)} · {p.plan_name} · {p.status}</span><strong>{inr(p.amount)}</strong></div>)}
            <div className="sub-section-title">Audit</div>
            {detail.audit.length === 0 && <div className="sub-muted">No manual changes</div>}
            {detail.audit.map(a => <div key={a.id || a.created_at} className="sub-muted">{day(a.created_at)} · {a.action} · {a.detail} · {a.actor}</div>)}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
