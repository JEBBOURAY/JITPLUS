import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TRANSACTION_RUNNER, type ITransactionRunner, type TransactionClient, type TransactionRunOptions,
  RAW_QUERY_RUNNER, type IRawQueryRunner,
} from '../repositories';
import { cronRunOnce } from './cron-utils';
import { MS_PER_DAY } from '../constants';

/** Accounts purged per batch (ids listed once, children deleted with IN (...)). */
export const PURGE_ACCOUNT_BATCH = 100;
/** Child rows deleted per statement: keeps each statement (and its cascades) short. */
export const PURGE_ROW_CHUNK = 2000;
/** Each chunk runs in its own short transaction: well above Prisma's 5s default. */
const PURGE_TX_OPTIONS: TransactionRunOptions = { maxWait: 10_000, timeout: 60_000 };

/** campaign_sent_trackers rows kept this long (dedup window of the periodic campaigns). */
export const CAMPAIGN_TRACKER_RETENTION_DAYS = 120;
/** Tracker rows scanned per retention statement. */
export const CAMPAIGN_TRACKER_PURGE_BATCH = 5000;

/**
 * Tracker rows that may be dropped after the retention window: their
 * campaignId embeds the period (day / ISO week / plan-expiry / quota reset
 * date / run day), so the same key can never be claimed again once that
 * period is over.
 *
 * Every other campaignId is a lifetime dedup key that must be KEPT, or the
 * push would be sent again once the row is gone:
 * welcome_push_dayN (harmless but kept for simplicity), reengagement_inactiveNd_<lastTx day>,
 * merchant_first_scan_Nd, merchant_scan_gap_*_<lastScan day>, merchant_app_idle_*,
 * merchant_onboarding_*, merchant_email_unverified_*, merchant_tip_*,
 * merchant_referral_reminder_b*, merchant_plan_expired_*, merchant_plan_winback_*,
 * merchant_wheel_ended_*, merchant_deal_ending_*, merchant_news_*, email series…
 * A new campaign is kept by default until it is added here.
 * LIKE patterns: `\_` is a literal underscore.
 */
export const PURGEABLE_CAMPAIGN_PATTERNS: readonly string[] = [
  // Client pushes (src/common/tasks)
  'reengagement\\_never\\_used\\_%', // weekTag
  'reward\\_stamps\\_available\\_%', // day
  'reward\\_stamps\\_almost\\_%', // day
  'weekly\\_digest\\_push\\_%', // week index
  'feature\\_highlight\\_push\\_%', // weekTag
  'friday\\_%', // weekTag
  // Deal alerts (src/deals)
  'deals\\_digest\\_%', // day
  'deals\\_online\\_%', // week
  // Merchant pushes
  'merchant\\_setup\\_reminder\\_%', // weekTag
  'merchant\\_weekly\\_perf\\_%', // weekTag
  'merchant\\_milestone\\_%', // milestone + weekTag
  'merchant\\_upgrade\\_nudge\\_%', // weekTag
  'merchant\\_trial\\_ending\\_%', // plan expiry day (past)
  'merchant\\_premium\\_ending\\_%', // plan expiry day (past)
  'merchant\\_email\\_quota\\_%', // quota reset day
  'merchant\\_wa\\_quota\\_%', // quota reset day
];

type Drainable = {
  findMany(args: object): Promise<Array<{ id: string }>>;
  deleteMany(args: object): Promise<{ count: number }>;
};

/**
 * One child table to empty for a batch of accounts: drained by id chunks
 * (`model` + `where`), or one plain delete for tables without an `id` column.
 */
type ChildStep =
  | { model: (tx: TransactionClient) => unknown; where: object }
  | { once: (tx: TransactionClient) => Promise<unknown> };

/**
 * Scheduled task: permanently purge soft-deleted accounts (clients + merchants)
 * after 30 days.
 *
 * Apple App Store (guideline 5.1.1) and Moroccan Law 09-08 require permanent
 * data deletion on user request. The CGU promises deletion within 30 days.
 *
 * Accounts are processed 100 at a time: each child table is emptied with
 * `IN (...)` deletes of at most 2000 rows (each in its own short transaction,
 * so a large merchant can no longer hit the 5s interactive-transaction
 * timeout and roll back forever), then the parents go in one statement.
 * Children are deleted in FK order; a batch that fails is retried next night
 * (deletes are idempotent).
 *
 * Runs daily at 03:00 UTC to minimise database load.
 */
@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger(AccountPurgeService.name);

  constructor(
    @Inject(CLIENT_REPOSITORY) private readonly clientRepo: IClientRepository,
    @Inject(MERCHANT_REPOSITORY) private readonly merchantRepo: IMerchantRepository,
    @Inject(TRANSACTION_RUNNER) private readonly txRunner: ITransactionRunner,
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeDeletedAccounts(): Promise<void> {
    if (!(await cronRunOnce('AccountPurge.purgeDeletedAccounts'))) return;
    const cutoff = new Date(Date.now() - 30 * MS_PER_DAY);

    await this.purgeClients(cutoff);
    await this.purgeMerchants(cutoff);
  }

  /**
   * Retention: drops campaign_sent_trackers rows older than 120 days whose
   * campaignId is period-scoped (PURGEABLE_CAMPAIGN_PATTERNS). Walks the
   * sent_at index once with a (sent_at, id) keyset, one statement per batch.
   * Notifications are not purged (product decision pending).
   */
  @Cron('30 3 * * *') // 03:30 UTC, after the account purge
  async purgeCampaignTrackers(now: Date = new Date()): Promise<number> {
    if (!(await cronRunOnce('AccountPurge.purgeCampaignTrackers'))) return 0;
    const cutoff = new Date(now.getTime() - CAMPAIGN_TRACKER_RETENTION_DAYS * MS_PER_DAY);
    const patterns = [...PURGEABLE_CAMPAIGN_PATTERNS];
    let lastSentAt = new Date(0);
    let lastId = '';
    let deleted = 0;
    try {
      for (;;) {
        const rows = await this.rawQuery.queryRaw<{ last_sent_at: Date; last_id: string; deleted: number; scanned: number }>`
          WITH scanned AS (
            SELECT id, sent_at, campaign_id
            FROM campaign_sent_trackers
            WHERE sent_at < ${cutoff.toISOString()}::timestamp(3)
              -- redundant bound so the sent_at index range starts at the keyset
              AND sent_at >= ${lastSentAt.toISOString()}::timestamp(3)
              AND (sent_at, id) > (${lastSentAt.toISOString()}::timestamp(3), ${lastId}::text)
            ORDER BY sent_at, id
            LIMIT ${CAMPAIGN_TRACKER_PURGE_BATCH}
          ), del AS (
            DELETE FROM campaign_sent_trackers c
            USING scanned s
            WHERE c.id = s.id AND s.campaign_id LIKE ANY(${patterns}::text[])
            RETURNING c.id
          )
          SELECT s.sent_at AS last_sent_at, s.id AS last_id,
                 (SELECT COUNT(*) FROM del)::int AS deleted,
                 (SELECT COUNT(*) FROM scanned)::int AS scanned
          FROM scanned s
          ORDER BY s.sent_at DESC, s.id DESC
          LIMIT 1`;
        const r = rows[0];
        if (!r) break;
        deleted += Number(r.deleted);
        lastSentAt = r.last_sent_at;
        lastId = r.last_id;
        if (Number(r.scanned) < CAMPAIGN_TRACKER_PURGE_BATCH) break;
      }
    } catch (error) {
      this.logger.error('Campaign tracker retention purge failed', error);
    }
    if (deleted > 0) {
      this.logger.log(`Purged ${deleted} campaign tracker row(s) sent before ${cutoff.toISOString()}`);
    }
    return deleted;
  }

  private async purgeClients(cutoff: Date): Promise<void> {
    try {
      const purged = await this.purgeInBatches(
        'client',
        (last) => this.clientRepo.findMany({
          where: { deletedAt: { lte: cutoff }, ...(last ? { id: { gt: last } } : {}) },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: PURGE_ACCOUNT_BATCH,
        }),
        (ids) => [
          // Lucky-wheel tickets (onDelete: Cascade, but explicit for safety; reference transactions)
          { model: (tx) => tx.luckyWheelTicket, where: { clientId: { in: ids } } },
          // Transactions (onDelete: Restrict — must delete explicitly)
          { model: (tx) => tx.transaction, where: { clientId: { in: ids } } },
          // Loyalty cards (onDelete: Restrict — must delete explicitly)
          { model: (tx) => tx.loyaltyCard, where: { clientId: { in: ids } } },
          // Remaining cascade-able records
          { model: (tx) => tx.clientNotificationStatus, where: { clientId: { in: ids } } },
          { model: (tx) => tx.profileView, where: { clientId: { in: ids } } },
          { model: (tx) => tx.clientReferral, where: { clientId: { in: ids } } },
          { model: (tx) => tx.payoutRequest, where: { clientId: { in: ids } } },
        ],
        (tx, where) => tx.client.deleteMany({ where: { ...where, deletedAt: { lte: cutoff } } }),
      );
      if (purged > 0) this.logger.log(`Purged ${purged} client account(s) deleted before ${cutoff.toISOString()}`);
    } catch (error) {
      this.logger.error('Client purge job failed', error);
    }
  }

  private async purgeMerchants(cutoff: Date): Promise<void> {
    try {
      const purged = await this.purgeInBatches(
        'merchant',
        (last) => this.merchantRepo.findMany({
          where: { deletedAt: { lte: cutoff }, ...(last ? { id: { gt: last } } : {}) },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: PURGE_ACCOUNT_BATCH,
        }),
        (ids) => [
          // LuckyWheel-related data
          { model: (tx) => tx.luckyWheelTicket, where: { campaign: { merchantId: { in: ids } } } },
          { model: (tx) => tx.luckyWheelPrize, where: { campaign: { merchantId: { in: ids } } } },
          { model: (tx) => tx.luckyWheelCampaign, where: { merchantId: { in: ids } } },
          // Transactions (onDelete: Restrict)
          { model: (tx) => tx.transaction, where: { merchantId: { in: ids } } },
          // Loyalty cards (onDelete: Restrict)
          { model: (tx) => tx.loyaltyCard, where: { merchantId: { in: ids } } },
          { model: (tx) => tx.reward, where: { merchantId: { in: ids } } },
          { model: (tx) => tx.store, where: { merchantId: { in: ids } } },
          { model: (tx) => tx.teamMember, where: { merchantId: { in: ids } } },
          { model: (tx) => tx.deviceSession, where: { merchantId: { in: ids } } },
          // Notifications. merchant_notification_reads has a composite key (no id): one IN delete.
          { once: (tx) => tx.merchantNotificationRead.deleteMany({ where: { merchantId: { in: ids } } }) },
          // Per-client statuses cascade from the notification: emptied first, in
          // chunks, so one broadcast (one status row per recipient) cannot turn a
          // notification chunk into a huge cascade.
          { model: (tx) => tx.clientNotificationStatus, where: { notification: { merchantId: { in: ids } } } },
          { model: (tx) => tx.merchantInboxNotification, where: { merchantId: { in: ids } } },
          { model: (tx) => tx.notification, where: { merchantId: { in: ids } } },
          // Profile views
          { model: (tx) => tx.profileView, where: { merchantId: { in: ids } } },
          // Referrals
          { model: (tx) => tx.clientReferral, where: { merchantId: { in: ids } } },
        ],
        (tx, where) => tx.merchant.deleteMany({ where: { ...where, deletedAt: { lte: cutoff } } }),
      );
      if (purged > 0) this.logger.log(`Purged ${purged} merchant account(s) deleted before ${cutoff.toISOString()}`);
    } catch (error) {
      this.logger.error('Merchant purge job failed', error);
    }
  }

  /**
   * Pages the soft-deleted accounts by id and purges each page: children in
   * the given order, then the parents in one statement. When that statement
   * fails (e.g. a row in a table not listed here still references one account)
   * the parents are retried one by one so one bad account doesn't block the
   * other 99. Returns the number of accounts deleted.
   */
  private async purgeInBatches(
    kind: string,
    page: (last: string | undefined) => Promise<Array<{ id: string }>>,
    children: (ids: string[]) => ChildStep[],
    deleteParents: (tx: TransactionClient, where: { id: { in: string[] } }) => Promise<{ count: number }>,
  ): Promise<number> {
    let purged = 0;
    let last: string | undefined;
    for (;;) {
      const batch = await page(last);
      if (batch.length === 0) break;
      last = batch[batch.length - 1].id;
      const ids = batch.map((a) => a.id);

      try {
        for (const step of children(ids)) {
          if ('once' in step) await this.txRunner.run(step.once, PURGE_TX_OPTIONS);
          else await this.drain(step.model, step.where);
        }
      } catch (error) {
        this.logger.error(`Failed to purge children of ${ids.length} ${kind}(s) (${ids[0]}…${last})`, error);
        if (batch.length < PURGE_ACCOUNT_BATCH) break;
        continue;
      }

      try {
        const r = await this.txRunner.run((tx) => deleteParents(tx, { id: { in: ids } }), PURGE_TX_OPTIONS);
        purged += r.count;
      } catch {
        for (const id of ids) {
          try {
            const r = await this.txRunner.run((tx) => deleteParents(tx, { id: { in: [id] } }), PURGE_TX_OPTIONS);
            purged += r.count;
          } catch (error) {
            this.logger.error(`Failed to purge ${kind} ${id}`, error);
          }
        }
      }

      if (batch.length < PURGE_ACCOUNT_BATCH) break;
    }
    return purged;
  }

  /** Deletes every row matching `where`, PURGE_ROW_CHUNK rows per short transaction. */
  private async drain(delegate: (tx: TransactionClient) => unknown, where: object): Promise<number> {
    let total = 0;
    for (;;) {
      const n = await this.txRunner.run(async (tx) => {
        const model = delegate(tx) as Drainable;
        const rows = await model.findMany({ where, select: { id: true }, take: PURGE_ROW_CHUNK });
        if (rows.length === 0) return 0;
        await model.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
        return rows.length;
      }, PURGE_TX_OPTIONS);
      total += n;
      if (n < PURGE_ROW_CHUNK) return total;
    }
  }
}
