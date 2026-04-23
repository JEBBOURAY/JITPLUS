import { useState, useCallback, useRef, useEffect } from 'react';
import { Animated, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { ClientNotification } from '@/types';
import {
  BANNER_ANIM_DURATION_MS, WELCOME_BANNER_VISIBLE_MS,
  REWARD_BANNER_VISIBLE_MS, FRESH_REWARD_WINDOW_MS,
} from '@/constants';

export function useHomeBanners(
  client: { prenom?: string | null } | null,
  notifData: { pages: Array<{ notifications?: ClientNotification[] }> } | undefined,
  luckyWheelTickets: unknown[],
) {
  // ── Welcome banner ──
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeAnim = useRef(new Animated.Value(0)).current;

  // ── Referral popup ──
  const [showReferral, setShowReferral] = useState(false);

  // ── LuckyWheel modal ──
  const [showLuckyWheel, setShowLuckyWheel] = useState(false);

  // ── LuckyWheel FAB animations ──
  const luckyWheelSpinAnim = useRef(new Animated.Value(0)).current;
  const luckyWheelPulseAnim = useRef(new Animated.Value(1)).current;

  // ── Reward notification banner ──
  const [rewardBannerNotif, setRewardBannerNotif] = useState<ClientNotification | null>(null);
  const rewardBannerAnim = useRef(new Animated.Value(0)).current;
  const shownRewardIdsRef = useRef(new Set<string>());

  // ── LuckyWheel FAB: periodic spin + pulse when tickets are available ──
  // Rotation runs for 1 turn then pauses ~4s to save battery on long idle sessions.
  useEffect(() => {
    if (luckyWheelTickets.length > 0) {
      const spin = Animated.loop(
        Animated.sequence([
          Animated.timing(luckyWheelSpinAnim, {
            toValue: 1, duration: 1400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
          }),
          Animated.timing(luckyWheelSpinAnim, {
            toValue: 0, duration: 0, useNativeDriver: true,
          }),
          Animated.delay(4000),
        ]),
      );
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(luckyWheelPulseAnim, {
            toValue: 1.12, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(luckyWheelPulseAnim, {
            toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ]),
      );
      spin.start();
      pulse.start();
      return () => { spin.stop(); pulse.stop(); };
    } else {
      luckyWheelSpinAnim.setValue(0);
      luckyWheelPulseAnim.setValue(1);
    }
  }, [luckyWheelTickets.length, luckyWheelSpinAnim, luckyWheelPulseAnim]);

  // ── Welcome banner on focus ──
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('showWelcome').then((val) => {
        if (val === '1') {
          AsyncStorage.removeItem('showWelcome');
          setShowWelcome(true);
          Animated.sequence([
            Animated.timing(welcomeAnim, { toValue: 1, duration: BANNER_ANIM_DURATION_MS, useNativeDriver: true }),
            Animated.delay(WELCOME_BANNER_VISIBLE_MS),
            Animated.timing(welcomeAnim, { toValue: 0, duration: BANNER_ANIM_DURATION_MS, useNativeDriver: true }),
          ]).start(() => setShowWelcome(false));
        }
      });
    }, [welcomeAnim])
  );

  // ── Referral popup — show once every 3 days ──
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout>;
      (async () => {
        const lastShown = await AsyncStorage.getItem('@jitplus_referral_ts');
        const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
        if (lastShown && Date.now() - Number(lastShown) < THREE_DAYS) return;
        timer = setTimeout(() => setShowReferral(true), 4000);
      })();
      return () => { if (timer) clearTimeout(timer); };
    }, [])
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
      ]).start(() => { setRewardBannerNotif(null); });
    }, [notifData, rewardBannerAnim])
  );

  const dismissReferral = useCallback(async () => {
    setShowReferral(false);
    await AsyncStorage.setItem('@jitplus_referral_ts', String(Date.now()));
  }, []);

  return {
    showWelcome,
    welcomeAnim,
    showReferral,
    showLuckyWheel,
    setShowLuckyWheel,
    luckyWheelSpinAnim,
    luckyWheelPulseAnim,
    rewardBannerNotif,
    setRewardBannerNotif,
    rewardBannerAnim,
    dismissReferral,
  };
}
