import { API_BASE_URL } from '../config';

function savedUser() {
  try { return JSON.parse(localStorage.getItem('dk_user') || 'null'); } catch { return null; }
}

const DEFAULT_BOOKS = [{ id: 'finance', name: 'Finance' }, { id: 'fund', name: 'Fund' }];

// Books (Finance, Fund, and any the admin creates) are cached locally and refreshed from /api/books.
export function getBooks() {
  try {
    const saved = JSON.parse(localStorage.getItem('dk_books') || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* ignore */ }
  return DEFAULT_BOOKS;
}

export function saveBooks(books) {
  try { localStorage.setItem('dk_books', JSON.stringify(books)); } catch { /* ignore */ }
}

export function getBusiness() {
  try {
    const saved = localStorage.getItem('dk_business');
    return saved && /^[a-z0-9]{1,30}$/.test(saved) ? saved : 'finance';
  } catch { return 'finance'; }
}

// Switching business reloads the app so every screen refetches that business's data.
export function setBusiness(id) {
  if (id === getBusiness()) return;
  try { localStorage.setItem('dk_business', id); } catch { /* ignore */ }
  window.location.reload();
}

export function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json', 'X-Business': getBusiness() };
  const token = savedUser()?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
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
