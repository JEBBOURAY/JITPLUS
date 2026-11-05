import { Injectable, Logger, Inject, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  CLIENT_REPOSITORY, type IClientRepository,
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY, type IClientNotificationStatusRepository,
} from '../common/repositories';
import { IEmailBlastProvider, EMAIL_BLAST_PROVIDER, IPushProvider, PUSH_PROVIDER, ISmsProvider, SMS_PROVIDER } from '../common/interfaces';
import { EventsGateway } from '../events';
import { EmailQuotaService } from './email-quota.service';
import { Notification, Prisma } from '@prisma/client';
import { SendNotificationDto } from './dto/send-notification.dto';
import { SendEmailBlastDto } from './dto/send-email-blast.dto';
import { buildWhatsAppBroadcastMessage } from './templates/whatsapp-templates';
import { buildPagination, PaginationResult } from '../common/utils';
import { DEFAULT_NOTIFICATION_LOGO, LOGO_CACHE_TTL, EMAIL_LOGO_JITPLUS_PRO, MS_PER_DAY } from '../common/constants';
import { detectProhibitedContent } from './content-filter';
import type { SendAdminNotificationDto } from '../admin/dto/admin-notification.dto';
import { maskPhone } from '../common/utils/pii-mask';
import { mapLimit } from '../common/tasks/cron-utils';
import { randomUUID } from 'crypto';

/** Concurrent single-client pushes in a {@link NotificationsService.sendToClients} batch. */
const CLIENT_PUSH_CONCURRENCY = 8;

/** Client fields the merchant blasts (push / email / WhatsApp) need to pick their recipients. */
const MEMBER_SELECT = {
  id: true,
  pushToken: true,
  notifPush: true,
  email: true,
  notifEmail: true,
  prenom: true,
  language: true,
  telephone: true,
  notifWhatsapp: true,
} satisfies Prisma.ClientSelect;
type MerchantMember = Prisma.ClientGetPayload<{ select: typeof MEMBER_SELECT }>;

/** Rows per IN (...) list when clearing stale push tokens. */
const STALE_TOKEN_CHUNK = 500;

/** Marketing pushes to all clients a merchant may send per rolling 24 h. */
export const MERCHANT_PUSH_BROADCASTS_PER_DAY = 3;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(NOTIFICATION_REPOSITORY) private notificationRepo: INotificationRepository,
    @Inject(CLIENT_NOTIFICATION_STATUS_REPOSITORY) private clientNotifStatusRepo: IClientNotificationStatusRepository,
    @Inject(PUSH_PROVIDER) private pushProvider: IPushProvider,
    @Inject(EMAIL_BLAST_PROVIDER) private resendService: IEmailBlastProvider,
    @Inject(SMS_PROVIDER) private smsProvider: ISmsProvider,
    private emailQuotaService: EmailQuotaService,
    private eventsGateway: EventsGateway,
    private config: ConfigService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  /** Build a full public URL for an image path (e.g. /uploads/logos/abc.png or https://storage...) */
  private buildImageUrl(path?: string | null): string | undefined {
    const img = path || DEFAULT_NOTIFICATION_LOGO;
    if (img.startsWith('http')) return img; // Return as is if already a full URL (GCS)

    const baseUrl = this.config.get<string>('BACKEND_URL');
    if (!baseUrl) return undefined;
    return `${baseUrl}${img}`;
  }

  private static readonly CLIENT_BATCH_SIZE = 1000;

  /**
   * Pages (by CLIENT_BATCH_SIZE, ordered by client id) over the clients holding
   * an ACTIVE card (deactivatedAt null) of the merchant — the same member set
   * the former `clients WHERE loyaltyCards.some({ merchantId, deactivatedAt: null })`
   * query returned, in the same order. Driven from loyalty_cards through the
   * (merchantId, deactivatedAt, clientId) index, then a PK lookup for the
   * client fields, instead of a semi-join over the global clients table.
   * (clientId, merchantId) is unique, so each client appears once.
   */
  private async *merchantMemberPages(merchantId: string): AsyncGenerator<MerchantMember[]> {
    let lastClientId: string | undefined;
    while (true) {
      const cards = await this.loyaltyCardRepo.findMany({
        where: {
          merchantId,
          deactivatedAt: null,
          ...(lastClientId ? { clientId: { gt: lastClientId } } : {}),
        },
        select: { clientId: true, client: { select: MEMBER_SELECT } },
        orderBy: { clientId: 'asc' },
        take: NotificationsService.CLIENT_BATCH_SIZE,
      });
      if (cards.length === 0) return;
      yield cards.map((c) => c.client);
      lastClientId = cards[cards.length - 1].clientId;
      if (cards.length < NotificationsService.CLIENT_BATCH_SIZE) return;
    }
  }

  /** Clears stale push tokens with bounded IN lists. Errors are logged, never thrown. */
  private async clearStaleClientTokens(invalidTokens: string[]): Promise<void> {
    for (let i = 0; i < invalidTokens.length; i += STALE_TOKEN_CHUNK) {
      try {
        await this.clientRepo.updateMany({
          where: { pushToken: { in: invalidTokens.slice(i, i + STALE_TOKEN_CHUNK) } },
          data: { pushToken: null },
        });
      } catch (error) {
        this.logger.warn(`Failed to clean stale client tokens: ${error}`);
      }
    }
  }

  async sendToAll(merchantId: string, dto: SendNotificationDto): Promise<{
    id: string;
    title: string;
    body: string;
    recipientCount: number;
    successCount: number;
    failureCount: number;
    createdAt: Date;
  }> {

    // Server-side content moderation (anti-phishing / anti-spam)
    const violation = detectProhibitedContent(dto.title, dto.body);
    if (violation) throw new BadRequestException(violation.message);

    // Persistent per-merchant quota: the route throttle is per IP and per
    // instance, so it did not bound how often one merchant can push to all
    // its clients (security audit 2026-11-05). Uses the
    // notifications(merchant_id, is_broadcast, created_at) index.
    const sentLastDay = await this.notificationRepo.count({
      where: { merchantId, isBroadcast: true, channel: 'PUSH', createdAt: { gte: new Date(Date.now() - MS_PER_DAY) } },
    });
    if (sentLastDay >= MERCHANT_PUSH_BROADCASTS_PER_DAY) {
      throw new HttpException(
        {
          code: 'PUSH_DAILY_LIMIT',
          message: `Limite atteinte : ${MERCHANT_PUSH_BROADCASTS_PER_DAY} notifications à tous vos clients par 24 h. Réessayez plus tard.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Collect ALL clients with a loyalty card + push info.
    // Single paginated query fetches both client IDs and push tokens,
    // avoiding a duplicate second pass over the same data.
    const mDetails = await this.getMerchantPushDetails(merchantId);
    const logoUrl = mDetails?.logoUrl ?? null;
    const imageUrl = this.buildImageUrl(logoUrl);

    const allClientIds: string[] = [];
    const pushRecipients: { id: string; pushToken: string }[] = [];

    for await (const members of this.merchantMemberPages(merchantId)) {
      for (const c of members) {
        allClientIds.push(c.id);
        if (c.pushToken && c.notifPush) {
          pushRecipients.push({ id: c.id, pushToken: c.pushToken });
        }
      }
    }

    const tokens = [...new Set(pushRecipients.map((r) => r.pushToken))];
    // Include data payload so client-side handleFcmDataPayload triggers cache invalidation
    // and the deep-link router sends the user to the merchant card on tap.
    const fcmData: Record<string, string> = {
      event: 'notification_new',
      action: 'open_card',
      merchantId,
    };

    if (imageUrl) fcmData.merchantLogo = imageUrl;
    if (mDetails?.email) fcmData.merchantEmail = mDetails.email;
    if (mDetails?.adresse) fcmData.merchantAddress = mDetails.adresse;
    
    // Extract website explicitly as requested, while keeping the whole socials object
    if (mDetails?.socialLinks) {
      if (typeof mDetails.socialLinks === 'object' && !Array.isArray(mDetails.socialLinks) && mDetails.socialLinks !== null) {
         if ((mDetails.socialLinks as any).website) {
            fcmData.merchantWebsite = (mDetails.socialLinks as any).website as string;
         }
      }
      fcmData.merchantSocials = JSON.stringify(mDetails.socialLinks);
    }

    this.logger.log(`Sending "${dto.title}" to ${tokens.length} device(s), ${allClientIds.length} total client(s) for merchant ${merchantId}`);

    let fcmSuccessCount = 0;
    let fcmFailureCount = 0;
    let invalidTokens: string[] = [];
    try {
      const result = await this.pushProvider.sendMulticast(tokens, dto.title, dto.body, imageUrl, fcmData);
      fcmSuccessCount = result.successCount;
      fcmFailureCount = result.failureCount;
      invalidTokens = result.invalidTokens;
    } catch (error) {
      this.logger.error(`Push multicast failed for merchant ${merchantId}: ${error}`);
      fcmFailureCount = tokens.length;
    }

    // All clients are notified via DB record + WebSocket; FCM push is an additional wake-up signal.
    // successCount = all clients notified (not just FCM), failureCount = FCM-only failures (for monitoring).
    const uniqueClientIds = [...new Set(allClientIds)];
    const notification = await this.notificationRepo.create({
      data: { merchantId, title: dto.title, body: dto.body, recipientCount: uniqueClientIds.length, successCount: uniqueClientIds.length, failureCount: fcmFailureCount, isBroadcast: true, channel: 'PUSH' },
    });

    this.logger.log(`Push notification stored: ${uniqueClientIds.length} clients notified, FCM: ${fcmSuccessCount} OK / ${fcmFailureCount} failed`);

    // Create per-client notification status records for ALL clients (not just push).
    // Chunked by 500 to avoid DB timeouts and lock contention on large merchants.
    if (uniqueClientIds.length > 0) {
      const CHUNK_SIZE = 500;
      try {
        for (let i = 0; i < uniqueClientIds.length; i += CHUNK_SIZE) {
          await this.clientNotifStatusRepo.createMany({
            data: uniqueClientIds.slice(i, i + CHUNK_SIZE).map((clientId) => ({
              clientId,
              notificationId: notification.id,
            })),
            skipDuplicates: true,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to create client notification statuses: ${error}`);
      }
    }

    // Emit WebSocket events using batch room targeting (single emit per batch)
    // instead of N individual emits — reduces CPU overhead by ~100x for large broadcasts
    const WS_BATCH = 250;
    try {
      for (let i = 0; i < uniqueClientIds.length; i += WS_BATCH) {
        const batch = uniqueClientIds.slice(i, i + WS_BATCH);
        const rooms = batch.map((id) => `client:${id}`);
        this.eventsGateway.server
          .to(rooms)
          .emit('notification:new', {
            notificationId: notification.id,
            merchantId,
            title: dto.title,
            body: dto.body,
          });
        // Yield to the event loop between batches to avoid blocking
        if (i + WS_BATCH < uniqueClientIds.length) {
          await new Promise((r) => setImmediate(r));
        }
      }
    } catch (error) {
      this.logger.warn(`WebSocket emit failed: ${error}`);
    }

    // Clean up stale/invalid FCM tokens
    if (invalidTokens.length > 0) {
      this.logger.log(`Cleaning ${invalidTokens.length} invalid push token(s)`);
      await this.clearStaleClientTokens(invalidTokens);
    }

    return { id: notification.id, title: notification.title, body: notification.body, recipientCount: uniqueClientIds.length, successCount: uniqueClientIds.length, failureCount: fcmFailureCount, createdAt: notification.createdAt };
  }

  /**
   * Resolve merchant details (logo, email, address, socials) with a 5-minute in-process cache.
   * Called on every transactional notification — avoids redundant DB hits.
   */
  private async getMerchantPushDetails(merchantId: string) {
    const key = `merchant:push_details:${merchantId}`;
    const cached = await this.cache.get<any>(key);
    if (cached !== undefined) return cached;
    const m = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { logoUrl: true, email: true, adresse: true, socialLinks: true },
    });
    await this.cache.set(key, m ?? null, LOGO_CACHE_TTL);
    return m ?? null;
  }

  /**
   * Send a push notification to a SINGLE client (transactional: earn, redeem, reward available).
   * Creates an in-app Notification + ClientNotificationStatus so it shows in the client's feed.
   */
  async sendToClient(
    merchantId: string,
    clientId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    try {
      // 1. Lookup client push preferences + merchant details (cached 5 min)
      const [client, mDetails] = await Promise.all([
        this.clientRepo.findUnique({
          where: { id: clientId },
          select: { pushToken: true, notifPush: true },
        }),
        this.getMerchantPushDetails(merchantId),
      ]);

      const imageUrl = this.buildImageUrl(mDetails?.logoUrl ?? null);

      const fcmData = data || {};
      if (imageUrl && !fcmData.merchantLogo) fcmData.merchantLogo = imageUrl;
      if (mDetails?.email && !fcmData.merchantEmail) fcmData.merchantEmail = mDetails.email;
      if (mDetails?.adresse && !fcmData.merchantAddress) fcmData.merchantAddress = mDetails.adresse;
      
      if (mDetails?.socialLinks && !fcmData.merchantSocials) {
        if (typeof mDetails.socialLinks === 'object' && !Array.isArray(mDetails.socialLinks) && mDetails.socialLinks !== null) {
           if ((mDetails.socialLinks as any).website && !fcmData.merchantWebsite) {
              fcmData.merchantWebsite = (mDetails.socialLinks as any).website as string;
           }
        }
        fcmData.merchantSocials = JSON.stringify(mDetails.socialLinks);
      }

      // 2. Send FCM push if eligible
      let successCount = 0;
      let failureCount = 0;
      if (client?.pushToken && client.notifPush) {
        const result = await this.pushProvider.sendMulticast([client.pushToken], title, body, imageUrl, fcmData);
        successCount = result.successCount;
        failureCount = result.failureCount;

        if (result.invalidTokens.length > 0) {
          await this.clientRepo.update({
            where: { id: clientId },
            data: { pushToken: null },
          }).catch(() => {});
        }
      }

      // 3. Create in-app notification record
      const notification = await this.notificationRepo.create({
        data: { merchantId, title, body, recipientCount: 1, successCount, failureCount, channel: 'PUSH' },
      });

      // 4. Create per-client status so it appears in the client's feed
      await this.clientNotifStatusRepo.create({
        data: { clientId, notificationId: notification.id },
      });

      // 5. Real-time: emit WebSocket event for instant badge update
      this.eventsGateway.emitNotificationNew(clientId, {
        clientId,
        notificationId: notification.id,
        merchantId,
        title,
        body,
      });
    } catch (error) {
      this.logger.warn(`Failed to send notification to client ${clientId}: ${error}`);
    }
  }

  /**
   * Batch variant of {@link sendToClient} for jobs that notify many clients of
   * one merchant (stamp-expiry reminders, loyalty cap changes): the same push,
   * in-app record, feed status and WebSocket event per client, but one read of
   * the push preferences, one merchant lookup and two bulk inserts per call
   * instead of ~4 round-trips per client. Push calls stay one per client (texts
   * are personalised) with bounded concurrency. Never throws.
   */
  async sendToClients(
    merchantId: string,
    items: ReadonlyArray<{ clientId: string; title: string; body: string; data?: Record<string, string> }>,
  ): Promise<void> {
    if (items.length === 0) return;
    try {
      const [clients, mDetails] = await Promise.all([
        this.clientRepo.findMany({
          where: { id: { in: [...new Set(items.map((i) => i.clientId))] } },
          select: { id: true, pushToken: true, notifPush: true },
        }),
        this.getMerchantPushDetails(merchantId),
      ]);
      const byId = new Map(clients.map((c) => [c.id, c]));
      const imageUrl = this.buildImageUrl(mDetails?.logoUrl ?? null);
      const merchantData: Record<string, string> = {};
      if (imageUrl) merchantData.merchantLogo = imageUrl;
      if (mDetails?.email) merchantData.merchantEmail = mDetails.email;
      if (mDetails?.adresse) merchantData.merchantAddress = mDetails.adresse;
      const socials = mDetails?.socialLinks;
      if (socials) {
        if (typeof socials === 'object' && !Array.isArray(socials)) {
          const website = (socials as Record<string, unknown>).website;
          if (typeof website === 'string') merchantData.merchantWebsite = website;
        }
        merchantData.merchantSocials = JSON.stringify(socials);
      }

      const staleClientIds: string[] = [];
      const results = await mapLimit(items, CLIENT_PUSH_CONCURRENCY, async (item) => {
        const client = byId.get(item.clientId);
        if (!client?.pushToken || !client.notifPush) return { successCount: 0, failureCount: 0 };
        try {
          const r = await this.pushProvider.sendMulticast(
            [client.pushToken], item.title, item.body, imageUrl, { ...merchantData, ...(item.data ?? {}) },
          );
          if (r.invalidTokens.length > 0) staleClientIds.push(item.clientId);
          return { successCount: r.successCount, failureCount: r.failureCount };
        } catch (err) {
          this.logger.warn(`Push to client ${item.clientId} failed: ${err}`);
          return { successCount: 0, failureCount: 1 };
        }
      });

      const ids = items.map(() => randomUUID());
      await this.notificationRepo.createMany({
        data: items.map((item, i) => ({
          id: ids[i], merchantId, title: item.title, body: item.body,
          recipientCount: 1, ...results[i], channel: 'PUSH' as const,
        })),
      });
      await this.clientNotifStatusRepo.createMany({
        data: items.map((item, i) => ({ clientId: item.clientId, notificationId: ids[i] })),
        skipDuplicates: true,
      });
      if (staleClientIds.length > 0) {
        await this.clientRepo
          .updateMany({ where: { id: { in: staleClientIds } }, data: { pushToken: null } })
          .catch(() => undefined);
      }
      items.forEach((item, i) =>
        this.eventsGateway.emitNotificationNew(item.clientId, {
          clientId: item.clientId, notificationId: ids[i], merchantId, title: item.title, body: item.body,
        }),
      );
    } catch (error) {
      this.logger.warn(`Failed to send ${items.length} notification(s) for merchant ${merchantId}: ${error}`);
    }
  }

  /**
   * Send a marketing email blast to all clients with email who have opted in.
   * Enforces a monthly quota per merchant.
   */
  async sendEmailToAll(merchantId: string, dto: SendEmailBlastDto): Promise<{
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
    // Server-side content moderation
    const violation = detectProhibitedContent(dto.subject, dto.body);
    if (violation) throw new BadRequestException(violation.message);

    // 1. Fetch merchant info
    const merchant = await this.merchantRepo.findUniqueOrThrow({
      where: { id: merchantId },
      select: {
        nom: true,
        email: true,
        phoneNumber: true,
        adresse: true,
        ville: true,
        quartier: true,
        logoUrl: true,
        socialLinks: true,
      },
    });

    // 2. Collect all clients with email — cursor pagination to avoid OOM on large merchants
    const recipients: { id: string; email: string; prenom: string | null; language: string }[] = [];

    for await (const members of this.merchantMemberPages(merchantId)) {
      for (const c of members) {
        // Has an email and respects the client opt-out preference
        if (c.notifEmail && c.email) {
          recipients.push({ id: c.id, email: c.email, prenom: c.prenom, language: c.language });
        }
      }
    }

    if (recipients.length === 0) {
      return { recipientCount: 0, successCount: 0, failureCount: 0 };
    }

    // 3. Check & increment email quota (throws EmailQuotaExceededError if exceeded)
    await this.emailQuotaService.checkAndIncrementQuota(merchantId, recipients.length);

    // 4. Send via Resend
    let result: { successCount: number; failureCount: number; total: number };
    try {
      result = await this.resendService.sendBlast(
        recipients.map((r) => ({ clientId: r.id, email: r.email, prenom: r.prenom, lang: r.language })),
        dto.subject,
        dto.body,
        merchant,
      );
    } catch (error) {
      this.logger.error(`Email blast failed for merchant ${merchantId}: ${error}`);
      result = { successCount: 0, failureCount: recipients.length, total: recipients.length };
    }

    this.logger.log(
      `Email blast "${dto.subject}" for merchant ${merchantId}: ${result.successCount}/${result.total} sent`,
    );

    // Save in notification history
    await this.notificationRepo.create({
      data: {
        merchantId,
        title: dto.subject,
        body: dto.body,
        recipientCount: result.total,
        successCount: result.successCount,
        failureCount: result.failureCount,
        isBroadcast: true,
        channel: 'EMAIL',
      },
    });

    return {
      recipientCount: result.total,
      successCount: result.successCount,
      failureCount: result.failureCount,
    };
  }

  /**
   * Send a WhatsApp marketing blast to all clients with a phone number who opted in.
   * Uses the same Twilio WhatsApp API as OTP sending.
   * Enforces a monthly quota per merchant.
   */
  async sendWhatsAppToAll(merchantId: string, body: string): Promise<{
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
    // Server-side content moderation
    const violation = detectProhibitedContent(body);
    if (violation) throw new BadRequestException(violation.message);

    // 1. Fetch merchant info
    const merchant = await this.merchantRepo.findUniqueOrThrow({
      where: { id: merchantId },
      select: { nom: true },
    });

    // 2. Collect all clients with phone who opted in - cursor pagination
    const recipients: { id: string; telephone: string; prenom: string | null }[] = [];

    for await (const members of this.merchantMemberPages(merchantId)) {
      for (const c of members) {
        if (c.notifWhatsapp && c.telephone) {
          recipients.push({ id: c.id, telephone: c.telephone, prenom: c.prenom });
        }
      }
    }

    if (recipients.length === 0) {
      return { recipientCount: 0, successCount: 0, failureCount: 0 };
    }

    // 3. Send via Twilio WhatsApp (controlled concurrency to respect rate limits)
    let successCount = 0;
    let failureCount = 0;

    // E.164 check: country code (1-3 digits, leading non-zero) + 4-14 digits.
    // Twilio silently rejects malformed numbers, so we count them as failures
    // up front instead of pretending the broadcast succeeded.
    const E164_RE = /^\+[1-9]\d{6,14}$/;

    // Process in batches of 5 to balance speed vs Twilio rate limits
    const WA_CONCURRENCY = 5;
    for (let i = 0; i < recipients.length; i += WA_CONCURRENCY) {
      const batch = recipients.slice(i, i + WA_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (recipient) => {
          if (!E164_RE.test(recipient.telephone)) {
            this.logger.warn(
              `Skipping WhatsApp recipient ${recipient.id}: phone not E.164 (${maskPhone(recipient.telephone)})`,
            );
            return false;
          }
          const clientName = recipient.prenom || 'cher client';
          const formattedMessage = buildWhatsAppBroadcastMessage({
              merchantName: merchant.nom,
              clientName,
              body,
            });
          return this.smsProvider.sendWhatsAppMessage(recipient.telephone, formattedMessage);
        }),
      );
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          successCount++;
        } else {
          failureCount++;
        }
      }
    }

    this.logger.log(
      `WhatsApp blast for merchant ${merchantId}: ${successCount}/${recipients.length} sent`,
    );

    // 4. Save in notification history + create per-client statuses
    const notification = await this.notificationRepo.create({
      data: {
        merchantId,
        title: 'WhatsApp',
        body,
        recipientCount: recipients.length,
        successCount,
        failureCount,
        isBroadcast: true,
        channel: 'WHATSAPP',
      },
    });

    // Create per-client notification status records
    const clientIds = recipients.map((r) => r.id);
    if (clientIds.length > 0) {
      const CHUNK_SIZE = 500;
      try {
        for (let i = 0; i < clientIds.length; i += CHUNK_SIZE) {
          await this.clientNotifStatusRepo.createMany({
            data: clientIds.slice(i, i + CHUNK_SIZE).map((clientId) => ({
              clientId,
              notificationId: notification.id,
            })),
            skipDuplicates: true,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to create WhatsApp client notification statuses: ${error}`);
      }
    }

    // Emit WebSocket events
    for (const clientId of clientIds) {
      this.eventsGateway.emitNotificationNew(clientId, {
        clientId,
        notificationId: notification.id,
        merchantId,
        title: 'WhatsApp',
        body,
      });
    }

    return { recipientCount: recipients.length, successCount, failureCount };
  }

  /**
   * Get the current email quota for a merchant (read-only helper).
   */
  async getEmailQuota(merchantId: string): Promise<{
    emailQuotaUsed: number;
    emailQuotaMax: number;
    remaining: number;
  }> {
    const merchant = await this.emailQuotaService.getQuota(merchantId);
    return {
      emailQuotaUsed: merchant.emailQuotaUsed,
      emailQuotaMax: merchant.emailQuotaMax,
      remaining: merchant.emailQuotaMax - merchant.emailQuotaUsed,
    };
  }

  // ── Admin notification routing (audience × channel) ────────────────────

  /**
   * Dispatches an admin-composed notification to the requested audience over
   * the requested channel. Throws BadRequestException for combinations that
   * do not exist (e.g. WhatsApp to every client).
   */
  async sendAdminNotification(dto: SendAdminNotificationDto): Promise<{
    recipientCount?: number;
    successCount?: number;
    failureCount?: number;
  }> {
    const { audience, channel, title, body, merchantId } = dto;

    if (audience === 'MERCHANT_CLIENTS') {
      if (!merchantId) throw new BadRequestException('merchantId requis pour cette audience');
      if (channel === 'PUSH') return this.sendToAll(merchantId, { title, body });
      if (channel === 'EMAIL') return this.sendEmailToAll(merchantId, { subject: title, body });
      return this.sendWhatsAppToAll(merchantId, body);
    }

    if (channel === 'WHATSAPP') {
      throw new BadRequestException('WhatsApp non disponible pour cette audience');
    }
    if (audience === 'ALL_CLIENTS') {
      return channel === 'PUSH'
        ? this.sendPushToAllClients(title, body)
        : this.sendEmailToAllClients(title, body);
    }
    return channel === 'PUSH'
      ? this.sendPushToAllMerchants(title, body)
      : this.sendEmailToAllMerchants(title, body);
  }

  // ── Admin broadcast: push to all merchants ─────────────────────────────────
  async sendPushToAllMerchants(title: string, body: string): Promise<{
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
    const merchants: { id: string; pushToken: string }[] = [];
    let cursor: string | undefined;

    while (true) {
      const batch = await this.merchantRepo.findMany({
        where: { isActive: true, pushToken: { not: null }, deletedAt: null },
        select: { id: true, pushToken: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      merchants.push(
        ...batch.filter((m: any): m is { id: string; pushToken: string } => !!m.pushToken),
      );
      cursor = batch[batch.length - 1].id;
      if (batch.length < NotificationsService.CLIENT_BATCH_SIZE) break;
    }

    if (merchants.length === 0) {
      return { recipientCount: 0, successCount: 0, failureCount: 0 };
    }

    const tokens = merchants.map((m) => m.pushToken);
    this.logger.log(`Admin broadcast push to ${tokens.length} merchant(s)`);

    let fcmSuccessCount = 0;
    let fcmFailureCount = 0;
    let invalidTokens: string[] = [];

    try {
      // No `action` key here — admin broadcasts to merchants are routed by the
      // `event: 'admin_broadcast'` handler in the JitPlus Pro app (→ /admin-notifications).
      const result = await this.pushProvider.sendMulticast(tokens, title, body, EMAIL_LOGO_JITPLUS_PRO, { event: 'admin_broadcast' }, 'jitpro-default');
      fcmSuccessCount = result.successCount;
      fcmFailureCount = result.failureCount;
      invalidTokens = result.invalidTokens;
    } catch (error) {
      this.logger.error(`Admin push to merchants failed: ${error}`);
      fcmFailureCount = tokens.length;
    }

    // Persist notification record for admin history
    await this.notificationRepo.create({
      data: {
        title, body,
        recipientCount: tokens.length,
        successCount: fcmSuccessCount,
        failureCount: fcmFailureCount,
        isBroadcast: true,
        channel: 'PUSH',
        audience: 'ALL_MERCHANTS',
      },
    });

    // Clean stale FCM tokens
    if (invalidTokens.length > 0) {
      this.logger.log(`Cleaning ${invalidTokens.length} invalid merchant push token(s)`);
      await this.merchantRepo.updateMany({
        where: { pushToken: { in: invalidTokens } },
        data: { pushToken: null },
      }).catch((e: any) => this.logger.warn(`Failed to clean stale merchant tokens: ${e}`));
    }

    return { recipientCount: tokens.length, successCount: fcmSuccessCount, failureCount: fcmFailureCount };
  }

  // ── Admin broadcast: push to all clients ──────────────────────────────────
  /**
   * Streams every push-enabled, non-deleted client by cursor pages (bounded
   * memory): each page is pushed, gets its in-app status rows, WebSocket events
   * and stale-token cleanup before the next page is read. The notification row
   * is created on the first page (status rows reference it) and its counts are
   * written once every page is done; the returned counts are the same as when
   * the whole audience was loaded first.
   */
  async sendPushToAllClients(title: string, body: string): Promise<{
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
    let notificationId: string | null = null;
    let recipientCount = 0;
    let tokenCount = 0;
    let fcmSuccessCount = 0;
    let fcmFailureCount = 0;
    let invalidTokenCount = 0;
    let statusesFailed = false;
    let cursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: { notifPush: true, deletedAt: null },
        select: { id: true, pushToken: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      // 1. Notification record (once) so the status rows can reference it.
      if (notificationId === null) {
        const created = await this.notificationRepo.create({
          data: {
            title, body,
            recipientCount: 0,
            successCount: 0,
            failureCount: 0,
            isBroadcast: true,
            channel: 'PUSH',
            audience: 'ALL_CLIENTS',
          },
          select: { id: true },
        });
        notificationId = created.id;
      }

      const clientIds = batch.map((c) => c.id);
      const tokens = batch.flatMap((c) => (c.pushToken ? [c.pushToken] : []));
      recipientCount += clientIds.length;
      tokenCount += tokens.length;

      // 2. FCM push for this page
      let invalidTokens: string[] = [];
      if (tokens.length > 0) {
        try {
          const result = await this.pushProvider.sendMulticast(tokens, title, body, DEFAULT_NOTIFICATION_LOGO, { event: 'admin_broadcast', action: 'open_notifications' });
          fcmSuccessCount += result.successCount;
          fcmFailureCount += result.failureCount;
          invalidTokens = result.invalidTokens;
        } catch (error) {
          this.logger.error(`Admin push to clients failed: ${error}`);
          fcmFailureCount += tokens.length;
        }
      }

      // 3. Per-client status rows (chunks of 500) so it appears in client feeds.
      // As before, the first failure stops status creation for the rest of the blast.
      if (!statusesFailed) {
        const CHUNK_SIZE = 500;
        try {
          for (let i = 0; i < clientIds.length; i += CHUNK_SIZE) {
            await this.clientNotifStatusRepo.createMany({
              data: clientIds.slice(i, i + CHUNK_SIZE).map((clientId) => ({ clientId, notificationId: notificationId! })),
              skipDuplicates: true,
            });
          }
        } catch (error) {
          statusesFailed = true;
          this.logger.warn(`Failed to create client notification statuses for admin broadcast: ${error}`);
        }
      }

      // 4. WebSocket events for this page
      try {
        for (const clientId of clientIds) {
          this.eventsGateway.emitNotificationNew(clientId, {
            clientId,
            notificationId,
            merchantId: null,
            title,
            body,
          });
        }
      } catch (error) {
        this.logger.warn(`WebSocket emit failed for admin broadcast: ${error}`);
      }

      // 5. Stale FCM tokens of this page (bounded IN lists)
      if (invalidTokens.length > 0) {
        invalidTokenCount += invalidTokens.length;
        await this.clearStaleClientTokens(invalidTokens);
      }

      if (batch.length < NotificationsService.CLIENT_BATCH_SIZE) break;
      // Yield to the event loop between pages
      await new Promise((r) => setImmediate(r));
    }

    if (notificationId === null) {
      return { recipientCount: 0, successCount: 0, failureCount: 0 };
    }

    this.logger.log(`Admin broadcast push to ${tokenCount} client(s), ${recipientCount} total`);
    if (invalidTokenCount > 0) this.logger.log(`Cleaned ${invalidTokenCount} invalid client push token(s)`);

    // Clients without a push token still get the in-app feed entry, so they count as delivered.
    const successCount = recipientCount - tokenCount + fcmSuccessCount;
    await this.notificationRepo.update({
      where: { id: notificationId },
      data: { recipientCount, successCount, failureCount: fcmFailureCount },
    });

    return { recipientCount, successCount, failureCount: fcmFailureCount };
  }

  // ── Admin broadcast: email to all merchants ───────────────────────────────
  async sendEmailToAllMerchants(subject: string, body: string): Promise<{
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
    const merchants: { email: string; nom: string; language: string }[] = [];
    let cursor: string | undefined;

    while (true) {
      const batch = await this.merchantRepo.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, email: true, nom: true, language: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      merchants.push(...batch.map((m: any) => ({ email: m.email, nom: m.nom, language: m.language })));
      cursor = batch[batch.length - 1].id;
      if (batch.length < NotificationsService.CLIENT_BATCH_SIZE) break;
    }

    if (merchants.length === 0) {
      return { recipientCount: 0, successCount: 0, failureCount: 0 };
    }

    this.logger.log(`Admin email broadcast to ${merchants.length} merchant(s)`);

    let result: { successCount: number; failureCount: number; total: number };
    try {
      result = await this.resendService.sendBlast(
        merchants.map((m) => ({ email: m.email, prenom: m.nom, lang: m.language })),
        subject,
        body,
        { nom: 'JitPlus Admin' },
      );
    } catch (error) {
      this.logger.error(`Admin email to merchants failed: ${error}`);
      result = { successCount: 0, failureCount: merchants.length, total: merchants.length };
    }

    // Persist notification record for admin history
    await this.notificationRepo.create({
      data: {
        title: subject, body,
        recipientCount: result.total,
        successCount: result.successCount,
        failureCount: result.failureCount,
        isBroadcast: true,
        channel: 'EMAIL',
        audience: 'ALL_MERCHANTS',
      },
    });

    return { recipientCount: result.total, successCount: result.successCount, failureCount: result.failureCount };
  }

  // ── Admin broadcast: email to all clients ─────────────────────────────────
  async sendEmailToAllClients(subject: string, body: string): Promise<{
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
    const clients: { id: string; email: string; prenom: string | null; language: string }[] = [];
    let cursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: { email: { not: null }, notifEmail: true, deletedAt: null },
        select: { id: true, email: true, prenom: true, language: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      clients.push(
        ...batch.filter((c: any): c is { id: string; email: string; prenom: string | null; language: string } => !!c.email)
          .map((c: any) => ({ id: c.id, email: c.email, prenom: c.prenom, language: c.language })),
      );
      cursor = batch[batch.length - 1].id;
      if (batch.length < NotificationsService.CLIENT_BATCH_SIZE) break;
    }

    if (clients.length === 0) {
      return { recipientCount: 0, successCount: 0, failureCount: 0 };
    }

    this.logger.log(`Admin email broadcast to ${clients.length} client(s)`);

    let result: { successCount: number; failureCount: number; total: number };
    try {
      result = await this.resendService.sendBlast(
        clients.map((c) => ({ clientId: c.id, email: c.email, prenom: c.prenom, lang: c.language })),
        subject,
        body,
        { nom: 'JitPlus Admin' },
      );
    } catch (error) {
      this.logger.error(`Admin email to clients failed: ${error}`);
      result = { successCount: 0, failureCount: clients.length, total: clients.length };
    }

    // Persist notification record for admin history
    await this.notificationRepo.create({
      data: {
        title: subject, body,
        recipientCount: result.total,
        successCount: result.successCount,
        failureCount: result.failureCount,
        isBroadcast: true,
        channel: 'EMAIL',
        audience: 'ALL_CLIENTS',
      },
    });

    return { recipientCount: result.total, successCount: result.successCount, failureCount: result.failureCount };
  }

  /**
   * Merchant broadcast history.
   * `receivedCount` used to be a COUNT of every status row of every broadcast
   * on the page. PUSH and WHATSAPP blasts write exactly one status row per
   * recipient at send time and store that number in `recipientCount`, so it is
   * used directly. Rows whose stored count cannot stand for the status rows
   * fall back to the real count, restricted to those ids: EMAIL blasts (they
   * never write status rows, so this stays 0) and legacy rows (no channel, or
   * recipientCount left at its default 0).
   */
  async getHistory(merchantId: string, page = 1, limit = 20): Promise<{
    notifications: (Notification & { readCount: number; receivedCount: number })[];
    pagination: PaginationResult;
  }> {
    const skip = (page - 1) * limit;
    const where = { merchantId, isBroadcast: true };
    const [notifications, total] = await Promise.all([
      this.notificationRepo.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.notificationRepo.count({ where }),
    ]);

    const storedCountIsExact = (n: Notification) =>
      (n.channel === 'PUSH' || n.channel === 'WHATSAPP') && n.recipientCount > 0;

    // Batch-fetch read counts for the page (+ status counts for the rows that need them)
    const notifIds = notifications.map((n) => n.id);
    const countIds = notifications.filter((n) => !storedCountIsExact(n)).map((n) => n.id);
    const [readGroups, receivedGroups] = await Promise.all([
      notifIds.length
        ? this.clientNotifStatusRepo.groupBy({
            by: ['notificationId'],
            where: { notificationId: { in: notifIds }, isRead: true },
            _count: true,
          })
        : [],
      countIds.length
        ? this.clientNotifStatusRepo.groupBy({
            by: ['notificationId'],
            where: { notificationId: { in: countIds } },
            _count: true,
          })
        : [],
    ]);
    const readMap = new Map(readGroups.map((g: any) => [g.notificationId, g._count as number]));
    const receivedMap = new Map(receivedGroups.map((g: any) => [g.notificationId, g._count as number]));

    return {
      notifications: notifications.map((n) => ({
        ...n,
        receivedCount: storedCountIsExact(n) ? n.recipientCount : (receivedMap.get(n.id) ?? 0),
        readCount: readMap.get(n.id) ?? 0,
        _count: undefined,
      })) as (Notification & { readCount: number; receivedCount: number })[],
      pagination: buildPagination(total, page, limit),
    };
  }
}
