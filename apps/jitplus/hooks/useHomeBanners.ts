import { useState, useCallback, useRef, useEffect } from 'react';
import { Animated, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { ClientNotification } from '@/types';
import {
  BANNER_ANIM_DURATION_MS, WELCOME_BANNER_VISIBLE_MS,
  REWARD_BANNER_VISIBLE_MS, FRESH_REWARD_WINDOW_MS,
} from '@/constants';

const WELCOME_FLAG_KEY = 'showWelcome';
const WELCOME_FLAG_NEW = 'new';
const WELCOME_FLAG_BACK = '1';

/**
 * Asks the home screen to greet the client once: new account, or welcome back.
 * Never rejects: callers await it right before leaving the sign-in screens, and
 * a storage failure (full disk) must not keep a signed-in client stuck there.
 */
export function flagHomeWelcome(kind: 'new' | 'back'): Promise<void> {
  return AsyncStorage.setItem(WELCOME_FLAG_KEY, kind === 'new' ? WELCOME_FLAG_NEW : WELCOME_FLAG_BACK)
    .catch(() => { /* only the greeting banner is lost */ });
}

export function useHomeBanners(
  notifData: { pages: { notifications?: ClientNotification[] }[] } | undefined,
  luckyWheelTickets: unknown[],
) {
  // ── Welcome banner ──
  const [welcomeKind, setWelcomeKind] = useState<'back' | 'new' | null>(null);
  const welcomeAnim = useRef(new Animated.Value(0)).current;

  // ── LuckyWheel modal ──
  const [showLuckyWheel, setShowLuckyWheel] = useState(false);

  // ── LuckyWheel FAB animations ──
  const luckyWheelSpinAnim = useRef(new Animated.Value(0)).current;

  // ── Reward notification banner ──
  const [rewardBannerNotif, setRewardBannerNotif] = useState<ClientNotification | null>(null);
  const rewardBannerAnim = useRef(new Animated.Value(0)).current;
  const shownRewardIdsRef = useRef(new Set<string>());

  // ── LuckyWheel FAB: one turn when tickets become available ──
  // A single spin says "a ticket is waiting"; an endless loop would read as decoration.
  useEffect(() => {
    luckyWheelSpinAnim.setValue(0);
    if (luckyWheelTickets.length === 0) return;
    const spin = Animated.timing(luckyWheelSpinAnim, {
      toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    spin.start();
    return () => { spin.stop(); };
  }, [luckyWheelTickets.length, luckyWheelSpinAnim]);

  // ── Welcome banner on focus ──
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(WELCOME_FLAG_KEY).then((val) => {
        if (val !== WELCOME_FLAG_BACK && val !== WELCOME_FLAG_NEW) return;
        AsyncStorage.removeItem(WELCOME_FLAG_KEY).catch(() => {});
        setWelcomeKind(val === WELCOME_FLAG_NEW ? 'new' : 'back');
        welcomeAnim.setValue(0);
        Animated.sequence([
          Animated.timing(welcomeAnim, { toValue: 1, duration: BANNER_ANIM_DURATION_MS, useNativeDriver: true }),
          Animated.delay(WELCOME_BANNER_VISIBLE_MS),
          Animated.timing(welcomeAnim, { toValue: 0, duration: BANNER_ANIM_DURATION_MS, useNativeDriver: true }),
        ]).start(() => setWelcomeKind(null));
      }).catch(() => {});
    }, [welcomeAnim])
  );

  // ── Reward notification banner on focus ──
  useFocusEffect(
    useCallback(() => {
      const notifications = notifData?.pages[0]?.notifications ?? [];
      const freshReward = notifications.find(
        (n) => {
          if (n.type !== 'reward' || n.isRead || shownRewardIdsRef.current.has(n.id)) return false;
          const ts = new Date(n.createdAt).getTime();
          return !isNaN(ts) && Date.now() - ts < FRESH_REWARD_WINDOW_MS;
        },
      );
      if (!freshReward) return;
      shownRewardIdsRef.current.add(freshReward.id);
      setRewardBannerNotif(freshReward);
      rewardBannerAnim.setValue(0);
      Animated.sequence([
        Animated.timing(rewardBannerAnim, { toValue: 1, duration: BANNER_ANIM_DURATION_MS, useNativeDriver: true }),
        Animated.delay(REWARD_BANNER_VISIBLE_MS),
        Animated.timing(rewardBannerAnim, { toValue: 0, duration: BANNER_ANIM_DURATION_MS, useNativeDriver: true }),
      // An interrupted run (a newer reward restarted the banner) must not hide the new one.
      ]).start(({ finished }) => { if (finished) setRewardBannerNotif(null); });
    }, [notifData, rewardBannerAnim])
  );

  return {
    welcomeKind,
    welcomeAnim,
    showLuckyWheel,
    setShowLuckyWheel,
    luckyWheelSpinAnim,
    rewardBannerNotif,
    setRewardBannerNotif,
    rewardBannerAnim,
  };
}
