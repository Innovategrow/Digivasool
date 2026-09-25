import { API_BASE_URL } from '../config';
import { demoFetch } from './demoApi';

function savedUser() {
  try { return JSON.parse(localStorage.getItem('dk_user') || 'null'); } catch { return null; }
}

export function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = savedUser()?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function isDemoMode() {
  return savedUser()?.demo === true;
}

// A fresh key per user action; resend the SAME key when retrying that action so the
// server can recognise duplicates (slow network, double taps).
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Read the error message out of an API response without throwing on non-JSON bodies.
export async function readError(res, fallback = 'Something went wrong. Please try again.') {
  try {
    const data = await res.json();
    return typeof data?.detail === 'string' ? data.detail : fallback;
  } catch {
    return fallback;
  }
}

export async function apiFetch(path, options = {}) {
  if (isDemoMode()) {
    return demoFetch(path, options);
  }
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  if (isFormData) delete headers['Content-Type']; // let the browser set the multipart boundary
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    // Session missing or expired — send the user back to the login screen.
    localStorage.removeItem('dk_user');
    if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
  }
  return res;
}
