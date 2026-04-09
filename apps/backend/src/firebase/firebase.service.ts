import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { IPushProvider, PushMulticastResult } from '../common/interfaces';

@Injectable()
export class FirebaseService implements OnModuleInit, IPushProvider {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID')?.trim();
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL')?.trim();
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.trim();

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        `Firebase credentials incomplete – push notifications will be SIMULATED. ` +
        `projectId=${!!projectId}, clientEmail=${!!clientEmail}, privateKey=${!!privateKey}`,
      );
      return;
    }

    try {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
      this.logger.log(`Firebase Admin SDK initialized (project: ${projectId})`);
    } catch (error) {
      this.logger.error(`Firebase Admin SDK initialization FAILED – push notifications will be SIMULATED: ${error}`);
    }
  }

  /** Whether Firebase Admin SDK is properly initialized (not in simulation mode). */
  get isInitialized(): boolean {
    return !!this.app;
  }

  private static readonly MAX_TOKENS_PER_BATCH = 500;

  /**
   * Send a push notification to a list of FCM tokens.
   * Automatically chunks into batches of 500 (Firebase limit).
   * Returns { successCount, failureCount }.
   */
  async sendMulticast(
    tokens: string[],
    title: string,
    body: string,
    imageUrl?: string,
    data?: Record<string, string>,
    androidChannelId: string = 'jit-marketing',
  ): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
    if (!tokens.length) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    // If Firebase is not initialized, simulate the send
    if (!this.app) {
      this.logger.warn(
        `[SIMULATED] Push notification to ${tokens.length} device(s): "${title}" – "${body}"`,
      );
      return { successCount: tokens.length, failureCount: 0, invalidTokens: [] };
    }

    let totalSuccess = 0;
    let totalFailure = 0;
    const invalidTokens: string[] = [];

    // Chunk tokens into batches of 500 (Firebase limit per sendEachForMulticast)
    for (let i = 0; i < tokens.length; i += FirebaseService.MAX_TOKENS_PER_BATCH) {
      const batch = tokens.slice(i, i + FirebaseService.MAX_TOKENS_PER_BATCH);

      const message: admin.messaging.MulticastMessage = {
        tokens: batch,
        notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
        android: {
          priority: 'high',
          notification: { channelId: androidChannelId, ...(imageUrl ? { imageUrl } : {}) },
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
          fcmOptions: imageUrl ? { imageUrl } : undefined,
        },
        ...(data ? { data } : {}),
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(message);
        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        // Collect invalid/unregistered tokens for cleanup
        response.responses.forEach((resp, idx) => {
          if (
            resp.error &&
            (
              resp.error.code === 'messaging/registration-token-not-registered' ||
              resp.error.code === 'messaging/invalid-registration-token' ||
              resp.error.code === 'messaging/invalid-argument'
            )
          ) {
            invalidTokens.push(batch[idx]);
          }
        });
      } catch (error) {
        this.logger.error(`FCM batch send failed (${batch.length} tokens): ${error}`);
        totalFailure += batch.length;
      }
    }

    this.logger.log(
      `Push sent: ${totalSuccess} OK, ${totalFailure} failed (${Math.ceil(tokens.length / FirebaseService.MAX_TOKENS_PER_BATCH)} batch(es))`,
    );

    return {
      successCount: totalSuccess,
      failureCount: totalFailure,
      invalidTokens,
    };
  }

  /**
   * Send a push notification to a single merchant FCM token.
   * Uses the dedicated `jit-pro` Android channel (B2B, high priority).
   * Errors are caught and only logged — never thrown.
   */
  async sendToMerchant(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!token) return;

    if (!this.app) {
      this.logger.warn(`[SIMULATED] Merchant push: "${title}" – "${body}"`);
      return;
    }

    try {
      const message: admin.messaging.Message = {
        token,
        notification: { title, body },
        android: {
          priority: 'high',
          notification: { channelId: 'jitpro-default', sound: 'default' },
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
        ...(data ? { data } : {}),
      };

      await admin.messaging().send(message);
      this.logger.log(`Merchant push delivered: "${title}"`);
    } catch (err) {
      this.logger.warn(`Merchant push failed (token may be stale): ${(err as Error).message}`);
    }
  }
}
