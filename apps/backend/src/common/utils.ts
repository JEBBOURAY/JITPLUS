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
 *
 * Email / phone are hidden from the merchant when the client does not share
 * its info: a partial ("contains") match on them would let the merchant
 * rebuild them one character at a time through the result count (security
 * audit 2026-11-05). For those clients only an exact email / phone matches —
 * i.e. the merchant already knows it, typically the client told it at the till.
 */
export function buildClientSearchFilter(search: string) {
  return [
    { prenom: { contains: search, mode: 'insensitive' as const } },
    { nom: { contains: search, mode: 'insensitive' as const } },
    {
      shareInfoMerchants: true,
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { telephone: { contains: search, mode: 'insensitive' as const } },
      ],
    },
    { email: { equals: search.trim(), mode: 'insensitive' as const } },
    { telephone: search.trim() },
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
  loyaltyCard: { stamps: number; createdAt: Date; deactivatedAt?: Date | null } | undefined | null,
  tx: { lastVisit: Date | null; txCount: number } | undefined,
) {
  const shared = client.shareInfoMerchants !== false;
  return {
    id: client.id,
    prenom: shared ? (client.prenom ?? null) : maskName(client.prenom),
    nom: shared ? client.nom : maskName(client.nom),
    email: shared ? client.email : null,
    telephone: shared ? client.telephone : null,
    stamps: loyaltyCard?.stamps ?? 0,
    totalTransactions: tx?.txCount ?? 0,
    lastVisit: tx?.lastVisit ?? loyaltyCard?.createdAt ?? client.createdAt,
    memberSince: loyaltyCard?.createdAt ?? client.createdAt,
    cardDeactivated: !!loyaltyCard?.deactivatedAt,
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

