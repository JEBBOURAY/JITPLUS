/**
 * Real-time event listener for the client app.
 * Connects to the WebSocket server and auto-invalidates React Query cache
 * when the backend emits events (transaction, notification, etc.).
 *
 * Also handles FCM data payloads for background/offline scenarios.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import {
  WS_EVENTS,
  StampsUpdatedPayload,
  NotificationNewPayload,
  ScratchCardsChangedPayload,
  CouponUpdatedPayload,
  CollectionUpdatedPayload,
} from '@jitplus/shared/src/realtime';
import { invalidateNotifications, invalidateStamps, queryKeys } from './useQueryHooks';
import { invalidateScratchCards, scratchKeys } from './useScratchHooks';
import { invalidateCollections } from './useCollectionHooks';
import { invalidateBookings } from './useBookingHooks';
import { BOOKING_WS_EVENTS, type BookingChangedPayload } from '@jitplus/shared/src/booking';
import { useWsStore } from '@/stores/wsStore';
import type { NotificationsResponse, StampsOverview } from '@/types';
import type { InfiniteData } from '@tanstack/react-query';

/** Optimistically increment unread count by 1 for instant badge update. */
function optimisticIncrementUnread(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.cancelQueries({ queryKey: queryKeys.unreadCount });
  const current = queryClient.getQueryData<{ unreadCount: number }>(queryKeys.unreadCount);
  if (current) {
    queryClient.setQueryData(queryKeys.unreadCount, {
      unreadCount: Math.max(0, current.unreadCount + 1),
    });
  }
}

/**
 * Refetch the unread badge from the server. Used for pushes: the same
 * notification also arrives over the WebSocket (and again when it is tapped),
 * so adding 1 on each path counted it two or three times.
 */
function refreshUnread(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
}

/**
 * Everything the socket keeps fresh. The socket is closed while the app is in
 * the background, so events sent meanwhile are lost: catch up on reconnect.
 */
function invalidateLiveData(queryClient: ReturnType<typeof useQueryClient>) {
  invalidateStamps(queryClient);
  invalidateScratchCards(queryClient);
  queryClient.invalidateQueries({ queryKey: scratchKeys.coupons });
  invalidateNotifications(queryClient);
  invalidateBookings(queryClient);
  invalidateCollections(queryClient);
}

/**
 * Listen for real-time events on the socket and invalidate/update cache.
 * Call this once in your root layout (e.g. RootLayoutNav).
 */
export function useRealtimeEvents(socket: Socket | null) {
  const queryClient = useQueryClient();
  const setWsConnected = useWsStore((s) => s.setConnected);

  useEffect(() => {
    if (!socket) {
      setWsConnected(false);
      return;
    }

    // Track WS connection state for polling hooks
    // The first connection follows a fresh fetch; later ones follow a gap.
    let connectedBefore = socket.connected;
    const onConnect = () => {
      setWsConnected(true);
      if (connectedBefore) invalidateLiveData(queryClient);
      connectedBefore = true;
    };
    const onDisconnect = () => setWsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    // Set initial state
    setWsConnected(socket.connected);

    // ── Stamps balance updated ───────────────────────────────
    const onStampsUpdated = (payload: StampsUpdatedPayload) => {
      invalidateStamps(queryClient);
      useWsStore.getState().pushStampsEvent(payload);

      if (__DEV__) {
        console.log('[RT] Stamps updated for merchant', payload.merchantName);
      }
    };

    // ── New notification received ────────────────────────────
    const onNotificationNew = (payload: NotificationNewPayload) => {
      // The foreground push may have refetched the list first: never count or show it twice.
      const cached = queryClient.getQueryData<InfiniteData<NotificationsResponse>>(queryKeys.notifications);
      if (cached?.pages.some((p) => p.notifications.some((n) => n.id === payload.notificationId))) return;
      optimisticIncrementUnread(queryClient);

      // Shown at once from the socket payload, then replaced by the real row
      // (merchant, type, link) from the refetch below.
      queryClient.setQueryData<InfiniteData<NotificationsResponse>>(
        queryKeys.notifications,
        (old) => {
          if (!old?.pages?.length) return old;
          const stub = {
            id: payload.notificationId,
            title: payload.title,
            body: payload.body,
            type: 'info' as const,
            merchantName: null,
            merchantCategory: null,
            merchantLogoUrl: null,
            isRead: false,
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          const firstPage = old.pages[0];
          return {
            ...old,
            pages: [
              { ...firstPage, notifications: [stub, ...firstPage.notifications] },
              ...old.pages.slice(1),
            ],
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications, exact: true });
    };

    // ── Scratch cards changed (received / cancelled / extended) ──
    const onScratchCardsChanged = (payload: ScratchCardsChangedPayload) => {
      invalidateScratchCards(queryClient);
      if (__DEV__) {
        console.log('[RT] Scratch cards changed:', payload.reason);
      }
    };

    // ── Coupon updated (used in store, cancelled, extended) ──
    const onCouponUpdated = (payload: CouponUpdatedPayload) => {
      queryClient.invalidateQueries({ queryKey: scratchKeys.coupons });
      queryClient.invalidateQueries({ queryKey: scratchKeys.coupon(payload.couponId) });
      invalidateCollections(queryClient, payload.merchantId);
      if (__DEV__) {
        console.log('[RT] Coupon updated:', payload.couponId, payload.status);
      }
    };

    // ── A product of a collection ticked at the till (and the gift when it completes) ──
    const onCollectionUpdated = (payload: CollectionUpdatedPayload) => {
      invalidateCollections(queryClient, payload.merchantId);
      if (payload.couponId) queryClient.invalidateQueries({ queryKey: scratchKeys.coupons });
    };

    // ── Booking created / confirmed / declined / cancelled ──
    const onBookingChanged = (payload: BookingChangedPayload) => {
      invalidateBookings(queryClient, payload.merchantId);
      if (__DEV__) {
        console.log('[RT] Booking changed:', payload.bookingId, payload.status);
      }
    };

    socket.on(WS_EVENTS.STAMPS_UPDATED, onStampsUpdated);
    socket.on(BOOKING_WS_EVENTS.CLIENT_CHANGED, onBookingChanged);
    socket.on(WS_EVENTS.NOTIFICATION_NEW, onNotificationNew);
    socket.on(WS_EVENTS.SCRATCH_CARDS_CHANGED, onScratchCardsChanged);
    socket.on(WS_EVENTS.COUPON_UPDATED, onCouponUpdated);
    socket.on(WS_EVENTS.COLLECTION_UPDATED, onCollectionUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(WS_EVENTS.STAMPS_UPDATED, onStampsUpdated);
      socket.off(WS_EVENTS.NOTIFICATION_NEW, onNotificationNew);
      socket.off(WS_EVENTS.SCRATCH_CARDS_CHANGED, onScratchCardsChanged);
      socket.off(WS_EVENTS.COUPON_UPDATED, onCouponUpdated);
      socket.off(WS_EVENTS.COLLECTION_UPDATED, onCollectionUpdated);
      socket.off(BOOKING_WS_EVENTS.CLIENT_CHANGED, onBookingChanged);
      setWsConnected(false);
    };
  }, [socket, queryClient, setWsConnected]);
}

/**
 * Handle FCM data payloads from push notifications.
 * Call this when a notification is received (foreground, background tap, or cold start).
 * This is the fallback for when the WebSocket is not connected.
 */
export function handleFcmDataPayload(
  data: Record<string, string> | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  if (!data?.event) return;

  switch (data.event) {
    case 'stamps_updated':
    case 'reward_available':
    case 'reward_redeemed':
      // Only invalidate stamps — notification list will be refreshed by its own staleTime
      invalidateStamps(queryClient);
      break;
    case 'lucky_wheel_ticket':
    case 'stamps_expiring':
    case 'welcome_bonus':
      invalidateStamps(queryClient);
      refreshUnread(queryClient);
      break;
    // Booking confirmed / declined / cancelled / reminders: also written in the feed.
    case 'booking':
      invalidateBookings(queryClient, data.merchantId);
      invalidateNotifications(queryClient);
      break;
    case 'notification_new':
      invalidateNotifications(queryClient);
      break;
    // Automated campaign events — invalidate relevant caches
    case 'welcome_series':
    case 'reengagement':
    case 'feature_highlight':
    case 'friday_campaign':
    case 'admin_broadcast':
    // The daily deals digest also writes an entry in the notifications tab.
    case 'deals_digest':
      invalidateNotifications(queryClient);
      break;
    case 'reward_reminder':
      invalidateStamps(queryClient);
      refreshUnread(queryClient);
      break;
    // Scratch cards & coupons
    case 'scratch_card_received':
    case 'scratch_card_expiring':
      invalidateScratchCards(queryClient);
      refreshUnread(queryClient);
      break;
    case 'coupon_expiring':
    case 'coupon_cancelled':
    case 'coupon_extended':
      queryClient.invalidateQueries({ queryKey: scratchKeys.coupons });
      invalidateScratchCards(queryClient);
      if (data.couponId) {
        queryClient.invalidateQueries({ queryKey: scratchKeys.coupon(data.couponId) });
      }
      refreshUnread(queryClient);
      break;
    case 'collection_progress':
    case 'collection_completed':
      invalidateCollections(queryClient, data.merchantId);
      if (data.couponId) queryClient.invalidateQueries({ queryKey: scratchKeys.coupons });
      refreshUnread(queryClient);
      break;
    case 'coupon_redeemed':
      queryClient.invalidateQueries({ queryKey: scratchKeys.coupons });
      // A collection gift used at the till changes the collections history.
      invalidateCollections(queryClient, data.merchantId);
      if (data.couponId) {
        queryClient.invalidateQueries({ queryKey: scratchKeys.coupon(data.couponId) });
      }
      invalidateStamps(queryClient);
      refreshUnread(queryClient);
      break;
    case 'weekly_digest':
      invalidateStamps(queryClient);
      break;
    default:
      // Unknown events still write an entry in the notifications tab.
      invalidateNotifications(queryClient);
      if (__DEV__) console.log('[FCM] Unhandled event type:', data.event);
  }
}

const SCAN_PUSH_EVENTS = new Set(['stamps_updated', 'reward_available', 'reward_redeemed']);

/**
 * Forward a scan push received while the app is in the foreground to the ws
 * store, so the QR screen can confirm the scan even when the WebSocket missed it.
 */
export function pushStampsEventFromNotification(
  data: Record<string, string> | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  if (!data?.event || !SCAN_PUSH_EVENTS.has(data.event) || !data.merchantId) return;
  const type = data.type;
  if (type !== 'EARN_STAMPS' && type !== 'REDEEM_REWARD') return;
  const newBalance = Number(data.newBalance);
  if (!Number.isFinite(newBalance)) return;
  const card = queryClient
    .getQueryData<StampsOverview>(queryKeys.stamps)
    ?.cards.find((c) => c.merchantId === data.merchantId);
  useWsStore.getState().pushStampsEvent({
    // Not part of the push payload, and nothing downstream reads it.
    clientId: '',
    merchantId: data.merchantId,
    merchantName: data.merchantName || card?.merchant?.nomBoutique || '',
    stamps: Number(data.stamps) || 0,
    newBalance,
    type,
    rewardTitle: data.rewardTitle,
  });
}

/** Background time past which the app catches up on live data when it comes back. */
const FOREGROUND_REFRESH_AFTER_MS = 5 * 60 * 1000;
/**
 * The socket is closed in background and reconnects on resume, and its
 * reconnection already refetches the live data (useRealtimeEvents). Give it
 * this long before catching up over HTTP instead.
 */
const SOCKET_CATCH_UP_GRACE_MS = 5_000;

/**
 * Catch up on live data when the app returns to foreground after more than
 * 5 minutes in background (quick app switches, e.g. phone calls, refetch
 * nothing). Only when the WebSocket did not come back: its reconnection
 * already did the same refetch.
 */
export function useAppForegroundRefresh() {
  const queryClient = useQueryClient();
  const appState = useRef(AppState.currentState);
  const backgroundSince = useRef<number>(Date.now());

  useEffect(() => {
    let catchUpTimer: ReturnType<typeof setTimeout> | null = null;
    const clearCatchUp = () => {
      if (catchUpTimer) clearTimeout(catchUpTimer);
      catchUpTimer = null;
    };
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState.match(/inactive|background/)) {
        backgroundSince.current = Date.now();
        // Left again before the grace ended: the next resume decides.
        if (nextState === 'background') clearCatchUp();
      }
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active' &&
        Date.now() - backgroundSince.current > FOREGROUND_REFRESH_AFTER_MS
      ) {
        clearCatchUp();
        catchUpTimer = setTimeout(() => {
          catchUpTimer = null;
          if (!useWsStore.getState().connected) invalidateLiveData(queryClient);
        }, SOCKET_CATCH_UP_GRACE_MS);
      }
      appState.current = nextState;
    });

    return () => {
      clearCatchUp();
      subscription.remove();
    };
  }, [queryClient]);
}
