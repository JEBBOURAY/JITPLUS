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
} from '../common/repositories';
import { IEmailBlastProvider, EMAIL_BLAST_PROVIDER, IPushProvider, PUSH_PROVIDER, ISmsProvider, SMS_PROVIDER } from '../common/interfaces';
import { EventsGateway } from '../events';
import { EmailQuotaService } from './email-quota.service';
import { WhatsappQuotaService } from '../merchant/services/whatsapp-quota.service';
import { Notification } from '@prisma/client';
import { SendNotificationDto } from './dto/send-notification.dto';
import { SendEmailBlastDto } from './dto/send-email-blast.dto';
import { buildPagination, PaginationResult } from '../common/utils';
import { DEFAULT_NOTIFICATION_LOGO, LOGO_CACHE_TTL } from '../common/constants';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(LOYALTY_CARD_REPOSITORY) private loyaltyCardRepo: ILoyaltyCardRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(NOTIFICATION_REPOSITORY) private notificationRepo: INotificationRepository,
    @Inject(CLIENT_NOTIFICATION_STATUS_REPOSITORY) private clientNotifStatusRepo: IClientNotificationStatusRepository,
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
    // â”€â”€ 1. Collect ALL clients with a loyalty card + merchant logo â”€â”€
    // groupBy generates a SQL GROUP BY which is more efficient than SELECT DISTINCT
    // when combined with the composite unique index on (client_id, merchant_id).
    const [allCards, merchant] = await Promise.all([
      this.loyaltyCardRepo.findMany({
        where: { merchantId },
        select: { clientId: true },
        distinct: ['clientId'],
      }),
      this.merchantRepo.findUnique({
        where: { id: merchantId },
        select: { logoUrl: true },
      }),
    ]);
    const allClientIds: string[] = allCards.map((c: any) => c.clientId);
    const imageUrl = this.buildImageUrl(merchant?.logoUrl);

    // â”€â”€ 2. Among those, find who has push tokens for FCM delivery â”€â”€
    const pushRecipients: { id: string; pushToken: string }[] = [];
    let cursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: {
          loyaltyCards: { some: { merchantId } },
          pushToken: { not: null },
          notifPush: true, // Respect client opt-out preference
        },
        select: { id: true, pushToken: true },
        take: NotificationsService.CLIENT_BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) break;

      pushRecipients.push(
        ...batch
          .filter((c: any): c is { id: string; pushToken: string } => !!c.pushToken),
      );
      cursor = batch[batch.length - 1].id;

      if (batch.length < NotificationsService.CLIENT_BATCH_SIZE) break;
    }

    const tokens = pushRecipients.map((r) => r.pushToken);

    // Include data payload so client-side handleFcmDataPayload triggers cache invalidation
    const fcmData: Record<string, string> = { event: 'notification_new', merchantId };

    this.logger.log(`Sending "${dto.title}" to ${tokens.length} device(s), ${allClientIds.length} total client(s) for merchant ${merchantId}`);

    let successCount = 0;
    let failureCount = 0;
    let invalidTokens: string[] = [];
    try {
      const result = await this.pushProvider.sendMulticast(tokens, dto.title, dto.body, imageUrl, fcmData);
      successCount = result.successCount;
      failureCount = result.failureCount;
      invalidTokens = result.invalidTokens;
    } catch (error) {
      this.logger.error(`Push multicast failed for merchant ${merchantId}: ${error}`);
      failureCount = tokens.length;
    }

    // Create notification record — recipientCount = all clients with loyalty card
    const notification = await this.notificationRepo.create({
      data: { merchantId, title: dto.title, body: dto.body, recipientCount: allClientIds.length, successCount, failureCount, isBroadcast: true, channel: 'PUSH' },
    });

    // Create per-client notification status records for ALL clients (not just push).
    // Chunked by 500 to avoid DB timeouts and lock contention on large merchants.
    const uniqueClientIds = [...new Set(allClientIds)];
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

    // Emit WebSocket events in batches to avoid blocking the event loop
    const WS_BATCH = 500;
    try {
      for (let i = 0; i < uniqueClientIds.length; i += WS_BATCH) {
        const batch = uniqueClientIds.slice(i, i + WS_BATCH);
        for (const clientId of batch) {
          this.eventsGateway.emitNotificationNew(clientId, {
            clientId,
            notificationId: notification.id,
            merchantId,
            title: dto.title,
            body: dto.body,
          });
        }
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

    return { id: notification.id, title: notification.title, body: notification.body, recipientCount: uniqueClientIds.length, successCount, failureCount, createdAt: notification.createdAt };
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
        data: { merchantId, title, body, recipientCount: 1, successCount, failureCount },
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
      select: { nom: true },
    });

    // 2. Collect all clients with email — cursor pagination to avoid OOM on large merchants
    const recipients: { id: string; email: string; prenom: string | null }[] = [];
    let emailCursor: string | undefined;

    while (true) {
      const batch = await this.clientRepo.findMany({
        where: {
          loyaltyCards: { some: { merchantId } },
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
        merchant.nom,
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
          loyaltyCards: { some: { merchantId } },
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

    // 3. Send via Twilio WhatsApp (sequential to respect rate limits)
    let successCount = 0;
    let failureCount = 0;

    for (const recipient of recipients) {
      try {
        const clientName = recipient.prenom || 'cher client';
        const formattedMessage = `*Message de ${merchant.nom}*\n\nBonjour ${clientName},\n\n${body}\n\n_Vous recevez ce message car vous êtes client de ${merchant.nom} via JitPlus._`;

        const sent = await this.smsProvider.sendWhatsAppMessage(recipient.telephone, formattedMessage);
        if (sent) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        this.logger.warn(`WhatsApp send failed for ${recipient.id}: ${error}`);
        failureCount++;
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
}
