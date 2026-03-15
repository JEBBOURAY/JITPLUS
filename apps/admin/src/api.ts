import type {
  AdminInfo,
  MerchantsResponse,
  MerchantDetail,
  GlobalStats,
  AuditLogsResponse,
  UpgradeRequestsResponse,
  NotificationsResponse,
} from './types';

// ── Config ─────────────────────────────────────────────────────────────────────
const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000') + '/api/v1';

// Security: enforce HTTPS in production
if (import.meta.env.PROD && !BASE.startsWith('https://')) {
  throw new Error('[SECURITY] Admin API URL must use HTTPS in production!');
}

// Security: use sessionStorage (clears on tab close) instead of localStorage
let _token: string | null = sessionStorage.getItem('admin_token');

export const getToken = () => _token;
export const setToken = (t: string | null) => {
  _token = t;
  if (t) sessionStorage.setItem('admin_token', t);
  else sessionStorage.removeItem('admin_token');
};

// ── Idle timeout: auto-logout after 15 minutes of inactivity ────────────────
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    setToken(null);
    window.location.href = '/login';
  }, IDLE_TIMEOUT_MS);
}

// Track user activity to reset idle timer
if (typeof window !== 'undefined') {
  for (const evt of ['mousedown', 'keydown', 'scroll', 'touchstart'] as const) {
    window.addEventListener(evt, resetIdleTimer, { passive: true });
  }
  resetIdleTimer();
}

// ── HTTP helpers ────────────────────────────────────────────────────────────────
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // CSRF protection
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Non autorisé');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Admin auth ──────────────────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<AdminInfo> {
  const data = await req<{ access_token: string; admin: AdminInfo }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.access_token);
  return data.admin;
}

// ── Stats ──────────────────────────────────────────────────────────────────────
export const getStats = () => req<GlobalStats>('/admin/stats');

// ── Merchants ──────────────────────────────────────────────────────────────────
export const getMerchants = (page = 1, limit = 20) =>
  req<MerchantsResponse>(`/admin/merchants?page=${page}&limit=${limit}`);

export const getMerchantDetail = (id: string) =>
  req<MerchantDetail>(`/admin/merchants/${id}`);

export const activatePremium = (id: string) =>
  req<{ success: boolean }>(`/admin/merchants/${id}/activate-premium`, { method: 'POST' });

export const revokePremium = (id: string) =>
  req<{ success: boolean }>(`/admin/merchants/${id}/revoke-premium`, { method: 'POST' });

export const banMerchant = (id: string, reason?: string) =>
  req<{ success: boolean }>(`/admin/merchants/${id}/ban`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const unbanMerchant = (id: string) =>
  req<{ success: boolean }>(`/admin/merchants/${id}/unban`, { method: 'POST' });

export const deleteMerchant = (id: string) =>
  req<{ success: boolean }>(`/admin/merchants/${id}`, { method: 'DELETE' });

export const setPlanDates = (id: string, startDate?: string, endDate?: string) =>
  req<{ success: boolean }>(`/admin/merchants/${id}/plan-dates`, {
    method: 'PATCH',
    body: JSON.stringify({ startDate, endDate }),
  });

// ── Audit logs ──────────────────────────────────────────────────────────────────
export const getAuditLogs = (page = 1, limit = 30) =>
  req<AuditLogsResponse>(`/admin/audit-logs?page=${page}&limit=${limit}`);

// ── Upgrade Requests ────────────────────────────────────────────────────────────
export const getUpgradeRequests = (status?: string, page = 1, limit = 20) =>
  req<UpgradeRequestsResponse>(
    `/admin/upgrade-requests?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`,
  );

export const approveUpgradeRequest = (id: string, adminNote?: string) =>
  req<{ success: boolean }>(`/admin/upgrade-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ adminNote }),
  });

export const rejectUpgradeRequest = (id: string, adminNote?: string) =>
  req<{ success: boolean }>(`/admin/upgrade-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ adminNote }),
  });

// ── Notifications ──────────────────────────────────────────────────────────────
export const getNotifications = (page = 1, limit = 20, channel?: string, search?: string) => {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(channel ? { channel } : {}),
    ...(search ? { search } : {}),
  }).toString();
  return req<NotificationsResponse>(`/admin/notifications?${qs}`);
};
