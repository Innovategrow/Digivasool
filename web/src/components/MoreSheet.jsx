import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useLanguage } from '../context/LanguageContext';
import BottomSheet from './BottomSheet';
import {
  LayoutDashboard, Users, BookOpen, BarChart3, Receipt, UserCog, LogOut,
  CreditCard, Languages, Trash2, ChevronRight, UserRound,
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
];

// "More" menu: every destination that doesn't fit in the bottom tab bar.
export default function MoreSheet({ open, onClose, collectorMode = false }) {
  const { user, logout } = useAuth();
  const { derived } = useAppData();
  const { t, language, setLanguage, LANGUAGES } = useLanguage();
  const nav = collectorMode ? COLLECTOR_NAV : ADMIN_NAV;

  return (
    <BottomSheet open={open} onClose={onClose} title={t('more')}>
      <div className="more-user">
        <div className="more-avatar">{user?.name?.charAt(0)?.toUpperCase()}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="more-user-name">{user?.name}</div>
          <div className="more-user-role">{user?.role?.toUpperCase()}{user?.demo ? ' · DEMO' : ''}</div>
        </div>
      </div>

      <nav className="more-nav">
        {nav.map(item => (
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
