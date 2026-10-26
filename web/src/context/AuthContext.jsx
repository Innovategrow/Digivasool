import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// Login is switched off for now: everyone is the admin. Flip to false to bring the login screen back.
const AUTH_DISABLED = true;
const DEFAULT_USER = { role: 'admin', name: 'Admin', phone: '', token: '' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(AUTH_DISABLED ? DEFAULT_USER : null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (AUTH_DISABLED) { setLoading(false); return; }
    const saved = localStorage.getItem('dk_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Sessions from before token-based login can't call the API any more
        if (parsed.token) setUser(parsed);
        else localStorage.removeItem('dk_user');
      } catch { /* ignore a corrupted saved session */ }
    }
    setLoading(false);
  }, []);

  const login = (role, name, phone = '', token = '') => {
    const u = { role, name, phone, token };
    setUser(u);
    localStorage.setItem('dk_user', JSON.stringify(u));
  };

  const logout = () => {
    if (AUTH_DISABLED) return;
    setUser(null);
    localStorage.removeItem('dk_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
