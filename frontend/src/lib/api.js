import { reactive } from 'vue';

export const auth = reactive({
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
});

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || '请求失败');
  return data;
}

export function setSession(session) {
  auth.token = session.token;
  auth.user = session.user;
  localStorage.setItem('token', session.token);
  localStorage.setItem('user', JSON.stringify(session.user));
}

export function logout() {
  auth.token = '';
  auth.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
