import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, ShieldCheck, LogOut, Clock, Smartphone, MapPin, Building, FileText, Upload, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { API_BASE_URL } from '../../config';

export default function Profile() {
  const { user, logout } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    // Fetch member data if it's a member
    if (user.role === 'member') {
      apiFetch(`/api/loans/by-customer?name=${encodeURIComponent(user.name)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0) setProfileData(data[0]);
        })
        .finally(() => setLoading(false));
    } else {
      // Mock admin data
      setProfileData({
        customer_name: user.name,
        customer_email: 'admin@digitalkhata.com',
        customer_phone: '+91 99999 88888',
        customer_address: '123 Finance Tower, Bangalore, KA',
      });
      setLoading(false);
    }

    setAuditLogs([
      { id: 1, action: 'LOGIN', detail: `Logged in from LAN device`, time: new Date().toISOString() },
      { id: 2, action: 'SYSTEM', detail: 'App updated to v2.5', time: new Date(Date.now() - 86400000).toISOString() },
    ]);
  }, [user]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !profileData?.id) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const saved = localStorage.getItem('dk_user');
      const role = (() => { try { return JSON.parse(saved)?.role; } catch { return null; } })() || 'admin';
      const res = await fetch(`${API_BASE_URL}/api/loans/upload-proof?loan_id=${profileData.id}`, {
        method: 'POST',
        body: formData,
        headers: { 'X-User-Role': role },
      });
      if (res.ok) alert('Proof document uploaded successfully!');
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="screen-container pt-8 text-center text-muted">Loading profile...</div>;

  return (
    <div className="screen-container pt-4 pb-12">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>My Profile</h2>
      </div>

      {/* Header Card */}
      <div className="card" style={{ padding: '24px', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '80px', background: 'linear-gradient(135deg, var(--brand), #4f46e5)', opacity: 0.15 }}></div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid var(--surface)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <User size={40} className="text-brand" />
          </div>
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 900 }}>{profileData.customer_name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', background: user.role === 'admin' ? 'var(--brand-soft)' : 'var(--green-soft)', color: user.role === 'admin' ? 'var(--brand-light)' : 'var(--green)', padding: '2px 8px', borderRadius: '6px' }}>
                {user.role}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} className="text-positive" /> Verified
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        {/* Contact Info */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Contact Information</h3>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Mail size={20} className="text-muted" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>Email Address</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>{profileData.customer_email || '—'}</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Smartphone size={20} className="text-muted" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>Phone Number</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>{profileData.customer_phone || '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin size={20} className="text-muted" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>Home Address</div>
                <div style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.4 }}>{profileData.customer_address || '—'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Documents & Bank */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>Finance & Proofs</h3>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Building size={20} className="text-muted" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>Linked Bank Account</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>SBI ···· 4291</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={20} className="text-muted" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>Mandatory Proof Copy (KYC)</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Not yet uploaded</div>
              </div>
              <label style={{ background: 'var(--brand)', color: 'white', padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Upload size={14} /> {uploading ? '...' : 'Upload'}
                <input type="file" hidden onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', marginTop: '32px', marginBottom: '12px', letterSpacing: '0.5px' }}>Login History</h3>
      <div className="card">
        {auditLogs.map((log, i) => (
          <div key={log.id} style={{ display: 'flex', gap: '12px', marginBottom: i === auditLogs.length - 1 ? 0 : '16px', borderBottom: i === auditLogs.length - 1 ? 'none' : '1px solid var(--border)', paddingBottom: i === auditLogs.length - 1 ? 0 : '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock size={18} className="text-muted" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{log.detail}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '4px' }}>
                {new Date(log.time).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={logout} style={{ width: '100%', marginTop: '40px', padding: '16px', borderRadius: '18px', background: 'var(--red-soft)', border: '2px solid rgba(239, 68, 68, 0.1)', color: 'var(--red)', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer' }}>
        <LogOut size={20} /> Sign Out Safely
      </button>
    </div>
  );
}
