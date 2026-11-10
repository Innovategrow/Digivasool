import { createContext, useContext, useState } from 'react';
import { API_BASE_URL } from '../config';
import { clearSession } from '../utils/api';

const AuthContext = createContext(null);

// The saved session only holds what the server gave us at login (token + display details).
// Which organisation you are in, and what you may do, is always decided by the server from the token.
function loadSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem('dk_user') || 'null');
    // Sessions from before organisation-scoped login can't call the API any more
    if (parsed?.token && parsed?.organization?.id) return parsed;
    if (parsed) localStorage.removeItem('dk_user');
  } catch { /* ignore a corrupted saved session */ }
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadSession);

  // `data` is the server's login response: { role, member_role, name, phone, token, organization, business? }
  const login = (data) => {
    const u = {
      role: data.role, member_role: data.member_role || '', name: data.name, phone: data.phone || '',
      token: data.token, organization: data.organization,
    };
    clearSession();                       // never carry the previous organisation's cached state over
    if (data.business) { try { localStorage.setItem('dk_business', data.business); } catch { /* ignore */ } }
    localStorage.setItem('dk_user', JSON.stringify(u));
    setUser(u);
  };

  const logout = async () => {
    const token = user?.token;
    setUser(null);
    if (token) {   // end the session on the server too (best effort - the device is signed out regardless)
      try { await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch { /* offline */ }
    }
    clearSession();
    window.location.assign('/login');     // full reload: no data from this organisation stays in memory
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading: false }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
