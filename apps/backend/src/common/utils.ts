/**
 * Common utility functions used across multiple services.
 */

/** Safely extract an error message string from an unknown caught value. */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Strip undefined values from an object — used for partial-update DTOs.
 * Replaces 6+ copies of `Object.fromEntries(Object.entries(dto).filter(...))`.
 */
export function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Build a Prisma OR filter for client text search (nom, email, telephone).
 * Replaces duplicated search WHERE blocks.
 */
export function buildClientSearchFilter(search: string) {
  return [
    { prenom: { contains: search, mode: 'insensitive' as const } },
    { nom: { contains: search, mode: 'insensitive' as const } },
    { email: { contains: search, mode: 'insensitive' as const } },
    { telephone: { contains: search, mode: 'insensitive' as const } },
  ];
}

/**
 * Build a transaction-stats map keyed by clientId.
 * Replaces 2 identical `new Map(lastTransactions.map(...))` blocks.
 */
export function buildTxMap(
  lastTransactions: Array<{
    clientId: string;
    _max: { createdAt: Date | null };
    _count: number;
  }>,
) {
  return new Map(
    lastTransactions.map((t) => [
      t.clientId,
      { lastVisit: t._max.createdAt, txCount: t._count },
    ]),
  );
}

/**
 * Mask a name to its first letter + "." (e.g. "Ayoub" → "A.").
 * Returns null/undefined as-is.
 */
export function maskName(name: string | null | undefined): string | null {
  if (!name) return name as null;
  return name.charAt(0).toUpperCase() + '.';
}

/**
 * Map a client + loyaltyCard + transaction stats into a standard client response.
 * Replaces 2 identical mapping blocks in merchant-client.service.
 * When shareInfoMerchants is false, prenom/nom are masked (first letter only)
 * and email/telephone are hidden.
 */
export function mapClientResponse(
  client: { id: string; prenom?: string | null; nom: string | null; email: string | null; telephone: string | null; shareInfoMerchants?: boolean; createdAt: Date },
  loyaltyCard: { points: number; createdAt: Date } | undefined | null,
  tx: { lastVisit: Date | null; txCount: number } | undefined,
) {
  const shared = client.shareInfoMerchants !== false;
  return {
    id: client.id,
    prenom: shared ? (client.prenom ?? null) : maskName(client.prenom),
    nom: shared ? client.nom : maskName(client.nom),
    email: shared ? client.email : null,
    telephone: shared ? client.telephone : null,
    points: loyaltyCard?.points ?? 0,
    totalTransactions: tx?.txCount ?? 0,
    lastVisit: tx?.lastVisit ?? loyaltyCard?.createdAt ?? client.createdAt,
    memberSince: loyaltyCard?.createdAt ?? client.createdAt,
  };
}

/** Standard pagination metadata returned by list endpoints. */
export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Build a standard pagination metadata object.
 * Replaces 5+ copies of `{ page, limit, total, totalPages: Math.ceil(total/limit) }`.
 */
export function buildPagination(total: number, page: number, limit: number): PaginationResult {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Build a Prisma date filter for a given period.
 * Replaces duplicated period→dateFilter logic in dashboard/stats.
 */
export function buildDateFilter(period: 'day' | 'week' | 'month' | 'year'): { gte: Date } {
  const now = new Date();
  const start = new Date(now);

  switch (period) {
    case 'day':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week': {
      const day = start.getDay();
      const diff = (day + 6) % 7;
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { gte: start };
}
