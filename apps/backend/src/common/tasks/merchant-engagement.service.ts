import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY,
  RAW_QUERY_RUNNER,
  type IMerchantRepository,
  type IRawQueryRunner,
} from '../repositories';
import {
  MerchantNotifierService,
  NOTIFY_TARGET_SELECT,
  tally,
  type MerchantNotification,
} from '../../merchant-inbox/merchant-notifier.service';
import { dayTag, reachedStage, mapLimit, MERCHANT_PUSH_CONCURRENCY, cronEnabledOnce } from './cron-utils';
import { NOTIF_MESSAGES, lang } from './merchant-notif-messages';
import { MS_PER_DAY } from '../constants';

// ── Localized push messages ──
const MESSAGES = {
  neverScanned: {
    fr: {
      title: 'Prêt pour votre premier client ?',
      body: 'Scannez le QR code de votre premier client : il gagne son premier tampon en quelques secondes.',
    },
    en: {
      title: 'Ready for your first customer?',
      body: 'Scan your first customer\'s QR code: they earn their first stamp in seconds.',
    },
    ar: {
      title: 'واجد للكليان الأول ديالك؟',
      body: 'سكاني QR ديال أول كليان: كيربح أول طابع ديالو فثواني.',
    },
  },
  inactive: {
    fr: {
      title: 'Aucun scan depuis 5 jours',
      body: 'Pensez à scanner chaque passage : un client qui voit sa carte avancer revient plus souvent.',
    },
    en: {
      title: 'No scans in the last 5 days',
      body: 'Remember to scan every visit: customers who see their card progress come back more often.',
    },
    ar: {
      title: 'حتى سكان هادي 5 أيام',
      body: 'عقل تسكاني كل زيارة: الكليان اللي كيشوف الكارطة ديالو كتقدم كيرجع كثر.',
    },
  },
} as const;

type MsgKey = keyof typeof MESSAGES;

function getMsg(key: MsgKey, language: string | null): { title: string; body: string } {
  return MESSAGES[key][lang(language)];
}

/** Merchant ids per last-scan lookup. */
const LAST_SCAN_CHUNK = 1000;

/** Days without a scan at which a reminder goes out (one per stage per gap). */
export const SCAN_GAP_STAGES = [5, 10, 21] as const;
/** Days after sign-up at which a merchant who never scanned is reminded. */
export const FIRST_SCAN_STAGES = [1, 3, 7] as const;


/**
 * The reminder a merchant should get today, or null. Pure: the cron only
 * fetches data and sends what this returns.
 */
export function planEngagementReminder(
  m: { language: string | null; createdAt: Date },
  lastScanAt: Date | null,
  now: number,
): MerchantNotification | null {
  let campaignId: string;
  let msg: { title: string; body: string };
  let action = 'open_scan';

  if (!lastScanAt) {
    const stage = reachedStage(FIRST_SCAN_STAGES, Math.floor((now - m.createdAt.getTime()) / MS_PER_DAY));
    if (!stage) return null;
    campaignId = `merchant_first_scan_${stage}d`;
    msg = getMsg('neverScanned', m.language);
  } else {
    const stage = reachedStage(SCAN_GAP_STAGES, Math.floor((now - lastScanAt.getTime()) / MS_PER_DAY));
    if (!stage) return null;
    // The last scan day is part of the key: a new scan restarts the series.
    campaignId = `merchant_scan_gap_${stage}d_${dayTag(lastScanAt)}`;
    if (stage === 5) {
      msg = getMsg('inactive', m.language);
    } else {
      msg = NOTIF_MESSAGES[stage === 10 ? 'scanGap10' : 'scanGap21'][lang(m.language)];
      if (stage === 21) action = 'open_support';
    }
  }

  return { category: 'REMINDER', title: msg.title, body: msg.body, action, event: 'merchant_engagement', campaignId };
}

/**
 * Scheduled task: bring merchants back to scanning.
 *
 * 1. **Never scanned** — onboarding done, zero EARN_STAMPS transaction:
 *    reminded 1, 3 and 7 days after sign-up, once per stage.
 * 2. **Scan gap** — last scan 5, 10 or 21 days ago: one reminder per stage,
 *    reset by the next scan (the dedup key contains the last scan day).
 *
 * Category REMINDER: obeys the merchant's "reminders" switch, quiet hours and
 * the marketing frequency cap (see MerchantNotifierService).
 */
@Injectable()
export class MerchantEngagementService {
  private readonly logger = new Logger(MerchantEngagementService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    private readonly notifier: MerchantNotifierService,
  ) {}

  // 08:00 UTC = 09:00 Maroc (début de matinée, hors heures de prière).
  @Cron('0 8 * * *')
  async sendEngagementReminders(): Promise<void> {
    if (!(await cronEnabledOnce(this.logger, 'MerchantEngagement.sendEngagementReminders'))) return;
    this.logger.log('Starting merchant engagement reminders');

    try {
      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
          notifPush: true,
        },
        select: { ...NOTIFY_TARGET_SELECT, language: true, createdAt: true },
      });
      if (merchants.length === 0) return;

      const lastScanMap = await this.lastScans(merchants.map((m: { id: string }) => m.id));

      const now = Date.now();
      const plans = merchants.flatMap((m) => {
        const n = planEngagementReminder(m, lastScanMap.get(m.id) ?? null, now);
        return n ? [{ m, n }] : [];
      });
      const results = await mapLimit(plans, MERCHANT_PUSH_CONCURRENCY, ({ m, n }) => this.notifier.notify(m, n));

      this.logger.log(`Engagement reminders (${merchants.length} eligible): ${tally(results)}`);
    } catch (error) {
      this.logger.error('Failed to send engagement reminders', error);
    }
  }

  /**
   * Last EARN_STAMPS (ACTIVE) per merchant. The LATERAL reads one row per
   * merchant off transactions(merchant_id, type, status, created_at) backwards,
   * instead of aggregating every scan ever made. Merchants that never scanned
   * are absent from the map.
   */
  async lastScans(merchantIds: string[]): Promise<Map<string, Date>> {
    const out = new Map<string, Date>();
    for (let i = 0; i < merchantIds.length; i += LAST_SCAN_CHUNK) {
      const ids = merchantIds.slice(i, i + LAST_SCAN_CHUNK);
      const rows = await this.rawQuery.queryRaw<{ merchant_id: string; last_scan_at: Date }>`
        SELECT m.id AS merchant_id, lt.created_at AS last_scan_at
        FROM unnest(${ids}::text[]) AS m(id)
        CROSS JOIN LATERAL (
          SELECT t.created_at
          FROM transactions t
          WHERE t.merchant_id = m.id
            AND t.type = 'EARN_STAMPS'
            AND t.status = 'ACTIVE'
          ORDER BY t.created_at DESC
          LIMIT 1
        ) lt`;
      for (const r of rows) out.set(r.merchant_id, r.last_scan_at);
    }
    return out;
  }
}
