import { Routes, Route, Navigate, useLocation, NavLink } from 'react-router-dom';
import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import Sidebar from './components/Sidebar';
import { Bell, Menu, Settings, LayoutDashboard, Users, CreditCard, BookOpen } from 'lucide-react';

const ADMIN_MOBILE_TABS = [
  { to: '/',           icon: LayoutDashboard, labelKey: 'home' },
  { to: '/borrowers',  icon: Users,           labelKey: 'borrowers' },
  { to: '/collection', icon: CreditCard,      labelKey: 'collect' },
  { to: '/ledger',     icon: BookOpen,        labelKey: 'ledger' },
];

const COLLECTOR_MOBILE_TABS = [
  { to: '/collector',           icon: CreditCard, labelKey: 'collect' },
  { to: '/collector/borrowers', icon: Users,      labelKey: 'borrowers' },
  { to: '/collector/history',   icon: BookOpen,   labelKey: 'history' },
];

import Dashboard from './pages/admin/Dashboard';
import Ledger from './pages/admin/Ledger';
import Staff from './pages/admin/Staff';
import Reports from './pages/admin/Reports';
import Expenses from './pages/admin/Expenses';
import Members from './pages/admin/Members';
import CollectionEntry from './pages/admin/CollectionEntry';
import Profile from './pages/admin/Profile';
import Transactions from './pages/admin/Transactions';

import Login from './pages/Login';
import CollectPayment from './pages/collector/CollectPayment';
import CollectorHistory from './pages/collector/CollectorHistory';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    if (user.role === 'collector') return <Navigate to="/collector" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
}

function DesktopShell({ collectorMode = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { derived, state, dispatch } = useAppData();
  const { t } = useLanguage();
  const location = useLocation();

  const pageTitleKey = {
    '/': 'dashboard', '/borrowers': 'borrowers', '/new-loan': 'borrowers',
    '/ledger': 'ledger', '/expenses': 'expenses', '/reports': 'reports',
    '/staff': 'staff', '/settings': 'settings',
    '/collection': 'collection', '/profile': 'profile',
    '/collector': 'collectPayment', '/collector/borrowers': 'borrowers',
    '/collector/history': 'history',
  }[location.pathname];
  const pageTitle = pageTitleKey ? t(pageTitleKey) : t('appName');

  return (
    <div className="app-layout">
      <div className={`mobile-nav-backdrop${mobileNavOpen ? ' show' : ''}`} onClick={() => setMobileNavOpen(false)} />
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} collectorMode={collectorMode}
        mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />

      <div className="main-content">
        <div className="main-header animate-slideDown">
          {collapsed && (
            <button onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}>
              <Menu size={20} />
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{pageTitle}</div>
            <div className="header-date" style={{ fontSize: 11, color: 'var(--text-2)' }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            {!collectorMode && (
              <div style={{ position: 'relative' }}>
                <button onClick={() => { setNotifOpen(o => !o); dispatch({ type: 'MARK_NOTIFICATIONS_READ' }); }}
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)' }}>
                  <Bell size={16} />
                </button>
                {derived.unreadNotifications > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {derived.unreadNotifications}
                  </span>
                )}
                {notifOpen && (
                  <div style={{ position: 'absolute', top: 44, right: 0, width: 320, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 16, zIndex: 300, boxShadow: '0 20px 60px rgba(15,23,42,.14)' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{t('notifications')}</div>
                    {state.notifications.slice(0, 5).map(n => (
                      <div key={n.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', marginBottom: 8, fontSize: 13 }}>
                        <div style={{ fontWeight: 600 }}>{n.message}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{n.time}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="header-today-badge" style={{ background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 10, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>
              ₹{derived.todayCollected.toLocaleString()} {t('today')}
            </div>
          </div>
        </div>

        <div className="page-area">
          <Routes>
            {!collectorMode ? (
              <>
                <Route path="/"            element={<Dashboard />} />
                <Route path="/borrowers"   element={<Members />} />
                <Route path="/new-loan"    element={<Navigate to="/borrowers" replace />} />
                <Route path="/ledger"      element={<Ledger />} />
                <Route path="/expenses"    element={<Expenses />} />
                <Route path="/reports"     element={<Reports />} />
                <Route path="/staff"       element={<Staff />} />
                <Route path="/collection"  element={<CollectionEntry />} />
                <Route path="/profile"     element={<Profile />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/settings"    element={<div className="empty-state"><div className="empty-icon"><Settings size={32} /></div><div className="empty-title">{t('settingsComingSoon')}</div></div>} />
              </>
            ) : (
              <>
                <Route path="/"           element={<CollectPayment />} />
                <Route path="/borrowers"   element={<Members readOnly />} />
                <Route path="/history"    element={<CollectorHistory />} />
              </>
            )}
          </Routes>
        </div>

        <nav className="bottom-nav mobile-only">
          {(collectorMode ? COLLECTOR_MOBILE_TABS : ADMIN_MOBILE_TABS).map(tab => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === '/' || tab.to === '/collector'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <tab.icon size={20} />
              <span>{t(tab.labelKey)}</span>
            </NavLink>
          ))}
          <button className="nav-item" onClick={() => setMobileNavOpen(true)}>
            <Menu size={20} />
            <span>{t('more')}</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to={user.role === 'collector' ? '/collector' : '/'} replace /> : <Login />
      } />
      <Route path="/collector/*" element={
        <ProtectedRoute roles={['collector']}>
          <DesktopShell collectorMode />
        </ProtectedRoute>
      } />
      <Route path="/*" element={
        <ProtectedRoute roles={['admin']}>
          <DesktopShell />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppDataProvider>
          <AppRoutes />
        </AppDataProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
