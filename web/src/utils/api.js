import { API_BASE_URL } from '../config';

export function getAuthHeaders(role = 'admin') {
  const saved = localStorage.getItem('dk_user');
  let userRole = role;
  if (saved) {
    try { userRole = JSON.parse(saved).role || role; } catch {}
  }
  return {
    'Content-Type': 'application/json',
    'X-User-Role': userRole,
  };
}

export async function apiFetch(path, options = {}) {
  const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  return res;
}
