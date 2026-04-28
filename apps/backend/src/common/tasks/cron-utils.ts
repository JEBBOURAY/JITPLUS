import { Logger } from '@nestjs/common';
import type { ICampaignSentTrackerRepository } from '../repositories';

// ── Cron enable/disable gate ─────────────────────────────────────────────
// Scheduled marketing tasks (push + email) must NOT fire in dev/preview/CI
// environments where they could blast real users. We use a sensible default:
//
//   - In production (NODE_ENV=production): crons run UNLESS explicitly
//     disabled via ENABLE_CRONS=false. This preserves the historical
//     behaviour and avoids silent "no notifications" outages when the env
//     var is forgotten in a deploy config.
//   - In any other environment: crons are OFF by default and must be
//     explicitly enabled with ENABLE_CRONS=true.
//
// If a production deploy explicitly disables crons we ALSO surface a Sentry
// warning — this is almost certainly a misconfiguration worth investigating.
//
// Usage (inside a @Cron method):
//   if (!isCronEnabled(this.logger, 'MyCron.run')) return;
let _warnedProdDisabled = false;
export function isCronEnabled(logger: Logger, name: string): boolean {
  const raw = (process.env.ENABLE_CRONS ?? '').trim().toLowerCase();
  const isProd = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';

  let enabled: boolean;
  if (raw === 'true' || raw === '1' || raw === 'yes') {
    enabled = true;
  } else if (raw === 'false' || raw === '0' || raw === 'no') {
    enabled = false;
  } else {
    // Unset / unknown value: ON in production, OFF elsewhere.
    enabled = isProd;
  }

  if (!enabled) {
    logger.log(`[${name}] skipped — crons disabled (ENABLE_CRONS=${raw || 'unset'}, NODE_ENV=${process.env.NODE_ENV || 'unset'})`);

    // Surface a one-time Sentry warning when crons are explicitly disabled
    // in production — almost always a deploy-config mistake.
    if (isProd && !_warnedProdDisabled) {
      _warnedProdDisabled = true;
      logger.error(`Crons are DISABLED in production (ENABLE_CRONS=${raw}). Automated notifications will NOT be sent.`);
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Sentry = require('@sentry/node');
        Sentry.captureMessage?.('Crons disabled in production', {
          level: 'warning',
          tags: { source: 'cron-utils', env: 'production' },
          extra: { ENABLE_CRONS: raw },
        });
      } catch {
        // Sentry not installed — already logged.
      }
    }
  }
  return enabled;
}

// ── Deterministic period helpers (timezone-safe, reference-based) ────────
// We use a fixed UTC reference Monday (2024-01-01, a Monday) to compute week
// numbers. This guarantees stable, documented parity for bi-weekly crons
// instead of relying on the Unix epoch (which starts on a Thursday).
const REFERENCE_MONDAY_UTC_MS = Date.UTC(2024, 0, 1); // 2024-01-01 00:00 UTC (Monday)
const WEEK_MS = 7 * 86_400_000;

export function weekIndexSinceReference(now: Date = new Date()): number {
  return Math.floor((now.getTime() - REFERENCE_MONDAY_UTC_MS) / WEEK_MS);
}

/** Returns true on "even" weeks since the reference Monday. */
export function isEvenWeek(now: Date = new Date()): boolean {
  return weekIndexSinceReference(now) % 2 === 0;
}

/** Stable ISO-like YYYY-Www id (UTC) for campaign dedup keys. */
export function weekTag(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // ISO week: Thursday anchor
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Stable YYYYMMDD (UTC) for daily dedup keys. */
export function dayTag(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// ── Merchant campaign dedup helpers ──────────────────────────────────────
// Mirror of client-side helpers but keyed on merchantId.

export async function merchantAlreadySent(
  repo: ICampaignSentTrackerRepository,
  merchantId: string,
  campaignId: string,
  channel: 'PUSH' | 'EMAIL' | 'WHATSAPP' = 'EMAIL',
): Promise<boolean> {
  const existing = await repo.findUnique({
    where: { merchantId_campaignId_channel: { merchantId, campaignId, channel } },
    select: { id: true },
  });
  return existing !== null;
}

export async function merchantMarkSent(
  repo: ICampaignSentTrackerRepository,
  merchantId: string,
  campaignId: string,
  channel: 'PUSH' | 'EMAIL' | 'WHATSAPP' = 'EMAIL',
): Promise<void> {
  try {
    await repo.create({ data: { merchantId, campaignId, channel } });
  } catch {
    // Unique constraint race — already marked, safe to ignore.
  }
}

// ── Morocco timezone-aware quiet hours ───────────────────────────────────
// The Moroccan market runs on UTC+1 (Africa/Casablanca, no DST since 2018,
// except the Ramadan switch to UTC+0 handled operationally via ENABLE_CRONS).
//
// We never push marketing notifications outside a respectful window:
// - Before 09:00 local / after 21:00 local (nuit) → skip
// - Friday 11:30 → 14:00 local (prière du Jumu'ah)  → skip
//
// These helpers accept the *current* time (defaulted to now) so they are
// trivial to unit-test.

const MOROCCO_UTC_OFFSET_HOURS = 1; // UTC+1 year-round (Africa/Casablanca)

/** Current hour in Morocco (0-23), based on UTC+1. */
export function moroccoHour(now: Date = new Date()): number {
  return (now.getUTCHours() + MOROCCO_UTC_OFFSET_HOURS + 24) % 24;
}

/** Day of week in Morocco (0 = Sunday … 6 = Saturday). */
export function moroccoDayOfWeek(now: Date = new Date()): number {
  const shifted = new Date(now.getTime() + MOROCCO_UTC_OFFSET_HOURS * 3_600_000);
  return shifted.getUTCDay();
}

/**
 * Returns true if we should NOT send marketing notifications right now.
 * Respects night rest (21:00 → 09:00 Maroc) and Jumu'ah prayer (Fri 11:30-14:00).
 * `crons` are already planned outside these windows, but this helper protects
 * ad-hoc / manually triggered sends too.
 */
export function isQuietHours(now: Date = new Date()): boolean {
  const h = moroccoHour(now);
  if (h < 9 || h >= 21) return true;
  // Friday Jumu'ah: 11:30 → 14:00
  if (moroccoDayOfWeek(now) === 5) {
    const minutes = h * 60 + new Date(now.getTime() + MOROCCO_UTC_OFFSET_HOURS * 3_600_000).getUTCMinutes();
    if (minutes >= 11 * 60 + 30 && minutes < 14 * 60) return true;
  }
  return false;
}

/**
 * Guard a cron method with both ENABLE_CRONS gate *and* quiet-hours check.
 * Returns true only if we're allowed to run and send.
 */
export function isCronAllowed(logger: Logger, name: string, now: Date = new Date()): boolean {
  if (!isCronEnabled(logger, name)) return false;
  if (isQuietHours(now)) {
    logger.log(`[${name}] skipped — quiet hours (Maroc nuit / Jumu'ah)`);
    return false;
  }
  return true;
}
