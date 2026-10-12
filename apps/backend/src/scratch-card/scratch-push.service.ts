import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IPushProvider, PUSH_PROVIDER } from '../common/interfaces';
import { DEFAULT_NOTIFICATION_LOGO } from '../common/constants';
import { EventsGateway } from '../events';
import { PrismaService } from '../prisma/prisma.service';
import { errMsg } from '../common/utils';

export interface PushRecipient {
  clientId: string;
  language: string | null;
  pushToken: string | null;
  notifPush: boolean;
}

export interface PushMessage {
  title: string;
  body: string;
}

const STATUS_CHUNK = 500;
const WS_CHUNK = 250;

/**
 * Sends localised pushes to many clients at once and records them in the
 * in-app feed. Recipients sharing the same text are grouped into a single
 * multicast and a single Notification row.
 */
@Injectable()
export class ScratchPushService {
  private readonly logger = new Logger(ScratchPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly pushProvider: IPushProvider,
    private readonly eventsGateway: EventsGateway,
    private readonly config: ConfigService,
  ) {}

  buildImageUrl(path?: string | null): string | undefined {
    const img = path || DEFAULT_NOTIFICATION_LOGO;
    if (img.startsWith('http')) return img;
    const baseUrl = this.config.get<string>('BACKEND_URL');
    return baseUrl ? `${baseUrl}${img}` : undefined;
  }

  /**
   * Returns the number of devices that accepted the push. Callers sending one
   * logical message in several calls (dispatch batches) pass the same
   * `inAppRows` map so every batch reuses the Notification row of its text.
   */
  async send(
    merchant: { id: string; logoUrl?: string | null },
    recipients: PushRecipient[],
    build: (recipient: PushRecipient) => PushMessage,
    data: Record<string, string>,
    options: { inApp?: boolean; inAppRows?: Map<string, string> } = {},
  ): Promise<number> {
    if (recipients.length === 0) return 0;
    const inApp = options.inApp ?? true;
    const imageUrl = this.buildImageUrl(merchant.logoUrl);

    const groups = new Map<string, { message: PushMessage; recipients: PushRecipient[] }>();
    for (const r of recipients) {
      const message = build(r);
      const key = `${message.title}\u0000${message.body}`;
      const group = groups.get(key);
      if (group) group.recipients.push(r);
      else groups.set(key, { message, recipients: [r] });
    }

    let delivered = 0;
    const invalidTokens: string[] = [];
    for (const [key, { message, recipients: groupRecipients }] of groups) {
      const tokens = [
        ...new Set(groupRecipients.filter((r) => r.pushToken && r.notifPush).map((r) => r.pushToken as string)),
      ];
      let successCount = 0;
      let failureCount = 0;
      if (tokens.length > 0) {
        try {
          const result = await this.pushProvider.sendMulticast(
            tokens,
            message.title,
            message.body,
            imageUrl,
            imageUrl ? { ...data, merchantLogo: imageUrl } : { ...data },
            'jit-marketing',
          );
          successCount = result.successCount;
          failureCount = result.failureCount;
          invalidTokens.push(...result.invalidTokens);
        } catch (err) {
          failureCount = tokens.length;
          this.logger.warn(`Scratch push multicast failed: ${errMsg(err)}`);
        }
      }
      delivered += successCount;

      if (inApp) {
        await this.recordInApp(
          merchant.id,
          message,
          groupRecipients.map((r) => r.clientId),
          successCount,
          failureCount,
          key,
          options.inAppRows,
        );
      }
    }

    if (invalidTokens.length > 0) {
      await this.prisma.client
        .updateMany({ where: { pushToken: { in: invalidTokens } }, data: { pushToken: null } })
        .catch((err) => this.logger.warn(`Stale token cleanup failed: ${errMsg(err)}`));
    }
    return delivered;
  }

  async sendToMerchant(
    merchant: { id: string; pushToken: string | null },
    message: PushMessage,
    data: Record<string, string>,
  ): Promise<void> {
    if (!merchant.pushToken) return;
    try {
      const { invalidToken } = await this.pushProvider.sendToMerchant(merchant.pushToken, message.title, message.body, data);
      if (invalidToken) {
        await this.prisma.merchant.updateMany({
          where: { id: merchant.id, pushToken: merchant.pushToken },
          data: { pushToken: null },
        });
      }
    } catch (err) {
      this.logger.warn(`Merchant push failed for ${merchant.id}: ${errMsg(err)}`);
    }
  }

  private async recordInApp(
    merchantId: string,
    message: PushMessage,
    clientIds: string[],
    successCount: number,
    failureCount: number,
    key: string,
    rows?: Map<string, string>,
  ): Promise<void> {
    try {
      const existingId = rows?.get(key);
      // isBroadcast must stay false: the client feed shows broadcast rows to
      // every client of the merchant, not only to the targeted ones.
      const notification = existingId
        ? await this.prisma.notification.update({
            where: { id: existingId },
            data: {
              recipientCount: { increment: clientIds.length },
              successCount: { increment: successCount },
              failureCount: { increment: failureCount },
            },
          })
        : await this.prisma.notification.create({
            data: {
              merchantId,
              title: message.title.slice(0, 255),
              body: message.body.slice(0, 2000),
              recipientCount: clientIds.length,
              successCount,
              failureCount,
              isBroadcast: false,
              channel: 'PUSH',
            },
          });
      rows?.set(key, notification.id);
      for (let i = 0; i < clientIds.length; i += STATUS_CHUNK) {
        await this.prisma.clientNotificationStatus.createMany({
          data: clientIds.slice(i, i + STATUS_CHUNK).map((clientId) => ({ clientId, notificationId: notification.id })),
          skipDuplicates: true,
        });
      }
      for (let i = 0; i < clientIds.length; i += WS_CHUNK) {
        this.eventsGateway.server
          .to(clientIds.slice(i, i + WS_CHUNK).map((id) => `client:${id}`))
          .emit('notification:new', {
            notificationId: notification.id,
            merchantId,
            title: notification.title,
            body: notification.body,
          });
      }
    } catch (err) {
      this.logger.warn(`Scratch in-app notification failed: ${errMsg(err)}`);
    }
  }
}
