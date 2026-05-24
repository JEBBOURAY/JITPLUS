import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { IPushProvider, PushMulticastResult } from '../common/interfaces';

@Injectable()
export class FirebaseService implements OnModuleInit, IPushProvider {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App | null = null;
  /** Whether credentials are present (lazy-init will succeed) */
  private credentialsAvailable = false;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID')?.trim();
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL')?.trim();
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.trim();

    if (!projectId || !clientEmail || !privateKey) {
      const env = this.config.get<string>('NODE_ENV');
      const msg =
        `Firebase credentials incomplete – push notifications will be SIMULATED. ` +
        `projectId=${!!projectId}, clientEmail=${!!clientEmail}, privateKey=${!!privateKey}`;
      if (env === 'production') {
        // Escalate in prod: silent simulation in prod is a severe config bug
        this.logger.error(msg);
        try {
          const Sentry = require('@sentry/node');
          Sentry.captureMessage?.('Firebase simulation mode in production', {
            level: 'error',
            tags: { source: 'firebase-service', env },
          });
        } catch {
          // Sentry not installed — already logged
        }
      } else {
        this.logger.warn(msg);
      }
      return;
    }

    // Defer SDK initialization to first use — saves ~50-100 MB RAM and 1-2s cold start
    this.credentialsAvailable = true;
    this.logger.log(`Firebase credentials found (project: ${projectId}) — SDK will lazy-init on first push`);
  }

  /** Lazily initialize Firebase Admin SDK on first actual use */
  private ensureInitialized(): boolean {
    if (this.app) return true;
    if (!this.credentialsAvailable) return false;

    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID')!.trim();
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL')!.trim();
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')!.trim();

    try {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
      this.logger.log(`Firebase Admin SDK initialized (project: ${projectId})`);
      return true;
    } catch (error) {
      this.logger.error(`Firebase Admin SDK initialization FAILED – push notifications will be SIMULATED: ${error}`);
      this.credentialsAvailable = false;
      return false;
    }
  }

  /** Whether Firebase Admin SDK is properly initialized (not in simulation mode). */
  get isInitialized(): boolean {
    return !!this.app || this.credentialsAvailable;
  }

  private static readonly MAX_TOKENS_PER_BATCH = 500;

  /**
   * Send a push notification to a list of FCM or Expo tokens.
   * Automatically routes ExponentPushToken to Expo's API and others to FCM.
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

    let totalSuccess = 0;
    let totalFailure = 0;
    const invalidTokens: string[] = [];

    // Separate tokens into Expo tokens and FCM/APNs tokens
    const expoTokens = tokens.filter(t => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
    const fcmTokens = tokens.filter(t => !t.startsWith('ExponentPushToken[') && !t.startsWith('ExpoPushToken['));

    // Handle Expo Tokens
    if (expoTokens.length > 0) {
      // Expo API requires chunking into batches of 100 (Max 100 per request)
      const EXPO_MAX_BATCH = 100;
      for (let i = 0; i < expoTokens.length; i += EXPO_MAX_BATCH) {
        const batch = expoTokens.slice(i, i + EXPO_MAX_BATCH);
        
        const expoMessages = batch.map(t => ({
          to: t,
          title,
          body,
          sound: 'default',
          badge: 1,
          priority: 'high',
          channelId: androidChannelId,
          mutableContent: true,
          _displayInForeground: true,
          data: imageUrl ? { ...data, imageUrl } : data,
        }));

        try {
          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(expoMessages),
          });
          
          if (response.ok) {
            const ticketsResponse: { data: any[] } = await response.json();
            ticketsResponse.data.forEach((ticket, idx) => {
              if (ticket.status === 'ok') {
                totalSuccess++;
              } else {
                totalFailure++;
                if (ticket.details?.error === 'DeviceNotRegistered') {
                  invalidTokens.push(batch[idx]);
                }
              }
            });
          } else {
            totalFailure += batch.length;
            this.logger.error(`Expo Push API rejected the request for chunk: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          totalFailure += batch.length;
          this.logger.error(`Failed to reach Expo Push API for chunk: ${error}`);
        }

        // Small delay between blocks to avoid rate limiting
        if (i + EXPO_MAX_BATCH < expoTokens.length) {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    }

    // Handle FCM Tokens (Fallback for old clients)
    if (fcmTokens.length > 0) {
      if (!this.ensureInitialized()) {
        this.logger.warn(`[SIMULATED] FCM Push notification to ${fcmTokens.length} device(s): "${title}" – "${body}"`);
        totalSuccess += fcmTokens.length;
      } else {
        // Chunk tokens into batches of 500 (Firebase limit per sendEachForMulticast)
        for (let i = 0; i < fcmTokens.length; i += FirebaseService.MAX_TOKENS_PER_BATCH) {
          const batch = fcmTokens.slice(i, i + FirebaseService.MAX_TOKENS_PER_BATCH);

          const message: admin.messaging.MulticastMessage = {
            tokens: batch,
            notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
            android: {
              priority: 'high',
              notification: {
                channelId: androidChannelId,
                icon: 'notification_icon',
                color: '#7C3AED',
                sound: 'default',
                ...(imageUrl ? { imageUrl } : {}),
              },
            },
            apns: {
              headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert',
              },
              payload: {
                aps: {
                  alert: {
                    title,
                    body,
                  },
                  sound: 'default',
                  badge: 1,
                  'mutable-content': 1,
                },
              },
              fcmOptions: imageUrl ? { imageUrl } : undefined,
            },
            ...(data ? { data } : {}),
          };

          try {
            const response = await admin.messaging().sendEachForMulticast(message);
            totalSuccess += response.successCount;
            totalFailure += response.failureCount;

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

            if (fcmTokens.length > 1000 && i + FirebaseService.MAX_TOKENS_PER_BATCH < fcmTokens.length) {
              await new Promise((r) => setTimeout(r, 100));
            }
          } catch (error) {
            this.logger.error(`FCM batch send failed (${batch.length} tokens): ${error}`);
            totalFailure += batch.length;
          }
        }
      }
    }

    this.logger.log(
      `Push sent: ${totalSuccess} OK, ${totalFailure} failed (Expo: ${expoTokens.length}, FCM: ${fcmTokens.length})`,
    );

    return {
      successCount: totalSuccess,
      failureCount: totalFailure,
      invalidTokens,
    };
  }

  /**
   * Send a push notification to a single merchant FCM or Expo token.
   * Uses the dedicated `jitpro-default` Android channel.
   */
  async sendToMerchant(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ invalidToken: boolean }> {
    if (!token) return { invalidToken: false };

    if (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) {
      const expoMessage = {
        to: token,
        title,
        body,
        sound: 'default',
        badge: 1,
        priority: 'high',
        channelId: 'jitpro-default',
        mutableContent: true,
        _displayInForeground: true,
        data,
      };

      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([expoMessage]),
        });
        
        if (response.ok) {
          const ticketsResponse: { data: any[] } = await response.json();
          const ticket = ticketsResponse.data[0];
          
          if (ticket.status === 'ok') {
            this.logger.log(`Expo Merchant push delivered: "${title}"`);
            return { invalidToken: false };
          } else {
            const isInvalid = ticket.details?.error === 'DeviceNotRegistered';
            if (isInvalid) {
              this.logger.warn(`Expo Merchant push failed — stale token detected: DeviceNotRegistered`);
            } else {
              this.logger.warn(`Expo Merchant push failed: ${ticket.message}`);
            }
            return { invalidToken: isInvalid };
          }
        } else {
          this.logger.error(`Expo Push API error: ${response.status}`);
          return { invalidToken: false };
        }
      } catch (error) {
        this.logger.warn(`Expo Merchant push request failed: ${error}`);
        return { invalidToken: false };
      }
    }

    // Fallback to FCM for old clients
    if (!this.ensureInitialized()) {
      this.logger.warn(`[SIMULATED] Merchant push: "${title}" – "${body}"`);
      return { invalidToken: false };
    }

    try {
      const message: admin.messaging.Message = {
        token,
        notification: { title, body },
        android: {
          priority: 'high',
          notification: {
            channelId: 'jitpro-default',
            sound: 'default',
            icon: 'notification_icon',
            color: '#1F2937',
          },
        },
        apns: {
          // iOS: same headers as multicast — guarantees the data payload is
          // delivered to the app on tap so deep-link navigation works.
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
          },
          payload: {
            aps: {
              alert: {
                title,
                body,
              },
              sound: 'default',
              badge: 1,
              'mutable-content': 1,
            },
          },
        },
        ...(data ? { data } : {}),
      };

      await admin.messaging().send(message);
      this.logger.log(`Merchant push delivered: "${title}"`);
      return { invalidToken: false };
    } catch (err) {
      const code = (err as { code?: string }).code;
      const isInvalid = code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token'
        || code === 'messaging/invalid-argument';
      if (isInvalid) {
        this.logger.warn(`Merchant push failed — stale token detected: ${code}`);
      } else {
        this.logger.warn(`Merchant push failed: ${(err as Error).message}`);
      }
      return { invalidToken: isInvalid };
    }
  }
}
