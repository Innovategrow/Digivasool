import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';

// Admin-only "view as" preview. It changes WHAT IS SHOWN, never who you are: the auth session, token and role
// are untouched and the server keeps authorising every request as the real admin. The state lives in memory
// only, so a refresh, logout or organisation switch (all full reloads) always drops back to the admin screens,
// and typing a /collector or /my-loan URL can never open a preview by itself.
const PreviewContext = createContext(null);

export function PreviewProvider({ children }) {
  const { user } = useAuth();
  const [raw, setRaw] = useState(null);
  // Where the admin was when the preview began. Kept after exit so the route guard can send them back there,
  // instead of racing the router's own navigation and dropping them on the dashboard.
  const returnRef = useRef('/');

  // A preview only counts while it still belongs to the signed-in admin of the same organisation.
  const preview = useMemo(() => {
    if (!raw || !user || user.role !== 'admin') return null;
    if (raw.originalUserId !== user.phone || raw.originalOrganizationId !== user.organization?.id) return null;
    return raw;
  }, [raw, user]);

  const startPreview = useCallback((mode, { returnPath = '/', borrower = null } = {}) => {
    if (!user || user.role !== 'admin') return false;
    returnRef.current = returnPath;
    setRaw({
      mode, borrower, returnPath,
      originalUserId: user.phone, originalOrganizationId: user.organization?.id, originalRole: user.member_role || user.role,
    });
    return true;
  }, [user]);

  const selectBorrower = useCallback((borrower) => setRaw(p => (p ? { ...p, borrower } : p)), []);
  const exitPreview = useCallback(() => setRaw(null), []);

  const getReturnPath = useCallback(() => returnRef.current, []);
  const value = useMemo(() => ({ preview, startPreview, selectBorrower, exitPreview, getReturnPath }),
    [preview, startPreview, selectBorrower, exitPreview, getReturnPath]);
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePreview = () => useContext(PreviewContext);
