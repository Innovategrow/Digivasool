import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Lock, Clock, X } from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';

// Reminder thresholds: shown at 7, 3 and 1 day(s) left. Each is shown once per organisation
// (dismissing it hides it for good), so it never turns into a repeating popup. Exempt organisations see nothing.
const seenKey = (org, level) => `dk_trial_seen_${org}_${level}`;
const levelFor = (days) => (days <= 1 ? 1 : days <= 3 ? 3 : 7);
const wasSeen = (org, level) => { try { return localStorage.getItem(seenKey(org, level)) === '1'; } catch { return false; } };

export default function SubscriptionBanner() {
  const { sub } = useSubscription();
  const { user } = useAuth();
  const [, force] = useState(0);
  if (!sub) return null;
  const owner = sub.can_manage;
  const org = user?.organization?.id || '';

  if (sub.read_only) {
    return (
      <div className="sub-banner sub-banner-red" role="status">
        <Lock size={16} />
        <div className="sub-banner-text">
          <strong>{sub.state === 'trial_expired' ? 'Your free trial has ended.' : 'Your DigiVasool subscription has expired.'}</strong>{' '}
          Records are view-only until {owner ? 'you renew' : 'the owner renews'}.
        </div>
        {owner && <NavLink to="/subscription" className="btn btn-sm btn-primary">Renew</NavLink>}
      </div>
    );
  }

  if (sub.state === 'trial' && owner && sub.days_remaining <= 7) {
    const level = levelFor(sub.days_remaining);
    if (wasSeen(org, level)) return null;
    const dismiss = () => { try { localStorage.setItem(seenKey(org, level), '1'); } catch { /* ignore */ } force(n => n + 1); };
    return (
      <div className="sub-banner sub-banner-amber" role="status">
        <Clock size={16} />
        <div className="sub-banner-text">
          Free trial: <strong>{sub.days_remaining} day{sub.days_remaining === 1 ? '' : 's'} left</strong>.
        </div>
        <NavLink to="/subscription" className="btn btn-sm btn-secondary">Choose plan</NavLink>
        <button type="button" className="icon-btn sub-banner-x" aria-label="Dismiss" onClick={dismiss}><X size={14} /></button>
      </div>
    );
  }
  return null;
}
