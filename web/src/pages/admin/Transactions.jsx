import { useState, useEffect } from 'react';
import { ArrowLeft, BookOpen, Clock, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../utils/api';
import { useLanguage } from '../../context/LanguageContext';

export default function Transactions() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loans, setLoans] = useState([]);

  useEffect(() => {
    apiFetch('/api/loans/')
      .then(res => res.json())
      .then(data => setLoans(data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="screen-container pt-4">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px', color: 'var(--text)', cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>{t('ledgerBook')}</h2>
      </div>

      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {loans.map((loan, idx) => (
          <div key={loan.id} className="party-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '16px' }}>{loan.customer_name}</span>
              <span className={loan.pending_amount > 0 ? "text-warning" : "text-green"} style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                {loan.pending_amount > 0 ? `${t('dueColon')} ₹${loan.pending_amount}` : <><CheckCircle2 size={14} /> {t('settled')}</>}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><BookOpen size={14}/> {t('principalColon')} ₹{loan.loan_amount}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14}/> {t('paidColon')} ₹{loan.collected_amount}</span>
            </div>
          </div>
        ))}
        {loans.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-2)' }}>
            <BookOpen size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
            {t('noLedgerEntries')}
          </div>
        )}
      </div>
    </div>
  );
}
