import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
} from '../repositories';
import { IMailProvider, MAIL_PROVIDER } from '../interfaces';
import {
  buildMerchantWeeklyDigestEmail,
  buildMerchantMilestoneEmail,
  buildMerchantTipNotificationsEmail,
  buildMerchantTipRewardsEmail,
  buildMerchantUpgradeEmail,
} from '../../mail/campaign-templates';

/**
 * Automated email campaigns for JIT+ Pro merchants.
 *
 * Mirrors push notification campaigns but via email.
 *
 * Schedule (all UTC) — offset 30 min after push crons:
 * - Monday 10:30 — Weekly digest + client milestones
 * - Thursday 15:30 — Feature tip (rotating)
 * - Saturday 10:30 — Upgrade nudge (FREE plan only)
 */
@Injectable()
export class MerchantEmailCampaignService {
  private readonly logger = new Logger(MerchantEmailCampaignService.name);
  private static readonly BATCH_SIZE = 100;
  private static readonly MILESTONES = [10, 25, 50, 100, 200, 500, 1000];

  constructor(
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private readonly loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
  ) {}

  // ── Weekly Performance Digest + Milestones (Monday) ─────────────────────
  @Cron('30 10 * * 1') // Monday at 10:30 UTC
  async sendWeeklyDigestEmail(): Promise<void> {
    this.logger.log('Starting merchant weekly digest emails');

    try {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      let digestCount = 0;
      let milestoneCount = 0;
      let cursor: string | undefined;

      while (true) {
        const merchants = await this.merchantRepo.findMany({
          where: {
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
            email: true,
            nom: true,
          },
          take: MerchantEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (merchants.length === 0) break;

        const merchantIds = merchants.map((m: any) => m.id);

        // Weekly scans per merchant
        const weeklyTx = await this.txRepo.findMany({
          where: {
            merchantId: { in: merchantIds },
            type: 'EARN_POINTS',
            status: 'ACTIVE',
            createdAt: { gte: weekAgo },
          },
          select: { merchantId: true },
        });
        const scanCounts = new Map<string, number>();
        for (const tx of weeklyTx) {
          scanCounts.set(tx.merchantId, (scanCounts.get(tx.merchantId) ?? 0) + 1);
        }

        // New clients this week per merchant
        const newCards = await this.loyaltyCardRepo.findMany({
          where: {
            merchantId: { in: merchantIds },
            createdAt: { gte: weekAgo },
            deactivatedAt: null,
          },
          select: { merchantId: true },
        });
        const newClientCounts = new Map<string, number>();
        for (const card of newCards) {
          newClientCounts.set(card.merchantId, (newClientCounts.get(card.merchantId) ?? 0) + 1);
        }

        // Total clients per merchant for milestones
        const totalCards = await this.loyaltyCardRepo.groupBy({
          by: ['merchantId'],
          where: {
            merchantId: { in: merchantIds },
            deactivatedAt: null,
          },
          _count: { clientId: true },
        });
        const totalClients = new Map<string, number>();
        for (const g of totalCards) {
          totalClients.set(g.merchantId, g._count.clientId);
        }

        for (const merchant of merchants) {
          if (!merchant.email) continue;
          const scans = scanCounts.get(merchant.id) ?? 0;
          const newClients = newClientCounts.get(merchant.id) ?? 0;
          const total = totalClients.get(merchant.id) ?? 0;

          // Weekly digest
          try {
            const html = buildMerchantWeeklyDigestEmail(
              merchant.nom,
              scans,
              newClients,
              total,
            );
            await this.mailProvider.sendRaw(
              merchant.email,
              `📈 ${merchant.nom} — Votre semaine : ${scans} scan(s), ${newClients} nouveau(x) client(s)`,
              html,
            );
            digestCount++;
          } catch (e) {
            this.logger.warn(`Digest email failed for ${merchant.email}: ${e}`);
          }

          // Milestone check
          const milestone = MerchantEmailCampaignService.MILESTONES.find(
            (m) => total >= m && total < m + (newClients || 1),
          );
          if (milestone) {
            try {
              const html = buildMerchantMilestoneEmail(merchant.nom, milestone);
              await this.mailProvider.sendRaw(
                merchant.email,
                `🎯 ${merchant.nom} — ${milestone} clients fidèles atteints !`,
                html,
              );
              milestoneCount++;
            } catch (e) {
              this.logger.warn(`Milestone email failed for ${merchant.email}: ${e}`);
            }
          }
        }

        cursor = merchants[merchants.length - 1].id;
        if (merchants.length < MerchantEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(
        `Merchant emails sent: ${digestCount} digests, ${milestoneCount} milestones`,
      );
    } catch (error) {
      this.logger.error('Failed to send merchant weekly digest emails', error);
    }
  }

  // ── Feature Tips (Thursday) ─────────────────────────────────────────────
  @Cron('30 15 * * 4') // Thursday at 15:30 UTC
  async sendFeatureTipEmail(): Promise<void> {
    this.logger.log('Starting merchant feature tip emails');

    try {
      const weekNumber = Math.floor(Date.now() / (7 * 86_400_000));
      const tips = [
        { build: buildMerchantTipNotificationsEmail, subject: '💡 Envoyez des notifications push à vos clients' },
        { build: buildMerchantTipRewardsEmail, subject: '💡 Personnalisez vos récompenses de fidélité' },
      ];
      const tip = tips[weekNumber % tips.length];

      let emailCount = 0;
      let cursor: string | undefined;

      while (true) {
        const merchants = await this.merchantRepo.findMany({
          where: {
            isActive: true,
            deletedAt: null,
          },
          select: { id: true, email: true, nom: true },
          take: MerchantEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (merchants.length === 0) break;

        for (const merchant of merchants) {
          try {
            const html = tip.build(merchant.nom);
            await this.mailProvider.sendRaw(merchant.email, tip.subject, html);
            emailCount++;
          } catch (e) {
            this.logger.warn(`Tip email failed for ${merchant.email}: ${e}`);
          }
        }

        cursor = merchants[merchants.length - 1].id;
        if (merchants.length < MerchantEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(`Feature tip emails sent to ${emailCount} merchants`);
    } catch (error) {
      this.logger.error('Failed to send feature tip emails', error);
    }
  }

  // ── Upgrade Nudge (Saturday — FREE plan only) ──────────────────────────
  @Cron('30 10 * * 6') // Saturday at 10:30 UTC
  async sendUpgradeNudgeEmail(): Promise<void> {
    this.logger.log('Starting merchant upgrade nudge emails');

    try {
      // Only send to FREE plan merchants who signed up at least 7 days ago
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

      // Bi-weekly cadence to avoid spamming
      const weekNumber = Math.floor(Date.now() / (7 * 86_400_000));
      if (weekNumber % 2 !== 0) {
        this.logger.log('Skipping upgrade nudge email this week (bi-weekly cadence)');
        return;
      }

      let emailCount = 0;
      let cursor: string | undefined;

      while (true) {
        const merchants = await this.merchantRepo.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            plan: 'FREE',
            createdAt: { lte: sevenDaysAgo },
          },
          select: { id: true, email: true, nom: true },
          take: MerchantEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (merchants.length === 0) break;

        for (const merchant of merchants) {
          try {
            const html = buildMerchantUpgradeEmail(merchant.nom);
            await this.mailProvider.sendRaw(
              merchant.email,
              `⚡ ${merchant.nom} — Passez au Premium, 30 jours offerts !`,
              html,
            );
            emailCount++;
          } catch (e) {
            this.logger.warn(`Upgrade email failed for ${merchant.email}: ${e}`);
          }
        }

        cursor = merchants[merchants.length - 1].id;
        if (merchants.length < MerchantEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(`Upgrade nudge emails sent to ${emailCount} merchants`);
    } catch (error) {
      this.logger.error('Failed to send upgrade nudge emails', error);
    }
  }
}
