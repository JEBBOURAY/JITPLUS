import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY,
  TRANSACTION_REPOSITORY,
  type IMerchantRepository,
  type ITransactionRepository,
} from '../repositories';
import { IPushProvider, PUSH_PROVIDER } from '../interfaces';

// ── Localized push messages ──
const MESSAGES = {
  neverScanned: {
    fr: {
      title: '🚀 Lancez votre programme de fidélité !',
      body: 'Scannez votre premier client et commencez à fidéliser. C\'est simple, rapide et vos clients adorent !',
    },
    en: {
      title: '🚀 Launch your loyalty program!',
      body: 'Scan your first client and start building loyalty. It\'s simple, fast, and your clients love it!',
    },
    ar: {
      title: '🚀 لونصي برنامج الولاء ديالك!',
      body: 'سكاني أول كليان ديالك وبدا فيداليزي. ساهل، سريع والكليان كيعجبهم!',
    },
  },
  inactive: {
    fr: {
      title: '📊 Vos clients vous attendent !',
      body: 'Ça fait plus de 5 jours sans scan. Gardez le rythme pour fidéliser vos clients et augmenter vos ventes !',
    },
    en: {
      title: '📊 Your clients are waiting!',
      body: 'It\'s been over 5 days since your last scan. Keep the momentum to retain clients and boost sales!',
    },
    ar: {
      title: '📊 الكليان ديالك كيتسناوك!',
      body: 'فاتو كثر من 5 أيام بلا سكان. كمل الإيقاع باش تفيداليزي الكليان وتزيد المبيعات!',
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
 *    but has **zero** EARN_POINTS transactions (i.e. never scanned a client).
 *    → Encourage them to scan their first client.
 *
 * 2. **Inactive 5+ days** — Merchant has at least one EARN_POINTS transaction
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
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
  ) {}

  @Cron('0 11 * * *') // Every day at 11:00 AM UTC
  async sendEngagementReminders(): Promise<void> {
    this.logger.log('Starting merchant engagement reminders');

    try {
      // Fetch all active merchants who completed onboarding and have a push token
      const merchants = await this.merchantRepo.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          pushToken: { not: null },
          onboardingCompleted: true,
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

      let neverScannedCount = 0;
      let inactiveCount = 0;
      const staleTokenIds: string[] = [];

      for (const merchant of merchants) {
        if (!merchant.pushToken) continue;

        // Find the most recent EARN_POINTS transaction for this merchant
        const lastScan = await this.txRepo.findFirst({
          where: {
            merchantId: merchant.id,
            type: 'EARN_POINTS',
            status: 'ACTIVE',
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        let result: { invalidToken: boolean } = { invalidToken: false };

        if (!lastScan) {
          // ── Segment 1: never scanned any client ──
          const msg = getMsg('neverScanned', merchant.language);
          result = await this.pushProvider.sendToMerchant(
            merchant.pushToken,
            msg.title,
            msg.body,
            { action: 'open_scan' },
          );
          neverScannedCount++;
        } else if (lastScan.createdAt < fiveDaysAgo) {
          // ── Segment 2: inactive for 5+ days ──
          const msg = getMsg('inactive', merchant.language);
          result = await this.pushProvider.sendToMerchant(
            merchant.pushToken,
            msg.title,
            msg.body,
            { action: 'open_scan' },
          );
          inactiveCount++;
        }

        if (result.invalidToken) staleTokenIds.push(merchant.id);
      }

      // Clean stale push tokens
      if (staleTokenIds.length > 0) {
        this.logger.log(`Cleaning ${staleTokenIds.length} stale merchant push token(s)`);
        await this.merchantRepo.updateMany({
          where: { id: { in: staleTokenIds } },
          data: { pushToken: null },
        }).catch((e) => this.logger.warn(`Failed to clean stale tokens: ${e}`));
      }

      this.logger.log(
        `Engagement reminders sent: ${neverScannedCount} never-scanned, ${inactiveCount} inactive 5d+ (${merchants.length} merchants checked)`,
      );
    } catch (error) {
      this.logger.error('Failed to send engagement reminders', error);
    }
  }
}
