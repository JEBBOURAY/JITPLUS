import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import {
  LOYALTY_CARD_REPOSITORY, type ILoyaltyCardRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  CLIENT_REPOSITORY, type IClientRepository,
  NOTIFICATION_REPOSITORY, type INotificationRepository,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY, type IClientNotificationStatusRepository,
  MERCHANT_NOTIFICATION_READ_REPOSITORY, type IMerchantNotificationReadRepository,
} from '../common/repositories';
import { IEmailBlastProvider, EMAIL_BLAST_PROVIDER, IPushProvider, PUSH_PROVIDER, ISmsProvider, SMS_PROVIDER } from '../common/interfaces';
import { EventsGateway } from '../events';
import { EmailQuotaService } from './email-quota.service';
import { WhatsappQuotaService } from '../merchant/services/whatsapp-quota.service';
import { Notification } from '@prisma/client';
import { SendNotificationDto } from './dto/send-notification.dto';
import { SendEmailBlastDto } from './dto/send-email-blast.dto';
import { buildPagination, PaginationResult } from '../common/utils';
import { DEFAULT_NOTIFICATION_LOGO, LOGO_CACHE_TTL, EMAIL_LOGO_JITPLUS_PRO } from '../common/constants';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(NOTIFICATION_REPOSITORY) private notificationRepo: INotificationRepository,
    @Inject(CLIENT_NOTIFICATION_STATUS_REPOSITORY) private clientNotifStatusRepo: IClientNotificationStatusRepository,
    @Inject(MERCHANT_NOTIFICATION_READ_REPOSITORY) private merchantNotifReadRepo: IMerchantNotificationReadRepository,
    @Inject(PUSH_PROVIDER) private pushProvider: IPushProvider,
    @Inject(EMAIL_BLAST_PROVIDER) private resendService: IEmailBlastProvider,
    @Inject(SMS_PROVIDER) private smsProvider: ISmsProvider,
    private emailQuotaService: EmailQuotaService,
    private whatsappQuotaService: WhatsappQuotaService,
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

  async sendToAll(merchantId: string, dto: SendNotificationDto): Promise<{
    id: string;
    title: string;
    body: string;
    recipientCount: number;
    successCount: number;
    failureCount: number;
    createdAt: Date;
  }> {

    // Collect ALL clients with a loyalty card + push info.
    // Single paginated query fetches both client IDs and push tokens,
    // avoiding a duplicate second pass over the same data.
    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { logoUrl: true },
    });
    const imageUrl = this.buildImageUrl(merchant?.logoUrl);

    const allClientIds: string[] = [];
    const pushRecipients: { id: string; pushToken: string }[] = [];
    let clientCursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: {
          loyaltyCards: { some: { merchantId, deactivatedAt: null } },
        },
        select: { id: true, pushToken: true, notifPush: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(clientCursor ? { skip: 1, cursor: { id: clientCursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;

      for (const c of batch as { id: string; pushToken: string | null; notifPush: boolean }[]) {
        allClientIds.push(c.id);
        if (c.pushToken && c.notifPush) {
          pushRecipients.push({ id: c.id, pushToken: c.pushToken });
        }
      }

      clientCursor = batch[batch.length - 1].id;
      if (batch.length < NotificationsService.CLIENT_BATCH_SIZE) break;
    }

    const tokens = [...new Set(pushRecipients.map((r) => r.pushToken))];
    // Include data payload so client-side handleFcmDataPayload triggers cache invalidation
    const fcmData: Record<string, string> = { event: 'notification_new', merchantId };

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
    const WS_BATCH = 1000;
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
      try {
        await this.clientRepo.updateMany({
          where: { pushToken: { in: invalidTokens } },
          data: { pushToken: null },
        });
      } catch (error) {
        this.logger.warn(`Failed to clean stale tokens: ${error}`);
      }
    }

    return { id: notification.id, title: notification.title, body: notification.body, recipientCount: uniqueClientIds.length, successCount: uniqueClientIds.length, failureCount: fcmFailureCount, createdAt: notification.createdAt };
  }

  /**
   * Resolve merchant logoUrl with a 5-minute in-process cache.
   * Called on every transactional notification — avoids redundant DB hits.
   */
  private async getMerchantLogoUrl(merchantId: string): Promise<string | null> {
    const key = `merchant:logo:${merchantId}`;
    const cached = await this.cache.get<string | null>(key);
    if (cached !== undefined) return cached;
    const m = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { logoUrl: true },
    });
    const url = m?.logoUrl ?? null;
    await this.cache.set(key, url, LOGO_CACHE_TTL);
    return url;
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
      // 1. Lookup client push preferences + merchant logo (logo cached 5 min)
      const [client, logoUrl] = await Promise.all([
        this.clientRepo.findUnique({
          where: { id: clientId },
          select: { pushToken: true, notifPush: true },
        }),
        this.getMerchantLogoUrl(merchantId),
      ]);

      const imageUrl = this.buildImageUrl(logoUrl);

      // 2. Send FCM push if eligible
      let successCount = 0;
      let failureCount = 0;
      if (client?.pushToken && client.notifPush) {
        const result = await this.pushProvider.sendMulticast([client.pushToken], title, body, imageUrl, data);
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
   * Send a marketing email blast to all clients with email who have opted in.
   * Enforces a monthly quota per merchant.
   */
  async sendEmailToAll(merchantId: string, dto: SendEmailBlastDto): Promise<{
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
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
      },
    });

    // 2. Collect all clients with email — cursor pagination to avoid OOM on large merchants
    const recipients: { id: string; email: string; prenom: string | null }[] = [];
    let emailCursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: {
          loyaltyCards: { some: { merchantId, deactivatedAt: null } },
          email: { not: null },
          notifEmail: true, // Respect client opt-out preference
        },
        select: { id: true, email: true, prenom: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(emailCursor ? { skip: 1, cursor: { id: emailCursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) break;

      recipients.push(
        ...batch.filter((c: any): c is { id: string; email: string; prenom: string | null } => !!c.email),
      );
      emailCursor = batch[batch.length - 1].id;

      if (batch.length < NotificationsService.CLIENT_BATCH_SIZE) break;
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
        recipients.map((r) => ({ email: r.email, prenom: r.prenom })),
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
    // 1. Fetch merchant info
    const merchant = await this.merchantRepo.findUniqueOrThrow({
      where: { id: merchantId },
      select: { nom: true },
    });

    // 2. Collect all clients with phone who opted in - cursor pagination
    const recipients: { id: string; telephone: string; prenom: string | null }[] = [];
    let whatsappCursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: {
          loyaltyCards: { some: { merchantId, deactivatedAt: null } },
          telephone: { not: null },
          notifWhatsapp: true,
        },
        select: { id: true, telephone: true, prenom: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(whatsappCursor ? { skip: 1, cursor: { id: whatsappCursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) break;

      recipients.push(
        ...batch.filter((c: any): c is { id: string; telephone: string; prenom: string | null } => !!c.telephone),
      );
      whatsappCursor = batch[batch.length - 1].id;

      if (batch.length < NotificationsService.CLIENT_BATCH_SIZE) break;
    }

    if (recipients.length === 0) {
      return { recipientCount: 0, successCount: 0, failureCount: 0 };
    }

    // 2. Check & increment WhatsApp quota (throws ForbiddenException if exceeded)
    await this.whatsappQuotaService.checkAndIncrementQuota(merchantId, recipients.length);

    // 3. Send via Twilio WhatsApp (controlled concurrency to respect rate limits)
    let successCount = 0;
    let failureCount = 0;

    // Process in batches of 5 to balance speed vs Twilio rate limits
    const WA_CONCURRENCY = 5;
    for (let i = 0; i < recipients.length; i += WA_CONCURRENCY) {
      const batch = recipients.slice(i, i + WA_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (recipient) => {
          const clientName = recipient.prenom || 'cher client';
          const formattedMessage = `*Message de ${merchant.nom}*\n\nBonjour ${clientName},\n\n${body}\n\n_Vous recevez ce message car vous êtes client de ${merchant.nom} via JitPlus._`;
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
   * Record a WhatsApp marketing blast in the notification history.
   * Legacy: kept for backward compatibility with older app versions.
   */
  async recordWhatsappBlast(
    merchantId: string,
    body: string,
    recipientCount: number,
    sentCount: number,
  ): Promise<{ id: string; createdAt: Date }> {
    const notification = await this.notificationRepo.create({
      data: {
        merchantId,
        title: 'WhatsApp',
        body,
        recipientCount,
        successCount: sentCount,
        failureCount: recipientCount - sentCount,
        isBroadcast: true,
        channel: 'WHATSAPP',
      },
    });
    return { id: notification.id, createdAt: notification.createdAt };
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
      }).catch((e) => this.logger.warn(`Failed to clean stale merchant tokens: ${e}`));
    }

    return { recipientCount: tokens.length, successCount: fcmSuccessCount, failureCount: fcmFailureCount };
  }

  // ── Admin broadcast: push to all clients ──────────────────────────────────
  async sendPushToAllClients(title: string, body: string): Promise<{
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
    // 1. Collect ALL clients with push enabled (for DB status records + WS)
    const allClients: { id: string; pushToken: string | null }[] = [];
    let allCursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: { notifPush: true, deletedAt: null },
        select: { id: true, pushToken: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(allCursor ? { skip: 1, cursor: { id: allCursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      allClients.push(...batch);
      allCursor = batch[batch.length - 1].id;
      if (batch.length < NotificationsService.CLIENT_BATCH_SIZE) break;
    }

    const pushRecipients = allClients.filter((c): c is { id: string; pushToken: string } => !!c.pushToken);

    if (allClients.length === 0) {
      return { recipientCount: 0, successCount: 0, failureCount: 0 };
    }

    const tokens = pushRecipients.map((c) => c.pushToken);
    this.logger.log(`Admin broadcast push to ${tokens.length} client(s), ${allClients.length} total`);

    // 2. Send FCM push
    let fcmSuccessCount = 0;
    let fcmFailureCount = 0;
    let invalidTokens: string[] = [];

    if (tokens.length > 0) {
      try {
        const result = await this.pushProvider.sendMulticast(tokens, title, body, DEFAULT_NOTIFICATION_LOGO, { event: 'admin_broadcast' });
        fcmSuccessCount = result.successCount;
        fcmFailureCount = result.failureCount;
        invalidTokens = result.invalidTokens;
      } catch (error) {
        this.logger.error(`Admin push to clients failed: ${error}`);
        fcmFailureCount = tokens.length;
      }
    }

    // 3. Persist notification record
    const allClientIds = allClients.map((c) => c.id);
    const notification = await this.notificationRepo.create({
      data: {
        title, body,
        recipientCount: allClientIds.length,
        successCount: allClientIds.length,
        failureCount: fcmFailureCount,
        isBroadcast: true,
        channel: 'PUSH',
        audience: 'ALL_CLIENTS',
      },
    });

    // 4. Create per-client notification status records so it appears in client feeds
    if (allClientIds.length > 0) {
      const CHUNK_SIZE = 500;
      try {
        for (let i = 0; i < allClientIds.length; i += CHUNK_SIZE) {
          await this.clientNotifStatusRepo.createMany({
            data: allClientIds.slice(i, i + CHUNK_SIZE).map((clientId) => ({
              clientId,
              notificationId: notification.id,
            })),
            skipDuplicates: true,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to create client notification statuses for admin broadcast: ${error}`);
      }
    }

    // 5. Emit WebSocket events in batches
    const WS_BATCH = 500;
    try {
      for (let i = 0; i < allClientIds.length; i += WS_BATCH) {
        const batch = allClientIds.slice(i, i + WS_BATCH);
        for (const clientId of batch) {
          this.eventsGateway.emitNotificationNew(clientId, {
            clientId,
            notificationId: notification.id,
            merchantId: null,
            title,
            body,
          });
        }
        if (i + WS_BATCH < allClientIds.length) {
          await new Promise((r) => setImmediate(r));
        }
      }
    } catch (error) {
      this.logger.warn(`WebSocket emit failed for admin broadcast: ${error}`);
    }

    // 6. Clean stale FCM tokens
    if (invalidTokens.length > 0) {
      this.logger.log(`Cleaning ${invalidTokens.length} invalid client push token(s)`);
      await this.clientRepo.updateMany({
        where: { pushToken: { in: invalidTokens } },
        data: { pushToken: null },
      }).catch((e) => this.logger.warn(`Failed to clean stale client tokens: ${e}`));
    }

    return { recipientCount: allClientIds.length, successCount: allClientIds.length, failureCount: fcmFailureCount };
  }

  // ── Admin broadcast: email to all merchants ───────────────────────────────
  async sendEmailToAllMerchants(subject: string, body: string): Promise<{
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
    const merchants: { email: string; nom: string }[] = [];
    let cursor: string | undefined;

    while (true) {
      const batch = await this.merchantRepo.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, email: true, nom: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      merchants.push(...batch.map((m: any) => ({ email: m.email, nom: m.nom })));
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
        merchants.map((m) => ({ email: m.email, prenom: m.nom })),
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
    const clients: { email: string; prenom: string | null }[] = [];
    let cursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: { email: { not: null }, notifEmail: true, deletedAt: null },
        select: { id: true, email: true, prenom: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) break;
      clients.push(
        ...batch.filter((c: any): c is { id: string; email: string; prenom: string | null } => !!c.email)
          .map((c) => ({ email: c.email, prenom: c.prenom })),
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
        clients,
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

  async getHistory(merchantId: string, page = 1, limit = 20): Promise<{
    notifications: (Notification & { readCount: number; receivedCount: number })[];
    pagination: PaginationResult;
  }> {
    const skip = (page - 1) * limit;
    const where = { merchantId, isBroadcast: true };
    const [notifications, total] = await Promise.all([
      this.notificationRepo.findMany({
        where,
        include: {
          _count: {
            select: { clientStatuses: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.notificationRepo.count({ where }),
    ]);

    // Batch-fetch read counts for the page
    const notifIds = notifications.map((n: any) => n.id);
    const readGroups = notifIds.length
      ? await this.clientNotifStatusRepo.groupBy({
          by: ['notificationId'],
          where: { notificationId: { in: notifIds }, isRead: true },
          _count: true,
        })
      : [];
    const readMap = new Map(readGroups.map((g: any) => [g.notificationId, g._count]));

    return {
      notifications: notifications.map((n: any) => ({
        ...n,
        receivedCount: n._count?.clientStatuses ?? 0,
        readCount: readMap.get(n.id) ?? 0,
        _count: undefined,
      })) as (Notification & { readCount: number; receivedCount: number })[],
      pagination: buildPagination(total, page, limit),
    };
  }

  /**
   * Get admin broadcast notifications targeting ALL_MERCHANTS.
   * Includes per-merchant `isRead` status via the junction table.
   */
  async getAdminNotificationsForMerchants(merchantId: string, page = 1, limit = 20): Promise<{
    notifications: { id: string; title: string; body: string; channel: string | null; createdAt: Date; isRead: boolean }[];
    pagination: PaginationResult;
  }> {
    const skip = (page - 1) * limit;
    const where = { audience: 'ALL_MERCHANTS', isBroadcast: true };
    const [notifications, total] = await Promise.all([
      this.notificationRepo.findMany({
        where,
        select: { id: true, title: true, body: true, channel: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.notificationRepo.count({ where }),
    ]);

    // Fetch read statuses for this merchant in a single query
    const notifIds = notifications.map((n: any) => n.id);
    const reads = notifIds.length > 0
      ? await this.merchantNotifReadRepo.findMany({
          where: { merchantId, notificationId: { in: notifIds } },
          select: { notificationId: true },
        })
      : [];
    const readSet = new Set(reads.map((r: any) => r.notificationId));

    return {
      notifications: notifications.map((n: any) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        channel: n.channel,
        createdAt: n.createdAt,
        isRead: readSet.has(n.id),
      })),
      pagination: buildPagination(total, page, limit),
    };
  }

  /**
   * Mark a single admin notification as read for a merchant.
   */
  async markSingleAdminNotifRead(merchantId: string, notificationId: string): Promise<void> {
    await this.merchantNotifReadRepo.upsert({
      where: { merchantId_notificationId: { merchantId, notificationId } },
      create: { merchantId, notificationId },
      update: {},
    });
  }

  /**
   * Mark all unread admin broadcast notifications as read for a merchant.
   */
  async markAllAdminNotifsRead(merchantId: string): Promise<void> {
    const where = { audience: 'ALL_MERCHANTS', isBroadcast: true };
    const allNotifs = await this.notificationRepo.findMany({
      where,
      select: { id: true },
    });

    const existingReads = await this.merchantNotifReadRepo.findMany({
      where: { merchantId, notificationId: { in: allNotifs.map((n: any) => n.id) } },
      select: { notificationId: true },
    });
    const readSet = new Set(existingReads.map((r: any) => r.notificationId));
    const unreadIds = allNotifs.filter((n: any) => !readSet.has(n.id)).map((n: any) => n.id);

    if (unreadIds.length > 0) {
      await this.merchantNotifReadRepo.createMany({
        data: unreadIds.map((notificationId: string) => ({ merchantId, notificationId })),
        skipDuplicates: true,
      });
    }
  }

  /**
   * Count unread admin broadcast notifications for a merchant.
   */
  async countUnreadAdminNotifications(merchantId: string): Promise<number> {
    const where = { audience: 'ALL_MERCHANTS', isBroadcast: true };
    const [total, readCount] = await Promise.all([
      this.notificationRepo.count({ where }),
      this.merchantNotifReadRepo.count({
        where: { merchantId, notification: { audience: 'ALL_MERCHANTS', isBroadcast: true } },
      }),
    ]);
    return total - readCount;
  }
}
