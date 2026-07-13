import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useLanguage } from '../../context/LanguageContext';
import { Plus, X, Shield, UserCog, User, Phone, Mail, Lock, Check, ClipboardList } from 'lucide-react';

const AUDIT_LOG = [
  { user: 'Arjun Nair',  action: 'Disbursed loan ₹50,000 to Rajan Kumar',  time: '2 hrs ago' },
  { user: 'Collector 1', action: 'Recorded payment ₹550 from Rajan Kumar',  time: '3 hrs ago' },
  { user: 'Collector 2', action: 'Recorded payment ₹4,000 from Priya L',    time: '4 hrs ago' },
  { user: 'Kavya Rao',   action: 'Approved loan for Saranya M',             time: '1 day ago' },
  { user: 'Arjun Nair',  action: 'Added borrower Karthik V',                time: '2 days ago' },
];

function AddStaffModal({ onClose, onAdd }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: '', role: 'collector', phone: '', email: '', target: 50000 });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
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
        <button className="btn btn-primary w-full" onClick={() => { if (form.name) { onAdd(form); onClose(); } }}>
          <Plus size={16} /> {t('addStaff')}
        </button>
      </div>
    </div>
  );
}

export default function Staff() {
  const { state, dispatch } = useAppData();
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 32 }}>
        {state.staff.map(s => {
          const pct = Math.min(100, Math.round((s.collected / s.target) * 100));
          const rc = ROLE_CONFIG[s.role];
          const barColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
          return (
            <div key={s.id} className="card" style={{ transition: 'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
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
        <div style={{ overflowX: 'auto' }}>
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
                  <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: 13 }}>{perm}</td>
                  {roles.map((allowed, i) => (
                    <td key={i} style={{ padding: '10px 16px', textAlign: 'center' }}>
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
        {AUDIT_LOG.map((log, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: i < AUDIT_LOG.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--brand-light)', flexShrink: 0, fontSize: 14 }}>
              {log.user.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}><span style={{ color: 'var(--brand-light)' }}>{log.user}</span> {log.action}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{log.time}</div>
            </div>
          </div>
        ))}
      </div>

      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} onAdd={payload => dispatch({ type: 'ADD_STAFF', payload })} />}
    </div>
  );
}
