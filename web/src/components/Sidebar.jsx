import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import {
  LayoutDashboard, Users, PlusCircle, BookOpen,
  BarChart3, Receipt, UserCog, Settings, LogOut,
  ChevronLeft, Bell, TrendingUp
} from 'lucide-react';

const NAV = [
  { section: 'Main' },
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/borrowers',icon: Users,           label: 'Borrowers' },
  { to: '/new-loan', icon: PlusCircle,      label: 'New Loan',  highlight: true },
  { to: '/ledger',   icon: BookOpen,        label: 'Ledger' },
  { section: 'Finance' },
  { to: '/expenses', icon: Receipt,         label: 'Expenses' },
  { to: '/reports',  icon: BarChart3,       label: 'Reports' },
  { section: 'System' },
  { to: '/staff',    icon: UserCog,         label: 'Staff' },
  { to: '/settings', icon: Settings,        label: 'Settings' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const { derived } = useAppData();
  const navigate = useNavigate();

  return (
    <div className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Logo */}
      <div className="sb-logo">
        <div className="sb-logo-icon">💰</div>
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div className="sb-logo-text">VasoolPro</div>
            <div className="sb-logo-sub">Micro Finance System</div>
          </div>
        )}
        {!collapsed && (
          <button onClick={onToggle} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="sb-nav">
        {NAV.map((item, i) => {
          if (item.section) {
            return !collapsed ? (
              <div key={i} className="sb-section-label">{item.section}</div>
            ) : <div key={i} style={{ height: 8 }} />;
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
              title={collapsed ? item.label : ''}
            >
              {({ isActive }) => (
                <>
                  <span className="sb-item-icon">
                    <item.icon size={18} style={{ color: isActive ? 'var(--brand-light)' : item.highlight ? 'var(--green)' : undefined }} />
                  </span>
                  {!collapsed && <span className="sb-item-label">{item.label}</span>}
                  {!collapsed && item.to === '/ledger' && derived.overdueCount > 0 && (
                    <span className="sb-item-badge">{derived.overdueCount}</span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="sb-footer">
        {!collapsed ? (
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
