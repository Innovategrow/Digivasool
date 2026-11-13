import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiFetch } from '../utils/api';

const SubscriptionContext = createContext({ sub: null, readOnly: false, refresh: () => {} });

// The server decides everything here (state, days left, read-only). The browser only displays it:
// nothing in this file can grant access, and the server refuses writes in read-only mode regardless.
export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [fetched, setFetched] = useState(null);
  const enabled = Boolean(user?.token) && user.role !== 'borrower';

  const fetchCurrent = useCallback(async () => {
    if (!enabled) return null;
    try {
      const res = await apiFetch('/api/subscriptions/current');
      if (res.ok) return await res.json();
    } catch { /* offline: keep the last known state */ }
    return null;
  }, [enabled]);

  const refresh = useCallback(async () => {
    const data = await fetchCurrent();
    if (data) setFetched(data);
    return data;
  }, [fetchCurrent]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = () => fetchCurrent().then(d => { if (!cancelled && d) setFetched(d); });
    load();
    window.addEventListener('dv:subscription-blocked', load);      // a write was refused with 402
    const timer = setInterval(load, 5 * 60 * 1000);                // pick up expiry while the app stays open
    return () => { cancelled = true; window.removeEventListener('dv:subscription-blocked', load); clearInterval(timer); };
  }, [enabled, fetchCurrent]);

  const sub = enabled ? fetched : null;     // nothing is shown (or kept) once signed out
  const value = useMemo(() => ({ sub, readOnly: Boolean(sub?.read_only), refresh }), [sub, refresh]);
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSubscription = () => useContext(SubscriptionContext);
