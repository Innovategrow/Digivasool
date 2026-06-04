import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import Sidebar from './components/Sidebar';
import { Bell, Menu } from 'lucide-react';

// Pages - Admin
import Dashboard from './pages/admin/Dashboard';
import Borrowers from './pages/admin/Borrowers';
import NewLoan from './pages/admin/NewLoan';
import Ledger from './pages/admin/Ledger';
import Staff from './pages/admin/Staff';
import Reports from './pages/admin/Reports';
import Expenses from './pages/admin/Expenses';
import Members from './pages/admin/Members';
import CollectionEntry from './pages/admin/CollectionEntry';
import Profile from './pages/admin/Profile';
import Transactions from './pages/admin/Transactions';

// Pages - Collector/Member
import Login from './pages/Login';
import MyLoan from './pages/user/MyLoan';
import CollectPayment from './pages/collector/CollectPayment';
import CollectorHistory from './pages/collector/CollectorHistory';

import { Link } from 'react-router-dom';
import { CreditCard, ClipboardList, LogOut } from 'lucide-react';

function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    if (user.role === 'member') return <Navigate to="/my-loan" replace />;
    if (user.role === 'collector') return <Navigate to="/collector" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
}

// ── Desktop Admin Shell ────────────────────────────────────────────────────
function AdminShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { derived, state, dispatch } = useAppData();
  const location = useLocation();

  const pageTitle = {
    '/': 'Dashboard', '/borrowers': 'Borrowers', '/new-loan': 'New Borrower & Loan',
    '/ledger': 'Ledger', '/expenses': 'Expenses', '/reports': 'Reports',
    '/staff': 'Staff Management', '/settings': 'Settings',
    '/members': 'Members', '/collection': 'Collection Entry', '/profile': 'Profile',
  }[location.pathname] || 'VasoolPro';

  return (
    <div className="app-layout">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

      <div className="main-content">
        {/* Header */}
        <div className="main-header">
          {collapsed && (
            <button onClick={() => setCollapsed(false)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}>
              <Menu size={20} />
            </button>
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{pageTitle}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* Notification Bell */}
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
                <div style={{ position: 'absolute', top: 44, right: 0, width: 320, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 16, zIndex: 300, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Notifications</div>
                  {state.notifications.slice(0, 5).map(n => (
                    <div key={n.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', marginBottom: 8, fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{n.message}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{n.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Today's stat pill */}
            <div style={{ background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 10, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
              ₹{derived.todayCollected.toLocaleString()} Today
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="page-area">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/borrowers"   element={<Borrowers />} />
            <Route path="/new-loan"    element={<NewLoan />} />
            <Route path="/ledger"      element={<Ledger />} />
            <Route path="/expenses"    element={<Expenses />} />
            <Route path="/reports"     element={<Reports />} />
            <Route path="/staff"       element={<Staff />} />
            <Route path="/members"     element={<Members />} />
            <Route path="/collection"  element={<CollectionEntry />} />
            <Route path="/profile"     element={<Profile />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/settings"    element={<div className="empty-state"><div className="empty-icon">⚙️</div><div className="empty-title">Settings coming soon</div></div>} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

// ── Collector Shell ────────────────────────────────────────────────────────
function CollectorShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navItems = [
    { to: '/collector',         icon: <CreditCard size={22} />,    label: 'Collect' },
    { to: '/collector/history', icon: <ClipboardList size={22} />, label: 'History' },
  ];
  return (
    <div className="app-container">
      <div className="app-header">
        <div>
          <h1 className="app-header-title">VasoolPro</h1>
          <p style={{ fontSize: 12, color: 'var(--text-2)' }}>
            <span style={{ background: 'var(--amber-soft)', color: 'var(--amber)', padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 11 }}>COLLECTOR</span>
            {' '}{user?.name}
          </p>
        </div>
        <button onClick={logout} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 12, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>
      <div className="content-area">
        <Routes>
          <Route path="/"        element={<CollectPayment />} />
          <Route path="/history" element={<CollectorHistory />} />
        </Routes>
      </div>
      <nav className="bottom-nav">
        {navItems.map(item => (
          <Link key={item.to} to={item.to} className={`nav-item ${location.pathname === item.to ? 'active' : ''}`}>
            {item.icon}<span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

// ── App Routes ─────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to={user.role === 'member' ? '/my-loan' : user.role === 'collector' ? '/collector' : '/'} replace /> : <Login />
      } />
      <Route path="/my-loan"     element={<ProtectedRoute role="member"><MyLoan /></ProtectedRoute>} />
      <Route path="/collector/*" element={<ProtectedRoute role="collector"><CollectorShell /></ProtectedRoute>} />
      <Route path="/*"           element={<ProtectedRoute role="admin"><AdminShell /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppDataProvider>
        <AppRoutes />
      </AppDataProvider>
    </AuthProvider>
  );
}
