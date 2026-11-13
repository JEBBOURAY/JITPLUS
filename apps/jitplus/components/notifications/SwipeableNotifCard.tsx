import React, { useCallback, useMemo, useRef } from 'react';
import { Dimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, Extrapolation, cancelAnimation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle,
  useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { Text } from '@/components/AppText';
import { Trash2 } from 'lucide-react-native';
import { ms } from '@/utils/responsive';
import { haptic, HapticStyle } from '@/utils/haptics';
import { SPRING_MOMENTUM, SPRING_SMOOTH, project, spring } from '@/utils/motion';
import { notificationStyles as styles } from './notificationStyles';
import { SWIPE_THRESHOLD_RATIO, PAN_MIN_DX, ROW_COLLAPSE_DURATION_MS } from '@/constants';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * SWIPE_THRESHOLD_RATIO;
/** The fling-off spring aims past the edge; the row collapses as soon as the card has left the screen. */
const FLING_TARGET = SCREEN_WIDTH * 1.25;

interface SwipeableNotifCardProps {
  onDismiss: () => void;
  children: React.ReactNode;
  deleteLabel: string;
  fontFamily?: string;
}

/**
 * Swipe left or right to dismiss. The card follows the finger 1:1 and, on release, goes where
 * the flick was heading at the finger's speed — a quick flick dismisses, a flick back cancels.
 * Screen-reader users get the same action via the card's accessibilityActions.
 */
const SwipeableNotifCard = React.memo(function SwipeableNotifCard({
  onDismiss, children, deleteLabel, fontFamily,
}: SwipeableNotifCardProps) {
  const translateX = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const pastThreshold = useSharedValue(false);
  const flinging = useSharedValue(false);
  const rowHeight = useSharedValue(0);
  const collapse = useSharedValue(1);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const callDismiss = useCallback(() => onDismissRef.current(), []);
  const tick = useCallback(() => haptic(HapticStyle.Light), []);
  const commit = useCallback(() => haptic(HapticStyle.Medium), []);

  // Once the card is off screen, close the gap it leaves in the list.
  useAnimatedReaction(
    () => flinging.value && Math.abs(translateX.value) >= SCREEN_WIDTH,
    (gone, wasGone) => {
      if (!gone || wasGone) return;
      collapse.value = withTiming(0, { duration: ROW_COLLAPSE_DURATION_MS, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) runOnJS(callDismiss)();
      });
    },
  );

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetX([-PAN_MIN_DX, PAN_MIN_DX])
    .failOffsetY([-PAN_MIN_DX, PAN_MIN_DX])
    .onStart(() => {
      if (flinging.value) return;
      // Picks the card up where it is, even while it is still springing back.
      cancelAnimation(translateX);
      dragStart.value = translateX.value;
    })
    .onUpdate((e) => {
      if (flinging.value) return;
      translateX.value = dragStart.value + e.translationX;
      const past = Math.abs(translateX.value) > SWIPE_THRESHOLD;
      if (past !== pastThreshold.value) {
        pastThreshold.value = past;
        if (past) runOnJS(tick)();
      }
    })
    .onEnd((e) => {
      if (flinging.value) return;
      const v = e.velocityX;
      // Where the card would come to rest if thrown: a flick back towards the start cancels.
      const landing = translateX.value + project(v);
      pastThreshold.value = false;
      if (Math.abs(landing) > SWIPE_THRESHOLD) {
        flinging.value = true;
        runOnJS(commit)();
        const { response, dampingRatio } = SPRING_SMOOTH;
        translateX.value = withSpring(Math.sign(landing) * FLING_TARGET, spring(response, dampingRatio, v));
      } else {
        const { response, dampingRatio } = SPRING_MOMENTUM;
        translateX.value = withSpring(0, spring(response, dampingRatio, v));
      }
    }),
  [translateX, dragStart, pastThreshold, flinging, tick, commit]);

  const rowStyle = useAnimatedStyle(() => (
    collapse.value < 1 && rowHeight.value > 0
      ? { height: rowHeight.value * collapse.value, opacity: collapse.value }
      : {}
  ));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: interpolate(
      translateX.value,
      [-SCREEN_WIDTH, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, SCREEN_WIDTH],
      [0.3, 0.9, 1, 0.9, 0.3],
      Extrapolation.CLAMP,
    ),
  }));
  const bgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -12, 0, 12, SWIPE_THRESHOLD],
      [1, 0.55, 0, 0.55, 1],
      Extrapolation.CLAMP,
    ),
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{
      scale: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD], [1.1, 0.7, 1.1], Extrapolation.CLAMP),
    }],
  }));

  const action = (
    <Animated.View style={[styles.swipeAction, iconStyle]}>
      <Trash2 size={ms(20)} color="#fff" strokeWidth={2} />
      <Text style={[styles.swipeActionText, { fontFamily }]} numberOfLines={1}>{deleteLabel}</Text>
    </Animated.View>
  );

  return (
    <Animated.View
      style={[{ overflow: 'hidden' }, rowStyle]}
      onLayout={(e) => { if (collapse.value === 1) rowHeight.value = e.nativeEvent.layout.height; }}
    >
      <View style={styles.cardRow}>
        <Animated.View style={[styles.swipeBackground, bgStyle]} pointerEvents="none">
          {action}
          {action}
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={cardStyle}>
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
});

export default SwipeableNotifCard;
