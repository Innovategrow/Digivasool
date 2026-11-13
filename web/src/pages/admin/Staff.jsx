import { useEffect, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { apiFetch } from '../../utils/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useLanguage } from '../../context/LanguageContext';
import { Plus, X, Shield, UserCog, User, Phone, Mail, Lock, Check, ClipboardList, Pencil, Users, Trash2, Crown } from 'lucide-react';

const ACTION_LABELS = {
  LOAN_CREATED: 'created a loan', PAYMENT_RECORDED: 'recorded a payment', BORROWER_UPDATED: 'edited a borrower',
  BORROWER_DELETED: 'deleted a borrower', LOAN_RESTORED: 'restored a borrower', LOAN_CLOSED: 'closed a loan',
  LOAN_MERGED: 'merged borrowers', LOGIN: 'logged in', STAFF_ADDED: 'added staff', STAFF_DELETED: 'removed staff', EXPENSE_ADDED: 'logged an expense',
  CAPITAL_ADDED: 'logged capital', PAYMENT_PROOF_UPLOADED: 'uploaded payment proof',
};

function AddStaffModal({ onClose, onAdd, member, canAddAdmin }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(member
    ? { name: member.name, role: member.role, phone: member.phone || '', email: member.email || '', target: member.target || 0 }
    : { name: '', role: 'collector', phone: '', email: '', target: 50000 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    if (saving || form.name.trim().length < 2) return;
    setSaving(true); setError('');
    try { await onAdd(form); onClose(); }
    catch (err) { setError(err.message || 'Something went wrong. Please try again.'); setSaving(false); }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{member ? 'Edit staff member' : t('addStaffMember')}</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('fullNameRequired')}</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Staff name" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('role')}</label>
            <select className="form-input" value={form.role} disabled={Boolean(member)} onChange={e => set('role', e.target.value)}>
              {(canAddAdmin || form.role === 'admin') && <option value="admin">{t('roleAdmin')}</option>}
              <option value="manager">{t('roleManager')}</option>
              <option value="collector">{t('roleCollector')}</option>
            </select>
            {!canAddAdmin && !member && <p className="muted-note">Only the organisation owner can add admins.</p>}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('phone')}</label>
            <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone number" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('monthlyTarget')}</label>
            <input className="form-input" type="number" value={form.target} onChange={e => set('target', Number(e.target.value))} />
          </div>
        </div>
        {form.role !== 'manager' && <p className="muted-note">A phone number is required: {form.role === 'admin' ? 'admins' : 'collectors'} sign in with it and an OTP.</p>}
        {member && form.role === 'collector' && <p className="muted-note">Renaming a collector also updates the borrowers assigned to them.</p>}
        {form.role === 'collector' && <p className="muted-note">Collectors log in with this phone number and an OTP.</p>}
        {error && <div className="form-alert" role="alert">{error}</div>}
        <button className="btn btn-primary w-full" disabled={saving || form.name.trim().length < 2} onClick={submit}>
          {member ? <Check size={16} /> : <Plus size={16} />} {saving ? 'Saving...' : member ? 'Save changes' : t('addStaff')}
        </button>
      </div>
    </div>
  );
}

// Lists the borrowers assigned to a collector and lets the admin hand any of them to another collector.
function CollectorBorrowersModal({ member, collectors, onClose, onChanged }) {
  const { showToast } = useToast();
  const [loans, setLoans] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const mine = l => (l.assigned_collectors || []).some(n => n.toLowerCase() === member.name.toLowerCase());
  useEffect(() => {
    apiFetch('/api/loans/')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Could not load borrowers.'))))
      .then(rows => setLoans(rows.filter(l => l.status !== 'archived')))
      .catch(err => { setError(err.message); setLoans([]); });
  }, []);
  const others = collectors.filter(c => c.name.toLowerCase() !== member.name.toLowerCase());
  const reassign = async (loan, target) => {
    if (!target || busyId) return;
    const next = [...new Set((loan.assigned_collectors || []).map(n => (n.toLowerCase() === member.name.toLowerCase() ? target : n)))];
    setBusyId(loan.id); setError('');
    try {
      const res = await apiFetch(`/api/loans/${loan.id}`, { method: 'PATCH', body: JSON.stringify({ assigned_collectors: next }) });
      if (!res.ok) { let msg = ''; try { msg = (await res.json()).detail; } catch { /* ignore */ } throw new Error(msg || 'Could not change the collector.'); }
      const data = await res.json();
      setLoans(cur => cur.map(l => (l.id === loan.id ? { ...l, ...data } : l)));
      showToast(`${loan.customer_name} moved to ${target}`);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not change the collector.');
    } finally {
      setBusyId('');
    }
  };
  const list = (loans || []).filter(mine);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{member.name}'s borrowers</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        {error && <div className="form-alert" role="alert">{error}</div>}
        {loans === null && <div className="muted-note">Loading…</div>}
        {loans !== null && list.length === 0 && <div className="muted-note">No borrowers assigned to this collector.</div>}
        {list.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{l.customer_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{(l.assigned_collectors || []).join(', ')}</div>
            </div>
            <select className="form-input" style={{ width: 140 }} value="" disabled={busyId === l.id || others.length === 0}
              onChange={e => reassign(l, e.target.value)} aria-label={`Change collector for ${l.customer_name}`}>
              <option value="">{busyId === l.id ? 'Saving…' : 'Change to…'}</option>
              {others.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Staff() {
  const { state, actions } = useAppData();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isOwner = user?.member_role === 'OWNER';
  const [transfer, setTransfer] = useState(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  useEffect(() => {
    actions.refresh();
    apiFetch('/api/admin/audit-log?limit=15')
      .then(r => (r.ok ? r.json() : []))
      .then(rows => setAuditLog(Array.isArray(rows) ? rows : []))
      .catch(() => setAuditLog([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { t } = useLanguage();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');

  const ROLE_CONFIG = {
    owner:     { label: 'Owner',              cls: 'badge-indigo', icon: <Crown size={11} /> },
    admin:     { label: t('roleAdmin'),     cls: 'badge-indigo', icon: <Shield size={11} /> },
    manager:   { label: t('roleManager'),   cls: 'badge-cyan',   icon: <UserCog size={11} /> },
    collector: { label: t('roleCollector'), cls: 'badge-amber',  icon: <User size={11} /> },
  };

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <div className="page-header">
        <div>
          <div className="page-title">{t('staffManagement')}</div>
          <div className="page-subtitle">{state.staff.length} {t('teamMembers')} · {t('rbacEnabled')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} />{t('addStaff')}</button>
      </div>

      <div className="card" style={{ marginBottom: 16, fontSize: 13 }}>
        New staff can ask to join with your organisation code <strong style={{ letterSpacing: .5 }}>{user?.organization?.id}</strong>.
        Their request appears under Notifications (🔔) for you to approve or deny. Or add them yourself with “{t('addStaff')}”.
      </div>

      {/* Staff Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 32 }}>
        {state.staff.map(s => {
          const pct = s.target > 0 ? Math.min(100, Math.round((s.collected / s.target) * 100)) : 0;
          const rc = ROLE_CONFIG[s.member_role === 'OWNER' ? 'owner' : s.role] || ROLE_CONFIG.collector;
          const isSelf = s.phone && user?.phone && s.phone.replace(/\D/g, '').slice(-10) === user.phone.replace(/\D/g, '').slice(-10);
          const canManage = isOwner || (s.member_role !== 'OWNER' && s.member_role !== 'ADMIN') || isSelf;
          const barColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
          return (
            <div key={s.id} className="card">
              <div className="staff-head">
                <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, var(--brand), var(--pink))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', flex: 'none' }}>
                  {s.name.charAt(0)}
                </div>
                <div className="staff-head-main">
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{s.name}</div>
                  <div style={{ marginTop: 4 }}>
                    <span className={`badge ${rc.cls}`}>{rc.icon} {rc.label}</span>
                  </div>
                </div>
                <div className="staff-head-actions">
                {s.role === 'collector' && (
                  <button type="button" className="icon-btn" onClick={() => setViewing(s)} aria-label={`Borrowers of ${s.name}`} title="Borrowers / change collector"><Users size={16} /></button>
                )}
                {isOwner && s.member_role === 'ADMIN' && (
                  <button type="button" className="icon-btn" onClick={() => setTransfer(s)} aria-label={`Make ${s.name} the owner`} title="Make owner"><Crown size={16} /></button>
                )}
                {s.source === 'app' && canManage && (
                  <button type="button" className="icon-btn" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`} title="Edit"><Pencil size={16} /></button>
                )}
                {s.source === 'app' && canManage && s.member_role !== 'OWNER' && !isSelf && (
                  <button type="button" className="icon-btn" onClick={() => { setRemoving(s); setRemoveError(''); }} aria-label={`Delete ${s.name}`} title="Delete"><Trash2 size={16} /></button>
                )}
                </div>
                <div className="staff-head-eff">
                  <div style={{ fontSize: 22, fontWeight: 900, color: barColor }}>{pct}%</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{t('efficiency')}</div>
                </div>
              </div>

              <div className="grid-cols-3" style={{ gap: 8, marginBottom: 14 }}>
                {[
                  { id: 'target', label: t('target'),    value: `₹${s.target.toLocaleString()}`,    color: 'var(--text-2)' },
                  { id: 'collected', label: t('collectedLabel'), value: `₹${s.collected.toLocaleString()}`, color: 'var(--green)' },
                  { id: 'loans', label: t('loans'),     value: s.loans,                             color: 'var(--brand-light)' },
                ].map(m => (
                  <div key={m.id} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: m.color }}>{m.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{m.label}</div>
                  </div>
                ))}
              </div>

              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%`, background: `linear-gradient(to right, ${barColor}, ${barColor}cc)` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>
                <span>₹{s.collected.toLocaleString()} {t('collectedLabel').toLowerCase()}</span>
                <span>{t('target')}: ₹{s.target.toLocaleString()}</span>
              </div>

              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 12 }}>
                {s.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {s.phone}</span>}
                {s.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {s.email}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* RBAC Permission Matrix */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Lock size={16} /> {t('rolePermissionMatrix')}</div>
        <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{t('permission')}</th>
                {[t('roleAdmin'), t('roleManager'), t('roleCollector')].map(r => <th key={r} style={{ textAlign: 'center' }}>{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                [t('permViewDashboard'),    true,  true,  false],
                [t('permCreateLoans'),      true,  true,  false],
                [t('permCollectPayments'),  true,  true,  true ],
                [t('permViewReports'),      true,  true,  false],
                [t('permManageStaff'),      true,  false, false],
                [t('permDeleteRecords'),    true,  false, false],
                [t('permExportData'),       true,  true,  false],
                [t('permViewCapital'),      true,  false, false],
              ].map(([perm, ...roles]) => (
                <tr key={perm}>
                  <td data-label={t('permission')} style={{ padding: '10px 16px', fontWeight: 600, fontSize: 13 }}>{perm}</td>
                  {roles.map((allowed, i) => (
                    <td key={i} data-label={[t('roleAdmin'), t('roleManager'), t('roleCollector')][i]} style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {allowed ? <Check size={16} style={{ color: 'var(--green)' }} /> : <X size={16} style={{ color: 'var(--red)' }} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log */}
      <div className="card">
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={16} /> {t('recentAuditLog')}</div>
        {auditLog.length === 0 && <div className="muted-note">No activity recorded yet.</div>}
        {auditLog.map((log, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: i < auditLog.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--brand-light)', flexShrink: 0, fontSize: 14 }}>
              {(log.actor || '?').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}><span style={{ color: 'var(--brand-light)' }}>{log.actor}</span> {ACTION_LABELS[log.action] || log.action.toLowerCase().replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, overflowWrap: 'anywhere' }}>{log.detail}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
        ))}
      </div>

      {viewing && <CollectorBorrowersModal member={viewing} collectors={state.staff.filter(x => x.role === 'collector')} onClose={() => setViewing(null)} onChanged={() => actions.refresh()} />}
      <ConfirmDialog
        open={Boolean(removing)}
        title={`Delete ${removing?.role || 'staff member'}?`}
        confirmLabel="Delete"
        busyLabel="Deleting..."
        busy={removeBusy}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          setRemoveBusy(true); setRemoveError('');
          try { await actions.deleteStaff(removing.id); showToast(`${removing.name} deleted`); setRemoving(null); }
          catch (err) { setRemoveError(err.message || 'Could not delete.'); }
          finally { setRemoveBusy(false); }
        }}
      >
        <p>{removing?.name} will no longer be able to log in. Their past collections stay on record.</p>
        {removeError && <div className="form-alert" role="alert">{removeError}</div>}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(transfer)} tone="primary" title={`Make ${transfer?.name} the owner?`} confirmLabel="Transfer ownership"
        busyLabel="Transferring..." busy={transferBusy} onCancel={() => setTransfer(null)}
        onConfirm={async () => {
          setTransferBusy(true);
          try {
            const url = `/api/staff/${encodeURIComponent(transfer.id)}/make-owner`;
            let res = await apiFetch(url, { method: 'POST' });
            let data = await res.json().catch(() => ({}));
            if (res.status === 409 && data.code === 'exemption_loss_confirmation_required') {
              // Lifetime-free access belongs to the current owner's number: make the owner confirm it will end.
              if (!window.confirm(data.detail)) { setTransfer(null); return; }
              res = await apiFetch(`${url}?confirm_exemption_loss=true`, { method: 'POST' });
              data = await res.json().catch(() => ({}));
            }
            if (!res.ok) throw new Error(data.detail || 'Could not transfer ownership');
            showToast(`${transfer.name} is now the owner`);
            setTransfer(null);
            setTimeout(() => window.location.assign('/login'), 900);   // sign in again to refresh your role
          } catch (err) { showToast(err.message, 'error'); setTransfer(null); }
          finally { setTransferBusy(false); }
        }}
      >
        <p>{transfer?.name} will be the organisation owner. You become an admin and will be asked to sign in again.</p>
      </ConfirmDialog>
      {editing && <AddStaffModal member={editing} onClose={() => setEditing(null)} onAdd={async payload => {
        const { name, phone, email, target } = payload;
        await actions.updateStaff(editing.id, { name, phone, email, target });
        showToast('Staff member updated');
      }} />}
      {showAdd && <AddStaffModal canAddAdmin={isOwner} onClose={() => setShowAdd(false)} onAdd={async payload => { await actions.addStaff(payload); showToast('Staff member added'); }} />}
    </div>
  );
}
