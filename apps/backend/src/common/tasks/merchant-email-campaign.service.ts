import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  TRANSACTION_REPOSITORY, type ITransactionRepository,
  CAMPAIGN_SENT_TRACKER_REPOSITORY, type ICampaignSentTrackerRepository,
} from '../repositories';
import { IMailProvider, MAIL_PROVIDER } from '../interfaces';
import {
  buildMerchantWeeklyDigestEmail,
  buildMerchantMilestoneEmail,
  buildMerchantTipNotificationsEmail,
  buildMerchantTipRewardsEmail,
  buildMerchantUpgradeEmail,
  getMerchantEmailStrings,
  pickLang,
} from '../../mail/campaign-templates';
import {
  isCronEnabled,
  weekTag,
  weekIndexSinceReference,
  isEvenWeek,
  merchantAlreadySent,
  merchantMarkSent,
} from './cron-utils';

/**
 * Automated email campaigns for JIT+ Pro merchants.
 *
 * Mirrors push notification campaigns but via email.
 *
 * Schedule (UTC — Maroc = UTC+1) — 30 min après les crons push:
 * - Lundi    09:30 UTC / 10:30 Maroc — Digest hebdomadaire + paliers clients
 * - Jeudi    14:30 UTC / 15:30 Maroc — Astuce fonctionnalité (tournante)
 * - Samedi   09:30 UTC / 10:30 Maroc — Relance upgrade (FREE uniquement)
 *
 * Vendredi volontairement exclu (prière du Jumu'ah ~12h-14h Maroc).
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
    @Inject(CAMPAIGN_SENT_TRACKER_REPOSITORY) private readonly campaignTrackerRepo: ICampaignSentTrackerRepository,
    @Inject(MAIL_PROVIDER) private readonly mailProvider: IMailProvider,
  ) {}

  // ── Weekly Performance Digest + Milestones (Monday) ─────────────────────
  @Cron('30 9 * * 1') // Lundi 09:30 UTC = 10:30 Maroc
  async sendWeeklyDigestEmail(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantEmailCampaign.sendWeeklyDigestEmail')) return;
    this.logger.log('Starting merchant weekly digest emails');

    try {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      const wtag = weekTag();
      let digestCount = 0;
      let milestoneCount = 0;
      let skippedDup = 0;
      let cursor: string | undefined;

      while (true) {
        const merchants = await this.merchantRepo.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            notifEmail: true,
          },
          select: {
            id: true,
            email: true,
            nom: true,
            language: true,
          },
          take: MerchantEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (merchants.length === 0) break;

        const merchantIds = merchants.map((m: any) => m.id);

        // Weekly scans per merchant (aggregated)
        const scansAgg = await this.txRepo.groupBy({
          by: ['merchantId'],
          where: {
            merchantId: { in: merchantIds },
            type: 'EARN_POINTS',
            status: 'ACTIVE',
            createdAt: { gte: weekAgo },
          },
          _count: { _all: true },
        });
        const scanCounts = new Map<string, number>(
          scansAgg.map((r: { merchantId: string; _count: { _all: number } }) => [r.merchantId, r._count._all]),
        );

        // New clients this week per merchant
        const newCardsAgg = await this.loyaltyCardRepo.groupBy({
          by: ['merchantId'],
          where: {
            merchantId: { in: merchantIds },
            createdAt: { gte: weekAgo },
            deactivatedAt: null,
          },
          _count: { _all: true },
        });
        const newClientCounts = new Map<string, number>(
          newCardsAgg.map((r: { merchantId: string; _count: { _all: number } }) => [r.merchantId, r._count._all]),
        );

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
          const lang = pickLang(merchant.language);
          const t = getMerchantEmailStrings(lang);
          const scans = scanCounts.get(merchant.id) ?? 0;
          const newClients = newClientCounts.get(merchant.id) ?? 0;
          const total = totalClients.get(merchant.id) ?? 0;

          // Weekly digest (dedup per ISO week)
          const digestCampaignId = `merchant_weekly_digest_${wtag}`;
          if (await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, digestCampaignId, 'EMAIL')) {
            skippedDup++;
          } else {
            try {
              const html = buildMerchantWeeklyDigestEmail(
                merchant.nom,
                scans,
                newClients,
                total,
                lang,
              );
              await this.mailProvider.sendRaw(
                merchant.email,
                t.digestSubject(merchant.nom, scans, newClients),
                html,
              );
              digestCount++;
              await merchantMarkSent(this.campaignTrackerRepo, merchant.id, digestCampaignId, 'EMAIL');
            } catch (e) {
              this.logger.warn(`Digest email failed for ${merchant.email}: ${e}`);
            }
          }

          // Milestone check: detect thresholds *crossed* this week.
          const previousTotal = total - newClients;
          const crossed = MerchantEmailCampaignService.MILESTONES.filter(
            (m) => previousTotal < m && total >= m,
          );
          const milestone = crossed.length > 0 ? crossed[crossed.length - 1] : null;
          if (milestone) {
            const mCampaignId = `merchant_milestone_${milestone}_${wtag}`;
            if (!(await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, mCampaignId, 'EMAIL'))) {
              try {
                const html = buildMerchantMilestoneEmail(merchant.nom, milestone, lang);
                await this.mailProvider.sendRaw(
                  merchant.email,
                  t.milestoneSubject(merchant.nom, milestone),
                  html,
                );
                milestoneCount++;
                await merchantMarkSent(this.campaignTrackerRepo, merchant.id, mCampaignId, 'EMAIL');
              } catch (e) {
                this.logger.warn(`Milestone email failed for ${merchant.email}: ${e}`);
              }
            }
          }
        }

        cursor = merchants[merchants.length - 1].id;
        if (merchants.length < MerchantEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(
        `Merchant emails: ${digestCount} digests, ${milestoneCount} milestones, ${skippedDup} dup-skipped`,
      );
    } catch (error) {
      this.logger.error('Failed to send merchant weekly digest emails', error);
    }
  }

  // ── Feature Tips (Thursday) ─────────────────────────────────────────────
  @Cron('30 14 * * 4') // Jeudi 14:30 UTC = 15:30 Maroc
  async sendFeatureTipEmail(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantEmailCampaign.sendFeatureTipEmail')) return;
    this.logger.log('Starting merchant feature tip emails');

    try {
      const wIdx = weekIndexSinceReference();
      const wtag = weekTag();
      type TipKey = 'tipNotifications' | 'tipRewards';
      const tipKeys: readonly TipKey[] = ['tipNotifications', 'tipRewards'] as const;
      const tipKey = tipKeys[wIdx % tipKeys.length];

      let emailCount = 0;
      let skippedDup = 0;
      let cursor: string | undefined;

      while (true) {
        const merchants = await this.merchantRepo.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            notifEmail: true,
          },
          select: { id: true, email: true, nom: true, language: true },
          take: MerchantEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (merchants.length === 0) break;

        for (const merchant of merchants) {
          if (!merchant.email) continue;
          const lang = pickLang(merchant.language);
          const t = getMerchantEmailStrings(lang);
          const campaignId = `merchant_tip_${tipKey}_${wtag}`;
          if (await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, campaignId, 'EMAIL')) {
            skippedDup++;
            continue;
          }
          try {
            const html = tipKey === 'tipNotifications'
              ? buildMerchantTipNotificationsEmail(merchant.nom, lang)
              : buildMerchantTipRewardsEmail(merchant.nom, lang);
            const subject = tipKey === 'tipNotifications' ? t.tipNotifSubject : t.tipRewSubject;
            await this.mailProvider.sendRaw(merchant.email, subject, html);
            emailCount++;
            await merchantMarkSent(this.campaignTrackerRepo, merchant.id, campaignId, 'EMAIL');
          } catch (e) {
            this.logger.warn(`Tip email failed for ${merchant.email}: ${e}`);
          }
        }

        cursor = merchants[merchants.length - 1].id;
        if (merchants.length < MerchantEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(`Feature tip emails: ${emailCount} sent, ${skippedDup} dup-skipped`);
    } catch (error) {
      this.logger.error('Failed to send feature tip emails', error);
    }
  }

  // ── Upgrade Nudge (Saturday — FREE plan only) ──────────────────────────
  @Cron('30 9 * * 6') // Samedi 09:30 UTC = 10:30 Maroc
  async sendUpgradeNudgeEmail(): Promise<void> {
    if (!isCronEnabled(this.logger, 'MerchantEmailCampaign.sendUpgradeNudgeEmail')) return;
    this.logger.log('Starting merchant upgrade nudge emails');

    try {
      // Only send to FREE plan merchants who signed up at least 7 days ago.
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

      // Bi-weekly cadence anchored on a fixed Monday reference (deterministic
      // unlike the old epoch-based parity, which flipped at an arbitrary date).
      if (!isEvenWeek()) {
        this.logger.log('Skipping upgrade nudge email this week (bi-weekly cadence)');
        return;
      }

      const wtag = weekTag();
      let emailCount = 0;
      let skippedDup = 0;
      let cursor: string | undefined;

      while (true) {
        const merchants = await this.merchantRepo.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            notifEmail: true,
            plan: 'FREE',
            createdAt: { lte: sevenDaysAgo },
          },
          select: { id: true, email: true, nom: true, language: true },
          take: MerchantEmailCampaignService.BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (merchants.length === 0) break;

        for (const merchant of merchants) {
          if (!merchant.email) continue;
          const lang = pickLang(merchant.language);
          const t = getMerchantEmailStrings(lang);
          const campaignId = `merchant_upgrade_nudge_${wtag}`;
          if (await merchantAlreadySent(this.campaignTrackerRepo, merchant.id, campaignId, 'EMAIL')) {
            skippedDup++;
            continue;
          }
          try {
            const html = buildMerchantUpgradeEmail(merchant.nom, lang);
            await this.mailProvider.sendRaw(
              merchant.email,
              t.upgSubject(merchant.nom),
              html,
            );
            emailCount++;
            await merchantMarkSent(this.campaignTrackerRepo, merchant.id, campaignId, 'EMAIL');
          } catch (e) {
            this.logger.warn(`Upgrade email failed for ${merchant.email}: ${e}`);
          }
        }

        cursor = merchants[merchants.length - 1].id;
        if (merchants.length < MerchantEmailCampaignService.BATCH_SIZE) break;
      }

      this.logger.log(`Upgrade nudge emails: ${emailCount} sent, ${skippedDup} dup-skipped`);
    } catch (error) {
      this.logger.error('Failed to send upgrade nudge emails', error);
    }
  }
}
