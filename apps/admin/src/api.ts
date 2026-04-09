import type {
  AdminInfo,
  MerchantsResponse,
  MerchantDetail,
  GlobalStats,
  AuditLogsResponse,
  NotificationsResponse,
  ClientsResponse,
  ClientDetail,
  ReferralStats,
  MerchantReferralsResponse,
  ClientReferralsResponse,
  TopReferrer,
  MerchantSubscriptionHistoryResponse,
  PayoutRequestsResponse,
  PayoutRequestRow,
  PayoutStatus,
} from './types';

// ── Environment config ─────────────────────────────────────────────────────────
export type AdminEnv = 'dev' | 'prod';

const ENV_URLS: Record<AdminEnv, string> = {
  dev: 'http://localhost:3000/api/v1',
  prod: '/api/prod',  // proxied via Vite dev server → Cloud Run (avoids CORS)
};

const STORAGE_KEY = 'admin_env';

function loadEnv(): AdminEnv {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'prod' ? 'prod' : 'dev';
}

let _env: AdminEnv = loadEnv();
let _envListeners: Array<(env: AdminEnv) => void> = [];

export function getEnv(): AdminEnv { return _env; }
export function getBaseUrl(): string { return ENV_URLS[_env]; }

export function setEnv(env: AdminEnv) {
  _env = env;
  localStorage.setItem(STORAGE_KEY, env);
  // Clear auth when switching environments
  setToken(null);
  _envListeners.forEach((fn) => fn(env));
}

export function onEnvChange(fn: (env: AdminEnv) => void): () => void {
  _envListeners.push(fn);
  return () => { _envListeners = _envListeners.filter((l) => l !== fn); };
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
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const base = getBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...opts, headers });
  } catch {
    throw new Error(
      `Impossible de joindre le serveur (${_env.toUpperCase()}).\n` +
      `URL: ${base}${path}\n` +
      (_env === 'dev'
        ? 'Vérifiez que le backend tourne: cd apps/backend && npm run start:dev'
        : 'Vérifiez la connexion réseau et que CORS autorise localhost.'),
    );
  }

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
export const getMerchants = (page = 1, limit = 20, search?: string, plan?: string, status?: string, categorie?: string) => {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(search ? { search } : {}),
    ...(plan ? { plan } : {}),
    ...(status ? { status } : {}),
    ...(categorie ? { categorie } : {}),
  }).toString();
  return req<MerchantsResponse>(`/admin/merchants?${qs}`);
};

export const getMerchantDetail = (id: string) =>
  req<MerchantDetail>(`/admin/merchants/${id}`);

export const getMerchantSubscriptionHistory = (id: string) =>
  req<MerchantSubscriptionHistoryResponse>(`/admin/merchants/${id}/subscription-history`);

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
export const getAuditLogs = (page = 1, limit = 30, action?: string, targetType?: string, from?: string, to?: string) => {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString();
  return req<AuditLogsResponse>(`/admin/audit-logs?${qs}`);
};

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

// ── Clients ────────────────────────────────────────────────────────────────────
export const getClients = (page = 1, limit = 20, search?: string, status?: string) => {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
  }).toString();
  return req<ClientsResponse>(`/admin/clients?${qs}`);
};

export const getClientDetail = (id: string) =>
  req<ClientDetail>(`/admin/clients/${id}`);

export const deactivateClient = (id: string) =>
  req<{ success: boolean }>(`/admin/clients/${id}/deactivate`, { method: 'POST' });

export const activateClient = (id: string) =>
  req<{ success: boolean }>(`/admin/clients/${id}/activate`, { method: 'POST' });

export const deleteClient = (id: string) =>
  req<{ success: boolean }>(`/admin/clients/${id}`, { method: 'DELETE' });

// ── Admin broadcast notifications ──────────────────────────────────────────────
export const sendAdminNotification = (
  channel: 'PUSH' | 'EMAIL' | 'WHATSAPP',
  title: string,
  body: string,
  audience: 'MERCHANT_CLIENTS' | 'ALL_CLIENTS' | 'ALL_MERCHANTS',
  merchantId?: string,
) =>
  req<{ success: boolean; recipientCount?: number; successCount?: number; failureCount?: number }>(
    '/admin/send-notification',
    {
      method: 'POST',
      body: JSON.stringify({ channel, title, body, audience, ...(merchantId && { merchantId }) }),
    },
  );

// ── Referral management ────────────────────────────────────────────────────
export const getReferralStats = () => req<ReferralStats>('/admin/referrals/stats');

export const getMerchantReferrals = (page = 1, limit = 20, search?: string) => {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(search ? { search } : {}),
  }).toString();
  return req<MerchantReferralsResponse>(`/admin/referrals/merchant-to-merchant?${qs}`);
};

export const getClientReferrals = (page = 1, limit = 20, status?: string, search?: string) => {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  }).toString();
  return req<ClientReferralsResponse>(`/admin/referrals/client-to-merchant?${qs}`);
};

export const getTopReferrers = (limit = 20) =>
  req<TopReferrer[]>(`/admin/referrals/top-referrers?limit=${limit}`);

// ── Payout requests ────────────────────────────────────────────────────────
export const getPayoutRequests = (page = 1, limit = 20, status?: PayoutStatus, search?: string) => {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  }).toString();
  return req<PayoutRequestsResponse>(`/admin/referrals/payout-requests?${qs}`);
};

export const updatePayoutRequestStatus = (id: string, status: PayoutStatus) =>
  req<PayoutRequestRow>(`/admin/referrals/payout-requests/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
