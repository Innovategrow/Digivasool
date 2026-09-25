import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('dk_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Sessions from before token-based login can't call the API any more
        if (parsed.demo || parsed.token) setUser(parsed);
        else localStorage.removeItem('dk_user');
      } catch { /* ignore a corrupted saved session */ }
    }
    setLoading(false);
  }, []);

  const login = (role, name, phone = '', demo = false, token = '') => {
    const u = { role, name, phone, demo, token };
    setUser(u);
    localStorage.setItem('dk_user', JSON.stringify(u));
  };

  const logout = () => {
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
