const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const KEY = 'cs_chatroom_mod_token';

export function getModToken() {
  return sessionStorage.getItem(KEY) || '';
}

export function setModToken(t) {
  sessionStorage.setItem(KEY, t);
}

export function clearModToken() {
  sessionStorage.removeItem(KEY);
}

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token ?? getModToken();
  if (t) headers['x-mod-token'] = t;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function verifyToken(token) {
  return req('/api/mod/verify', { method: 'POST', body: { token }, token });
}

export async function fetchReports(status = 'open', { limit = 25, offset = 0 } = {}) {
  return req(
    `/api/mod/reports?status=${encodeURIComponent(status)}&limit=${limit}&offset=${offset}`
  );
}

export async function resolveReport(id, note = '') {
  return req(`/api/mod/reports/${id}/resolve`, { method: 'POST', body: { note } });
}

export async function reopenReport(id) {
  return req(`/api/mod/reports/${id}/reopen`, { method: 'POST' });
}

export async function banDevice(deviceId, reason = '') {
  return req('/api/mod/ban', { method: 'POST', body: { deviceId, reason } });
}

export async function unbanDevice(deviceId) {
  return req('/api/mod/unban', { method: 'POST', body: { deviceId } });
}
