import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useLanguage } from '../context/LanguageContext';
import {
  LayoutDashboard, Users, BookOpen,
  BarChart3, Receipt, UserCog, Settings, LogOut,
  ChevronLeft, TrendingUp, CreditCard, Wallet, Languages
} from 'lucide-react';

const ADMIN_NAV = [
  { section: 'navMain' },
  { to: '/',          icon: LayoutDashboard, labelKey: 'dashboard' },
  { to: '/borrowers', icon: Users,           labelKey: 'borrowers', highlight: true },
  { to: '/collection',icon: CreditCard,      labelKey: 'collection' },
  { to: '/ledger',    icon: BookOpen,        labelKey: 'ledger' },
  { section: 'navFinance' },
  { to: '/expenses',  icon: Receipt,         labelKey: 'expenses' },
  { to: '/reports',   icon: BarChart3,       labelKey: 'reports' },
  { section: 'navSystem' },
  { to: '/staff',     icon: UserCog,         labelKey: 'staff' },
  { to: '/settings',  icon: Settings,        labelKey: 'settings' },
];

const COLLECTOR_NAV = [
  { section: 'navCollector' },
  { to: '/collector',          icon: CreditCard,      labelKey: 'collectPayment' },
  { to: '/collector/borrowers',icon: Users,           labelKey: 'borrowers' },
  { to: '/collector/history',  icon: BookOpen,        labelKey: 'history' },
];

export default function Sidebar({ collapsed, onToggle, collectorMode = false, mobileOpen = false, onNavigate }) {
  const { user, logout } = useAuth();
  const { derived } = useAppData();
  const { t, language, setLanguage, LANGUAGES } = useLanguage();
  const NAV = collectorMode ? COLLECTOR_NAV : ADMIN_NAV;

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="sb-logo">
        <div className="sb-logo-icon"><Wallet size={18} color="#fff" /></div>
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div className="sb-logo-text">{t('appName')}</div>
            <div className="sb-logo-sub">{t('appTagline')}</div>
          </div>
        )}
        {!collapsed && (
          <button onClick={onToggle} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      <nav className="sb-nav">
        {NAV.map((item, i) => {
          if (item.section) {
            return !collapsed ? (
              <div key={i} className="sb-section-label">{t(item.section)}</div>
            ) : <div key={i} style={{ height: 8 }} />;
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to === '/collector'}
              className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
              title={collapsed ? t(item.labelKey) : ''}
              onClick={onNavigate}
            >
              {({ isActive }) => (
                <>
                  <span className="sb-item-icon">
                    <item.icon size={18} style={{ color: isActive ? 'var(--brand-light)' : item.highlight ? 'var(--green)' : undefined }} />
                  </span>
                  {!collapsed && <span className="sb-item-label">{t(item.labelKey)}</span>}
                  {!collapsed && item.to === '/ledger' && derived.overdueCount > 0 && (
                    <span className="sb-item-badge">{derived.overdueCount}</span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="sb-footer">
        {!collapsed ? (
          <>
            <div className="sb-user">
              <div className="sb-avatar">{user?.name?.charAt(0)?.toUpperCase()}</div>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div className="sb-user-name">{user?.name}</div>
                <div className="sb-user-role">{user?.role?.toUpperCase()}</div>
              </div>
              <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                <LogOut size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <Languages size={14} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
              <select value={language} onChange={e => setLanguage(e.target.value)} title={t('language')}
                style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <button onClick={onToggle} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer', borderRadius: 8, padding: 8 }}>
              <TrendingUp size={16} />
            </button>
            <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 8 }}>
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
