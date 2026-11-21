import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { usePreview } from '../context/PreviewContext';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useLanguage } from '../context/LanguageContext';
import BottomSheet from './BottomSheet';
import {
  LayoutDashboard, Users, BookOpen, BarChart3, Receipt, UserCog, LogOut,
  CreditCard, Languages, Trash2, ChevronRight, UserRound, BadgeIndianRupee, ShieldAlert, HandCoins, ArrowLeftRight,
} from 'lucide-react';

const ADMIN_NAV = [
  { to: '/',            icon: LayoutDashboard, labelKey: 'dashboard' },
  { to: '/borrowers',   icon: Users,           labelKey: 'borrowers' },
  { to: '/collection',  icon: CreditCard,      labelKey: 'collection' },
  { to: '/ledger',      icon: BookOpen,        labelKey: 'ledger' },
  { to: '/expenses',    icon: Receipt,         labelKey: 'expenses' },
  { to: '/reports',     icon: BarChart3,       labelKey: 'reports' },
  { to: '/staff',       icon: UserCog,         labelKey: 'staff' },
  { to: '/recycle-bin', icon: Trash2,          labelKey: 'recycleBin' },
  { to: '/profile',     icon: UserRound,       labelKey: 'profile' },
];

const COLLECTOR_NAV = [
  { to: '/collector',           icon: CreditCard, labelKey: 'collectPayment' },
  { to: '/collector/borrowers', icon: Users,      labelKey: 'borrowers' },
  { to: '/collector/history',   icon: BookOpen,   labelKey: 'history' },
  { to: '/collector/account',   icon: UserRound,  labelKey: 'profile' },
];

// Admin-only shortcuts into the other roles' flows
const ADMIN_ROLE_VIEWS = [
  { to: '/collector', icon: HandCoins,  labelKey: 'collectorView', previewMode: 'collector' },
  { to: '/my-loan',   icon: UserRound,  labelKey: 'borrowerView',  previewMode: 'borrower' },
];
const BACK_TO_ADMIN = { to: '/', icon: ArrowLeftRight, labelKey: 'adminView', exitPreview: true };

// "More" menu: every destination that doesn't fit in the bottom tab bar.
export default function MoreSheet({ open, onClose, collectorMode = false }) {
  const { user, logout } = useAuth();
  const { derived } = useAppData();
  const { t, language, setLanguage, LANGUAGES } = useLanguage();
  const { sub } = useSubscription();
  const { preview, startPreview, exitPreview } = usePreview();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const nav = collectorMode ? [...COLLECTOR_NAV, ...(isAdmin ? [BACK_TO_ADMIN] : [])] : [
    ...ADMIN_NAV,
    ...(user?.member_role === 'OWNER' ? [{ to: '/subscription', icon: BadgeIndianRupee, labelKey: 'subscription' }] : []),
    ...(sub?.is_platform_admin ? [{ to: '/platform', icon: ShieldAlert, labelKey: 'platform' }] : []),
    ...(isAdmin ? ADMIN_ROLE_VIEWS : []),
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title={t('more')}>
      <div className="more-user">
        <div className="more-avatar">{user?.name?.charAt(0)?.toUpperCase()}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="more-user-name">{user?.name}</div>
          <div className="more-user-role">{(user?.member_role || user?.role || '').toUpperCase()} · {user?.organization?.name}</div>
        </div>
      </div>

      <nav className="more-nav">
        {nav.map(item => (item.previewMode || item.exitPreview) ? (
          <button key={item.to} type="button" className="more-nav-item" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => {
            onClose();
            if (item.exitPreview) { const to = preview?.returnPath || '/'; exitPreview(); navigate(to); return; }
            if (startPreview(item.previewMode, { returnPath: location.pathname })) navigate(item.to);
          }}>
            <item.icon size={20} />
            <span>{t(item.labelKey)}</span>
            <ChevronRight size={16} className="more-chevron" />
          </button>
        ) : (
          <NavLink key={item.to} to={item.to} end={item.to === '/' || item.to === '/collector'} onClick={onClose}
            className={({ isActive }) => `more-nav-item${isActive ? ' active' : ''}`}>
            <item.icon size={20} />
            <span>{t(item.labelKey)}</span>
            {item.to === '/ledger' && derived.overdueCount > 0 && <span className="more-badge">{derived.overdueCount}</span>}
            <ChevronRight size={16} className="more-chevron" />
          </NavLink>
        ))}
      </nav>

      <label className="more-language">
        <Languages size={18} />
        <span>{t('language')}</span>
        <select value={language} onChange={e => setLanguage(e.target.value)}>
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>

      <button type="button" className="more-logout" onClick={() => { onClose(); logout(); }}>
        <LogOut size={18} /> {t('logout')}
      </button>
    </BottomSheet>
  );
}
