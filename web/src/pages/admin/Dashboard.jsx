import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { AlertTriangle, Target, ArrowRight, Activity, IndianRupee, ClipboardList, Hourglass, Inbox, UserPlus, Banknote, BarChart3, Search, SlidersHorizontal } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../utils/api';

function AnimatedNumber({ value, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const dur = 800, steps = 40, step = value / steps;
    let cur = 0, i = 0;
    const t = setInterval(() => {
      cur = Math.min(cur + step, value);
      setDisplay(Math.round(cur));
      if (++i >= steps) clearInterval(t);
    }, dur / steps);
    return () => clearInterval(t);
  }, [value]);
  return <>{prefix}{display.toLocaleString()}{suffix}</>;
}

// Animated circular progress ring for recovery rate
function RecoveryRing({ percent }) {
  const size = 132, stroke = 12, r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circ);
  useEffect(() => {
    const t = setTimeout(() => setOffset(circ - (Math.min(percent, 100) / 100) * circ), 120);
    return () => clearTimeout(t);
  }, [percent, circ]);
  const color = percent >= 75 ? 'var(--green)' : percent >= 50 ? 'var(--amber)' : 'var(--red)';
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} className="metric-ring">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: 'var(--mono)' }}>{percent}%</div>
        <div style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1 }}>Recovered</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { derived, state, actions } = useAppData();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { todayCollected, overdueCount } = derived;
  const [apiStats, setApiStats] = useState(null);
  const [mobileFilter, setMobileFilter] = useState('due');

  useEffect(() => { actions.refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiFetch('/api/loans/stats')
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setApiStats(d))
      .catch(() => {});
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const todayInstallments = state.installments.filter(i => i.dueDate === today);
  const todayPaid = todayInstallments.filter(i => i.status === 'paid').length;
  const todayPending = todayInstallments.filter(i => i.status !== 'paid').length;
  const dueToday = todayInstallments.filter(i => i.status !== 'paid');
  const overdueItems = state.installments.filter(i => i.status === 'overdue');

  const activeCount = apiStats?.active_loans || derived.activeLoans.length;
  const outstanding = apiStats?.total_outstanding || derived.totalOutstanding;
  const totalCollected = apiStats?.total_collected || derived.totalCollected;
  const recoveryRate = apiStats?.recovery_rate ?? Math.round(
    (derived.totalCollected / Math.max(derived.totalCollected + derived.totalOutstanding, 1)) * 100
  );
  const expectedToday = todayInstallments.reduce((s, i) => s + i.amount, 0);
  const todayProgress = expectedToday > 0 ? Math.round((todayCollected / expectedToday) * 100) : 0;

  return (
    <div className="animate-fadeUp">
      <div className="mobile-home">
        <div className="mh-header">
          <div>
            <div className="mh-greeting">{t('helloGreeting')}, {user?.name?.split(' ')[0] || 'there'}</div>
            <div className="mh-sub">{t('welcomeBack')} {t('appName')}</div>
          </div>
          <div className="mh-avatar">{user?.name?.charAt(0)?.toUpperCase() || 'A'}</div>
        </div>

        <div className="mh-search-row">
          <div className="mh-search" onClick={() => navigate('/borrowers')}>
            <Search size={16} /><span>{t('searchBorrowers')}</span>
          </div>
          <button className="mh-filter-btn" onClick={() => navigate('/collection')}>
            <SlidersHorizontal size={18} />
          </button>
        </div>

        <div className="mh-hero">
          <div className="mh-hero-label">{t('collectedToday')}</div>
          <div className="mh-hero-amount">₹<AnimatedNumber value={todayCollected} /></div>
          <div className="mh-hero-progress-track">
            <div className="mh-hero-progress-fill" style={{ width: `${Math.min(todayProgress, 100)}%` }} />
          </div>
          <div className="mh-hero-foot">
            <span>{todayProgress}% of ₹{expectedToday.toLocaleString()} expected</span>
            <span>{recoveryRate}% recovered overall</span>
          </div>
        </div>

        <div className="mh-quick-row">
          <button className="mh-quick-btn" onClick={() => navigate('/borrowers?add=1')}><UserPlus size={18} />{t('newLoan')}</button>
          <button className="mh-quick-btn" onClick={() => navigate('/collection')}><Banknote size={18} />{t('collect')}</button>
          <button className="mh-quick-btn" onClick={() => navigate('/reports')}><BarChart3 size={18} />{t('reports')}</button>
        </div>

        <div className="stat-grid">
          {[
            { id: 'activeBorrowers', label: t('activeBorrowers'), value: activeCount, color: 'var(--brand-light)', icon: ClipboardList },
            { id: 'totalOutstanding', label: t('totalOutstanding'), value: outstanding, prefix: '₹', color: 'var(--amber)', icon: Hourglass },
            { id: 'totalCollected', label: t('totalCollected'), value: totalCollected, prefix: '₹', color: 'var(--green)', icon: Inbox },
            { id: 'dueToday', label: t('dueToday'), value: todayPending, suffix: ` / ${todayPaid + todayPending}`, color: 'var(--cyan)', icon: IndianRupee },
          ].map(s => (
            <div key={s.id} className="stat-tile">
              <div className="stat-tile-label"><s.icon size={14} /> {s.label}</div>
              <div className="stat-tile-value" style={{ color: s.color }}><AnimatedNumber value={s.value} prefix={s.prefix || ''} suffix={s.suffix || ''} /></div>
              {s.id === 'activeBorrowers' && overdueCount > 0 && (
                <div className="stat-tile-note"><AlertTriangle size={11} /> {overdueCount} overdue</div>
              )}
            </div>
          ))}
        </div>

        <div className="mh-pills">
          <button className={`mh-pill${mobileFilter === 'due' ? ' active' : ''}`} onClick={() => setMobileFilter('due')}>{t('dueToday')} ({dueToday.length})</button>
          <button className={`mh-pill${mobileFilter === 'overdue' ? ' active' : ''}`} onClick={() => setMobileFilter('overdue')}>{t('overdueAlerts')} ({overdueItems.length})</button>
        </div>

        {mobileFilter === 'due' ? (
          <>
            <div className="mh-row-header">
              <span className="mh-section-title">{t('dueToday')}</span>
              <button className="mh-see-all" onClick={() => navigate('/collection')}>{t('seeAll')} <ArrowRight size={12} /></button>
            </div>
            {dueToday.length === 0 ? (
              <div className="mh-empty">All today's dues collected!</div>
            ) : (
              <div className="mh-list">
                {dueToday.slice(0, 6).map(i => (
                  <div key={i.id} className="mh-list-item" onClick={() => navigate('/collection')}>
                    <div className="mh-item-avatar">{i.borrowerName.charAt(0).toUpperCase()}</div>
                    <div className="mh-item-info">
                      <div className="mh-item-name">{i.borrowerName}</div>
                      <div className="mh-item-meta">{i.phone}</div>
                    </div>
                    <div className="mh-item-amount" style={{ color: 'var(--amber)' }}>₹{i.amount.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mh-row-header">
              <span className="mh-section-title">{t('overdueAlerts')}</span>
              <button className="mh-see-all" onClick={() => navigate('/ledger')}>{t('seeAll')} <ArrowRight size={12} /></button>
            </div>
            {overdueItems.length === 0 ? (
              <div className="mh-empty">No overdue accounts!</div>
            ) : (
              <div className="mh-list">
                {overdueItems.slice(0, 6).map(i => (
                  <div key={i.id} className="mh-list-item" onClick={() => navigate('/ledger')}>
                    <div className="mh-item-avatar">{i.borrowerName.charAt(0).toUpperCase()}</div>
                    <div className="mh-item-info">
                      <div className="mh-item-name">{i.borrowerName}</div>
                      <div className="mh-item-meta">Due: {i.dueDate}</div>
                    </div>
                    <div className="mh-item-amount" style={{ color: 'var(--red)' }}>₹{i.amount.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="section-card recovery-card">
          <RecoveryRing percent={recoveryRate} />
          <div>
            <div className="section-card-title"><Activity size={15} /> Portfolio Recovery</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
              Collected <strong style={{ color: 'var(--green)' }}>₹{totalCollected.toLocaleString('en-IN')}</strong><br />
              Outstanding <strong style={{ color: 'var(--amber)' }}>₹{outstanding.toLocaleString('en-IN')}</strong>
            </div>
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-title"><Target size={15} /> Staff Performance · this month</div>
          {state.staff.filter(s => s.role === 'collector').length === 0 && <div className="muted-note">No collectors yet.</div>}
          {state.staff.filter(s => s.role === 'collector').map(s => {
            const pct = s.target > 0 ? Math.round((s.collected / s.target) * 100) : null;
            return (
              <div key={s.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ color: pct === null || pct >= 80 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
                    ₹{s.collected.toLocaleString('en-IN')}{pct !== null ? ` · ${pct}%` : ''}
                  </span>
                </div>
                {pct !== null && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--red)' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
