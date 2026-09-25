import { useEffect, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useToast } from '../../components/Toast';
import { apiFetch } from '../../utils/api';
import { useLanguage } from '../../context/LanguageContext';
import { Plus, X, Shield, UserCog, User, Phone, Mail, Lock, Check, ClipboardList } from 'lucide-react';

const ACTION_LABELS = {
  LOAN_CREATED: 'created a loan', PAYMENT_RECORDED: 'recorded a payment', BORROWER_UPDATED: 'edited a borrower',
  BORROWER_DELETED: 'deleted a borrower', LOAN_RESTORED: 'restored a borrower', LOAN_CLOSED: 'closed a loan',
  LOAN_MERGED: 'merged borrowers', LOGIN: 'logged in', STAFF_ADDED: 'added staff', EXPENSE_ADDED: 'logged an expense',
  CAPITAL_ADDED: 'logged capital', PAYMENT_PROOF_UPLOADED: 'uploaded payment proof',
};

function AddStaffModal({ onClose, onAdd }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: '', role: 'collector', phone: '', email: '', target: 50000 });
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
          <div className="modal-title">{t('addStaffMember')}</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('fullNameRequired')}</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Staff name" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('role')}</label>
            <select className="form-input" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="admin">{t('roleAdmin')}</option>
              <option value="manager">{t('roleManager')}</option>
              <option value="collector">{t('roleCollector')}</option>
            </select>
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
        {form.role === 'collector' && <p className="muted-note">Collectors log in with this phone number and an OTP.</p>}
        {error && <div className="form-alert" role="alert">{error}</div>}
        <button className="btn btn-primary w-full" disabled={saving || form.name.trim().length < 2} onClick={submit}>
          <Plus size={16} /> {saving ? 'Saving...' : t('addStaff')}
        </button>
      </div>
    </div>
  );
}

export default function Staff() {
  const { state, actions } = useAppData();
  const { showToast } = useToast();
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

  const ROLE_CONFIG = {
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

      {/* Staff Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 32 }}>
        {state.staff.map(s => {
          const pct = s.target > 0 ? Math.min(100, Math.round((s.collected / s.target) * 100)) : 0;
          const rc = ROLE_CONFIG[s.role] || ROLE_CONFIG.collector;
          const barColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
          return (
            <div key={s.id} className="card">
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, var(--brand), var(--pink))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff' }}>
                  {s.name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{s.name}</div>
                  <div style={{ marginTop: 4 }}>
                    <span className={`badge ${rc.cls}`}>{rc.icon} {rc.label}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
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

      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} onAdd={async payload => { await actions.addStaff(payload); showToast('Staff member added'); }} />}
    </div>
  );
}
