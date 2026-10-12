import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY,
  TRANSACTION_REPOSITORY,
  CAMPAIGN_SENT_TRACKER_REPOSITORY,
  type IMerchantRepository,
  type ITransactionRepository,
  type ICampaignSentTrackerRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';
import { MerchantInboxService } from '../../merchant-inbox/merchant-inbox.service';
import {
  isCronEnabled,
  dayTag,
  merchantAlreadySent,
  merchantMarkSent,
} from './cron-utils';

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
type Lang = 'fr' | 'en' | 'ar';

function getMsg(key: MsgKey, lang?: string): { title: string; body: string } {
  const l = (lang === 'en' || lang === 'ar' ? lang : 'fr') as Lang;
  return MESSAGES[key][l];
}

/**
 * Scheduled task: encourage merchant engagement via push notifications.
 *
 * Two segments:
 *
 * 1. **Never scanned** — Merchant completed onboarding, has a push token,
 *    but has **zero** EARN_STAMPS transactions (i.e. never scanned a client).
 *    → Encourage them to scan their first client.
 *
 * 2. **Inactive 5+ days** — Merchant has at least one EARN_STAMPS transaction
 *    but the most recent one is older than 5 days.
 *    → Remind them to stay active and keep clients coming back.
 *
 * Runs once daily at 11:00 AM UTC to avoid overlap with the 48h setup reminder
 * (which runs at 10:00 AM UTC).
 *
 * Messages are sent in the merchant's configured language (fr/en/ar).
 */
@Injectable()
export class MerchantEngagementService {
  private readonly logger = new Logger(MerchantEngagementService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly campaignTrackerRepo: ICampaignSentTrackerRepository,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
    private readonly inbox: MerchantInboxService,
  ) {}

  // 08:00 UTC = 09:00 Maroc (début de matinée, hors heures de prière).
  // Évite 11:00 UTC (= midi Maroc = heure de déjeuner + prière Dohr proche).
  @Cron('0 8 * * *')
  async sendEngagementReminders(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantEngagement.sendEngagementReminders')) return;
    this.logger.log('Starting merchant engagement reminders');

    try {
      // Fetch all active merchants who completed onboarding, opted-in to push,
      // and have a push token registered.
      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
          notifPush: true,
        },
        select: {
          id: true,
          pushToken: true,
          language: true,
        },
      });

      if (merchants.length === 0) {
        this.logger.log('No eligible merchants found');
        return;
      }

      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const today = dayTag();

      // ── N+1 fix: single aggregated query for last-scan per merchant ──
      // One groupBy replaces one findFirst per merchant (was N queries).
      const merchantIds = merchants.map((m: { id: string }) => m.id);
      const lastScans = await this.txRepo.groupBy({
        by: ['merchantId'],
        where: {
          merchantId: { in: merchantIds },
          type: 'EARN_STAMPS',
          status: 'ACTIVE',
        },
        _max: { createdAt: true },
      });
      const lastScanMap = new Map<string, Date | null>(
        lastScans.map((r: { merchantId: string; _max: { createdAt: Date | null } }) => [r.merchantId, r._max.createdAt]),
      );

      let neverScannedCount = 0;
      let inactiveCount = 0;
      let skippedDup = 0;
      const staleTokenIds: string[] = [];

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;

        const lastScanAt = lastScanMap.get(merchant.id) ?? null;
        let segment: 'neverScanned' | 'inactive' | null = null;
        if (!lastScanAt) segment = 'neverScanned';
        else if (lastScanAt < fiveDaysAgo) segment = 'inactive';
        if (!segment) continue;

        const campaignId = `merchant_engagement_${segment}_${today}`;
        if (await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, campaignId, 'PUSH')) {
          skippedDup++;
          continue;
        }

        const msg = getMsg(segment, merchant.language);
        const result = await this.pushProvider.sendToMerchant(
          merchant.pushToken,
          msg.title,
          msg.body,
          { action: 'open_scan' },
        );

        if (result.invalidToken) {
          staleTokenIds.push(merchant.id);
          continue;
        }

        await merchantMarkSent(this.campaignTrackerRepo, merchant.id, campaignId, 'PUSH');
        await this.inbox.record(merchant.id, { category: 'ACTIVITY', title: msg.title, body: msg.body, action: 'open_scan' });
        if (segment === 'neverScanned') neverScannedCount++;
        else inactiveCount++;
      }

      // Clean stale push tokens
      if (staleTokenIds.length > 0) {
        this.logger.log(`Cleaning ${staleTokenIds.length} stale merchant push token(s)`);
        await this.merchantRepo.updateMany({
          where: { id: { in: staleTokenIds } },
          data: { pushToken: null },
        }).catch((e: unknown) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(
        `Engagement reminders: ${neverScannedCount} never-scanned, ${inactiveCount} inactive 5d+, ${skippedDup} dup-skipped (${merchants.length} eligible)`,
      );
    } catch (error) {
      this.logger.error('Failed to send engagement reminders', error);
    }
  }
}
