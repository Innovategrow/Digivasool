import { Routes, Route, Navigate, useLocation, NavLink } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ToastProvider } from './components/Toast';
import MoreSheet from './components/MoreSheet';
import BottomSheet from './components/BottomSheet';
import { apiFetch } from './utils/api';
import { Bell, Menu, LayoutDashboard, Users, CreditCard, BookOpen, UserCheck, Check, X, Wallet } from 'lucide-react';

import Dashboard from './pages/admin/Dashboard';
import Ledger from './pages/admin/Ledger';
import Staff from './pages/admin/Staff';
import Expenses from './pages/admin/Expenses';
import Members from './pages/admin/Members';
import CollectionEntry from './pages/admin/CollectionEntry';
import Profile from './pages/admin/Profile';
import Transactions from './pages/admin/Transactions';
import RecycleBin from './pages/admin/RecycleBin';

import Login from './pages/Login';

// Heavier screens (charts, PDF/receipt export) load on demand to keep the first load small on phones
const Reports = lazy(() => import('./pages/admin/Reports'));
const CollectPayment = lazy(() => import('./pages/collector/CollectPayment'));
const CollectorHistory = lazy(() => import('./pages/collector/CollectorHistory'));
const MyLoan = lazy(() => import('./pages/user/MyLoan'));

function ScreenLoader() {
  return <div className="customer-skeleton-list"><div className="skeleton customer-skeleton-row" /><div className="skeleton customer-skeleton-row" /></div>;
}

const ADMIN_TABS = [
  { to: '/',           icon: LayoutDashboard, labelKey: 'home' },
  { to: '/borrowers',  icon: Users,           labelKey: 'borrowers' },
  { to: '/collection', icon: CreditCard,      labelKey: 'collect' },
  { to: '/ledger',     icon: BookOpen,        labelKey: 'ledger' },
];

const COLLECTOR_TABS = [
  { to: '/collector',           icon: CreditCard, labelKey: 'collect' },
  { to: '/collector/borrowers', icon: Users,      labelKey: 'borrowers' },
  { to: '/collector/history',   icon: BookOpen,   labelKey: 'history' },
];

const HOME_FOR_ROLE = { admin: '/', collector: '/collector', borrower: '/my-loan' };

const PAGE_TITLES = {
  '/': 'dashboard', '/borrowers': 'borrowers', '/ledger': 'ledger', '/expenses': 'expenses',
  '/reports': 'reports', '/staff': 'staff', '/recycle-bin': 'recycleBin', '/collection': 'collection',
  '/profile': 'profile', '/transactions': 'ledgerBook',
  '/collector': 'collectPayment', '/collector/borrowers': 'borrowers', '/collector/history': 'history',
};

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_FOR_ROLE[user.role] || '/login'} replace />;
  return children;
}

function NotificationsSheet({ open, onClose, accessRequests, onRespond }) {
  const { state } = useAppData();
  const { t } = useLanguage();
  return (
    <BottomSheet open={open} onClose={onClose} title={t('notifications')}>
      {accessRequests.map(req => (
        <div key={req.id} className="notif-card notif-request">
          <div className="notif-title"><UserCheck size={15} /> Admin access request</div>
          <div className="notif-text"><strong>{req.name}</strong> ({req.phone}) wants admin access.</div>
          <div className="notif-actions">
            <button type="button" className="btn btn-success" onClick={() => onRespond(req.id, true)}><Check size={15} /> Approve</button>
            <button type="button" className="btn btn-secondary" onClick={() => onRespond(req.id, false)}><X size={15} /> Deny</button>
          </div>
        </div>
      ))}
      {state.notifications.slice(0, 8).map(n => (
        <div key={n.id} className="notif-card">
          <div className="notif-text" style={{ fontWeight: 600, color: 'var(--text)' }}>{n.message}</div>
          <div className="notif-time">{n.time}</div>
        </div>
      ))}
      {accessRequests.length === 0 && state.notifications.length === 0 && (
        <div className="mh-empty">No notifications</div>
      )}
    </BottomSheet>
  );
}

// One mobile app shell for every role and every screen size.
function MobileShell({ collectorMode = false }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accessRequests, setAccessRequests] = useState([]);
  const { user } = useAuth();
  const { derived, actions } = useAppData();
  const { t } = useLanguage();
  const location = useLocation();

  useEffect(() => {
    if (collectorMode || user?.role !== 'admin') return;
    let cancelled = false;
    const load = () => {
      apiFetch('/api/admin/access-requests')
        .then(r => (r.ok ? r.json() : []))
        .then(data => { if (!cancelled) setAccessRequests(Array.isArray(data) ? data : []); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [collectorMode, user?.role]);

  async function respondToAccessRequest(id, approve) {
    try {
      const res = await apiFetch(`/api/admin/access-requests/${id}/${approve ? 'approve' : 'deny'}`, { method: 'POST' });
      if (res.ok) setAccessRequests(current => current.filter(r => r.id !== id));
    } catch {
      // leave it in the list; the admin can retry
    }
  }

  const path = location.pathname.replace(/\/+$/, '') || '/';
  const titleKey = PAGE_TITLES[path]
    || (path.startsWith('/borrowers/') || path.startsWith('/collector/borrowers/') ? 'borrowers' : null);
  const pageTitle = titleKey ? t(titleKey) : t('appName');
  const tabs = collectorMode ? COLLECTOR_TABS : ADMIN_TABS;
  const badgeCount = derived.unreadNotifications + accessRequests.length;

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-bar-brand"><Wallet size={16} /></div>
        <div className="app-bar-titles">
          <div className="app-bar-title">{pageTitle}</div>
          <div className="app-bar-sub">{t('appName')}</div>
        </div>
        <div className="app-bar-actions">
          {!collectorMode && (
            <span className="today-chip">₹{derived.todayCollected.toLocaleString('en-IN')} {t('today')}</span>
          )}
          {!collectorMode && (
            <button type="button" className="icon-btn" aria-label={t('notifications')}
              onClick={() => { setNotifOpen(true); actions.markNotificationsRead(); }}>
              <Bell size={18} />
              {badgeCount > 0 && <span className="icon-badge">{badgeCount}</span>}
            </button>
          )}
        </div>
      </header>

      <main className="page-area">
        <Suspense fallback={<ScreenLoader />}>
        <Routes>
          {!collectorMode ? (
            <>
              <Route path="/"             element={<Dashboard />} />
              <Route path="/borrowers/*"  element={<Members />} />
              <Route path="/new-loan"     element={<Navigate to="/borrowers?add=1" replace />} />
              <Route path="/ledger"       element={<Ledger />} />
              <Route path="/expenses"     element={<Expenses />} />
              <Route path="/reports"      element={<Reports />} />
              <Route path="/staff"        element={<Staff />} />
              <Route path="/collection"   element={<CollectionEntry />} />
              <Route path="/profile"      element={<Profile />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/recycle-bin"  element={<RecycleBin />} />
              <Route path="/settings"     element={<Navigate to="/profile" replace />} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="/"            element={<CollectPayment />} />
              <Route path="/borrowers/*" element={<Members readOnly basePath="/collector/borrowers" />} />
              <Route path="/history"     element={<CollectorHistory />} />
              <Route path="*"            element={<Navigate to="/collector" replace />} />
            </>
          )}
        </Routes>
        </Suspense>
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map(tab => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/' || tab.to === '/collector'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <tab.icon size={21} />
            <span>{t(tab.labelKey)}</span>
          </NavLink>
        ))}
        <button type="button" className={`nav-item${moreOpen ? ' active' : ''}`} onClick={() => setMoreOpen(true)}>
          <Menu size={21} />
          <span>{t('more')}</span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} collectorMode={collectorMode} />
      {!collectorMode && (
        <NotificationsSheet open={notifOpen} onClose={() => setNotifOpen(false)}
          accessRequests={accessRequests} onRespond={respondToAccessRequest} />
      )}
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to={HOME_FOR_ROLE[user.role] || '/'} replace /> : <Login />
      } />
      <Route path="/my-loan" element={
        <ProtectedRoute roles={['borrower']}>
          <div className="app-scroll"><Suspense fallback={<ScreenLoader />}><MyLoan /></Suspense></div>
        </ProtectedRoute>
      } />
      <Route path="/collector/*" element={
        <ProtectedRoute roles={['collector']}>
          <MobileShell collectorMode />
        </ProtectedRoute>
      } />
      <Route path="/*" element={
        <ProtectedRoute roles={['admin']}>
          <MobileShell />
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
          <div className="app-frame">
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </div>
        </AppDataProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
