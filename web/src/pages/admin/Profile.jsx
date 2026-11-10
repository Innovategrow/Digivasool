import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../components/Toast';
import BottomSheet from '../../components/BottomSheet';
import ConfirmDialog from '../../components/ConfirmDialog';
import { apiFetch, readError } from '../../utils/api';
import {
  User, LogOut, Clock, Smartphone, Building2, CheckCircle2, Repeat, ShieldCheck, FileText,
  Trash2, ChevronRight, Check, UserMinus,
} from 'lucide-react';

const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', COLLECTOR: 'Collector', BORROWER: 'Borrower' };

// Account: who you are, which organisation you are in, switching, legal, and the two deletion paths.
export default function Profile() {
  const { user, login, logout } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [memberships, setMemberships] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);          // 'leave' | 'org'
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const isOwner = user.member_role === 'OWNER';
  const orgName = user.organization?.name || '';

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/organizations/my-memberships').then(r => (r.ok ? r.json() : [])).then(rows => { if (!cancelled) setMemberships(Array.isArray(rows) ? rows : []); }).catch(() => {});
    if (user.role === 'admin') {
      apiFetch('/api/admin/audit-log?limit=100').then(r => (r.ok ? r.json() : [])).then(rows => {
        if (!cancelled) setAuditLogs((Array.isArray(rows) ? rows : []).filter(r => r.actor === user.name).slice(0, 8));
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [user.name, user.role]);

  const switchTo = async (m) => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/organizations/switch', { method: 'POST', body: JSON.stringify({ organization_id: m.organization_id, role: m.role }) });
      if (!res.ok) throw new Error(await readError(res));
      login(await res.json());
      window.location.assign('/');          // reload so nothing from the previous organisation stays on screen
    } catch (err) { showToast(err.message, 'error'); setBusy(false); }
  };

  const closeConfirm = () => { setConfirm(null); setTyped(''); };
  const doDelete = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(confirm === 'org' ? '/api/organizations/request-deletion' : '/api/account/delete', { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res));
      await logout();
    } catch (err) { showToast(err.message, 'error'); setBusy(false); closeConfirm(); }
  };

  return (
    <div className="screen-container pt-4 pb-12">
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>{t('myProfile')}</h2>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <User size={30} className="text-brand" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 20, fontWeight: 900, overflowWrap: 'anywhere' }}>{user.name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span className={`role-pill${user.role === 'collector' ? ' amber' : user.role === 'borrower' ? ' green' : ''}`}>
                {ROLE_LABEL[user.member_role] || user.role}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={14} className="text-positive" /> {t('verified')}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <Smartphone size={18} className="text-muted" style={{ flex: 'none' }} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{t('phoneNumber')}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{user.phone || '—'}</div>
          </div>
        </div>
      </div>

      <div className="acct-section">Organisation</div>
      <div className="card">
        <div className="acct-org">
          <div className="acct-org-icon"><Building2 size={24} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="acct-org-name">{orgName}</div>
            <div className="acct-org-sub">{user.organization?.id} · Your role: {ROLE_LABEL[user.member_role] || user.role}</div>
          </div>
        </div>
      </div>
      {memberships.length > 1 && (
        <div className="card acct-list" style={{ marginTop: 10 }}>
          <button type="button" className="acct-item" onClick={() => setSwitchOpen(true)}>
            <Repeat size={20} /> Switch organisation <span className="acct-note" style={{ margin: '0 0 0 auto' }}>{memberships.length} available</span>
            <ChevronRight size={18} className="acct-chevron" style={{ marginLeft: 8 }} />
          </button>
        </div>
      )}

      <div className="acct-section">Privacy &amp; legal</div>
      <div className="card acct-list">
        <a className="acct-item" href="/privacy.html" target="_blank" rel="noreferrer"><ShieldCheck size={20} /> Privacy Policy <ChevronRight size={18} className="acct-chevron" /></a>
        <a className="acct-item" href="/terms.html" target="_blank" rel="noreferrer"><FileText size={20} /> Terms of Service <ChevronRight size={18} className="acct-chevron" /></a>
      </div>

      {user.role === 'admin' && auditLogs.length > 0 && (
        <>
          <div className="acct-section">{t('loginHistory')}</div>
          <div className="card">
            {auditLogs.map((log, i) => (
              <div key={`${log.created_at}-${i}`} style={{ display: 'flex', gap: 12, paddingBottom: i === auditLogs.length - 1 ? 0 : 14, marginBottom: i === auditLogs.length - 1 ? 0 : 14, borderBottom: i === auditLogs.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Clock size={16} className="text-muted" /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{log.detail}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{new Date(log.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <button type="button" onClick={logout} className="btn btn-secondary" style={{ width: '100%', marginTop: 28, color: 'var(--red)' }}>
        <LogOut size={18} /> {t('signOutSafely')}
      </button>

      {user.role !== 'borrower' && (
        <>
          <div className="acct-section">Delete</div>
          <div className="card acct-list">
            {!isOwner && (
              <button type="button" className="acct-item is-danger" onClick={() => setConfirm('leave')}>
                <UserMinus size={20} /> Delete my account <ChevronRight size={18} className="acct-chevron" />
              </button>
            )}
            {isOwner && (
              <button type="button" className="acct-item is-danger" onClick={() => setConfirm('org')}>
                <Trash2 size={20} /> Delete organisation <ChevronRight size={18} className="acct-chevron" />
              </button>
            )}
          </div>
          <p className="acct-note">
            {isOwner
              ? 'As the owner you can lock and delete the whole organisation. Nothing is erased immediately.'
              : 'This removes your access to this organisation. Loans and payments you recorded stay with the organisation.'}
          </p>
        </>
      )}

      <BottomSheet open={switchOpen} title="Switch organisation" onClose={() => !busy && setSwitchOpen(false)}>
        {memberships.map(m => (
          <button key={`${m.organization_id}-${m.role}`} type="button" disabled={busy} className={`org-row${m.current ? ' is-current' : ''}`}
            onClick={() => (m.current ? setSwitchOpen(false) : switchTo(m))}>
            <span className="org-row-icon"><Building2 size={20} /></span>
            <span className="org-row-text"><span className="org-row-name">{m.organization_name}</span><span className="org-row-role">{ROLE_LABEL[m.role] || m.role}</span></span>
            {m.current && <Check size={18} style={{ color: 'var(--brand)' }} />}
          </button>
        ))}
      </BottomSheet>

      <ConfirmDialog open={confirm === 'leave'} title="Delete your account?" confirmLabel="Delete my account" busy={busy}
        onConfirm={doDelete} onCancel={closeConfirm}>
        You will lose access to <strong>{orgName}</strong> and be signed out. The organisation&apos;s records are not deleted.
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'org'} title="Delete this organisation?" confirmLabel="Lock and delete" busy={busy}
        confirmDisabled={typed.trim().toLowerCase() !== orgName.trim().toLowerCase()} onConfirm={doDelete} onCancel={closeConfirm}>
        <p style={{ marginBottom: 10 }}>Everyone in <strong>{orgName}</strong> will be locked out. Your data is kept for 30 days, then erased. Type the organisation name to confirm.</p>
        <input className="form-input" value={typed} onChange={e => setTyped(e.target.value)} placeholder={orgName} aria-label="Organisation name" />
      </ConfirmDialog>
    </div>
  );
}
