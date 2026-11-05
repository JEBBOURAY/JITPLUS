import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { IPushProvider } from '../common/interfaces';
import { mapLimit } from '../common/tasks/cron-utils';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const EXPO_MAX_BATCH = 100;
/** Per-attempt HTTP timeout for the Expo push API. */
export const EXPO_TIMEOUT_MS = 10_000;
/** Retries after the first attempt (429 / 5xx / network error / timeout). */
export const EXPO_MAX_RETRIES = 2;
/** First backoff step; doubles per retry, with jitter in [50%, 100%]. */
const EXPO_BACKOFF_BASE_MS = 500;
/** Upper bound for any single wait, including a server-sent Retry-After. */
const EXPO_MAX_BACKOFF_MS = 10_000;
/** Chunks in flight at once for a multicast. */
export const EXPO_CHUNK_CONCURRENCY = 4;
/** Expo's documented per-project send rate; chunk starts are paced to stay under it. */
const EXPO_MAX_NOTIFICATIONS_PER_SEC = 600;

interface ExpoTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

/** Outcome of one Expo request (after retries). `tickets` is set only for a well-formed 2xx body. */
type ExpoSendResult = { ok: true; tickets: (ExpoTicket | undefined)[] } | { ok: false; reason: string };

/** Parses Retry-After (delta-seconds or HTTP date) into ms; null when absent/invalid. */
function parseRetryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

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

  /** Overridable in tests. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Returns a function that delays each chunk start so that, across all
   * concurrent workers of one multicast, sends stay under Expo's documented
   * 600 notifications/s. Slots are reserved synchronously, so it is race-free.
   */
  private createExpoPacer(): (messages: number) => Promise<void> {
    let nextSlot = 0;
    return async (messages: number) => {
      const now = Date.now();
      const start = Math.max(now, nextSlot);
      nextSlot = start + (messages * 1000) / EXPO_MAX_NOTIFICATIONS_PER_SEC;
      if (start > now) await this.sleep(start - now);
    };
  }

  /** Exponential backoff with jitter, or the server's Retry-After (both capped). */
  private expoBackoffMs(retryIndex: number, retryAfter: string | null): number {
    const fromHeader = parseRetryAfterMs(retryAfter);
    if (fromHeader !== null) return Math.min(fromHeader, EXPO_MAX_BACKOFF_MS);
    const exp = Math.min(EXPO_BACKOFF_BASE_MS * 2 ** retryIndex, EXPO_MAX_BACKOFF_MS);
    return Math.round(exp / 2 + Math.random() * (exp / 2));
  }

  /**
   * POSTs one Expo request with a per-attempt timeout. Retries up to
   * EXPO_MAX_RETRIES times on 429, 5xx, network errors and timeouts; other
   * 4xx and malformed 2xx bodies fail immediately. Never throws.
   */
  private async sendExpoRequest(messages: unknown[]): Promise<ExpoSendResult> {
    let lastReason = 'unknown error';
    for (let attempt = 0; attempt <= EXPO_MAX_RETRIES; attempt++) {
      let retryAfter: string | null = null;
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
        });

        if (response.ok) {
          let payload: unknown;
          try {
            payload = await response.json();
          } catch (err) {
            return { ok: false, reason: `malformed Expo response (invalid JSON): ${err}` };
          }
          const tickets = (payload as { data?: unknown } | null)?.data;
          if (!Array.isArray(tickets)) {
            const errors = (payload as { errors?: unknown } | null)?.errors;
            return {
              ok: false,
              reason: `malformed Expo response (no data array)${errors ? `: ${JSON.stringify(errors).slice(0, 300)}` : ''}`,
            };
          }
          return {
            ok: true,
            tickets: tickets.map((t) => (t && typeof t === 'object' ? (t as ExpoTicket) : undefined)),
          };
        }

        lastReason = `${response.status} ${response.statusText}`;
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) return { ok: false, reason: lastReason };
        retryAfter = response.headers.get('retry-after');
      } catch (error) {
        // Network failure or AbortSignal timeout (TimeoutError) — retryable.
        lastReason = `${error}`;
      }

      if (attempt < EXPO_MAX_RETRIES) {
        const delay = this.expoBackoffMs(attempt, retryAfter);
        this.logger.warn(`Expo Push API attempt ${attempt + 1} failed (${lastReason}); retrying in ${delay}ms`);
        await this.sleep(delay);
      }
    }
    return { ok: false, reason: `${lastReason} (after ${EXPO_MAX_RETRIES + 1} attempts)` };
  }

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
      const batches: string[][] = [];
      for (let i = 0; i < expoTokens.length; i += EXPO_MAX_BATCH) {
        batches.push(expoTokens.slice(i, i + EXPO_MAX_BATCH));
      }

      // Bounded concurrency; results come back in input order so the
      // invalid-token list keeps the same ordering as a sequential send.
      const pacer = this.createExpoPacer();
      const results = await mapLimit(batches, EXPO_CHUNK_CONCURRENCY, async (batch) => {
        await pacer(batch.length);
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
        return { batch, result: await this.sendExpoRequest(expoMessages) };
      });

      for (const { batch, result } of results) {
        if (!result.ok) {
          totalFailure += batch.length;
          this.logger.error(`Expo Push API failed for chunk of ${batch.length}: ${result.reason}`);
          continue;
        }
        // One ticket per message, in order. A missing/garbled ticket counts as a failure.
        batch.forEach((token, idx) => {
          const ticket = result.tickets[idx];
          if (ticket?.status === 'ok') {
            totalSuccess++;
          } else {
            totalFailure++;
            if (ticket?.details?.error === 'DeviceNotRegistered') {
              invalidTokens.push(token);
            }
          }
        });
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
   * Uses the `jitpro-default` Android channel unless the caller names another.
   */
  async sendToMerchant(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    androidChannelId: string = 'jitpro-default',
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
        channelId: androidChannelId,
        mutableContent: true,
        _displayInForeground: true,
        data,
      };

      const result = await this.sendExpoRequest([expoMessage]);
      if (!result.ok) {
        this.logger.warn(`Expo Merchant push request failed: ${result.reason}`);
        return { invalidToken: false };
      }
      const ticket = result.tickets[0];
      if (ticket?.status === 'ok') {
        this.logger.log(`Expo Merchant push delivered: "${title}"`);
        return { invalidToken: false };
      }
      const isInvalid = ticket?.details?.error === 'DeviceNotRegistered';
      if (isInvalid) {
        this.logger.warn(`Expo Merchant push failed — stale token detected: DeviceNotRegistered`);
      } else {
        this.logger.warn(`Expo Merchant push failed: ${ticket?.message ?? 'missing ticket in Expo response'}`);
      }
      return { invalidToken: isInvalid };
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
            channelId: androidChannelId,
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
