import React, { useRef } from 'react';
import { Animated, PanResponder, Dimensions, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Trash2 } from 'lucide-react-native';
import { ms } from '@/utils/responsive';
import { haptic, HapticStyle } from '@/utils/haptics';
import { notificationStyles as styles } from './notificationStyles';
import {
  SWIPE_THRESHOLD_RATIO, PAN_MIN_DX, SWIPE_DISMISS_DURATION_MS,
  ROW_COLLAPSE_DURATION_MS, SPRING_BOUNCINESS,
} from '@/constants';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * SWIPE_THRESHOLD_RATIO;
/** A quick flick dismisses even before reaching the distance threshold. */
const FLICK_VELOCITY = 0.9;
const FLICK_MIN_DX = 48;

interface SwipeableNotifCardProps {
  onDismiss: () => void;
  children: React.ReactNode;
  deleteLabel: string;
  fontFamily?: string;
}

/** Swipe left or right to dismiss. Screen-reader users get the same action via the card's accessibilityActions. */
const SwipeableNotifCard = React.memo(function SwipeableNotifCard({
  onDismiss, children, deleteLabel, fontFamily,
}: SwipeableNotifCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowHeight = useRef(new Animated.Value(1)).current;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const pastThresholdRef = useRef(false);

  const runDismiss = (dx: number) => {
    // Direction follows the finger so the card keeps moving the way it was dragged.
    const toValue = (dx >= 0 ? 1 : -1) * SCREEN_WIDTH;
    haptic(HapticStyle.Medium);
    Animated.timing(translateX, { toValue, duration: SWIPE_DISMISS_DURATION_MS, useNativeDriver: true }).start(() => {
      Animated.timing(rowHeight, { toValue: 0, duration: ROW_COLLAPSE_DURATION_MS, useNativeDriver: false })
        .start(() => onDismissRef.current());
    });
  };

  const springBack = () => {
    pastThresholdRef.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: SPRING_BOUNCINESS }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > PAN_MIN_DX && Math.abs(g.dx) > Math.abs(g.dy * 2),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        translateX.setValue(g.dx);
        const past = Math.abs(g.dx) > SWIPE_THRESHOLD;
        if (past !== pastThresholdRef.current) {
          pastThresholdRef.current = past;
          if (past) haptic(HapticStyle.Light);
        }
      },
      onPanResponderRelease: (_, g) => {
        const isFlick = Math.abs(g.vx) > FLICK_VELOCITY && Math.abs(g.dx) > FLICK_MIN_DX;
        if (Math.abs(g.dx) > SWIPE_THRESHOLD || isFlick) runDismiss(g.dx);
        else springBack();
      },
      onPanResponderTerminate: springBack,
    }),
  ).current;

  const cardOpacity = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, SCREEN_WIDTH],
    outputRange: [0.3, 0.9, 1, 0.9, 0.3],
    extrapolate: 'clamp',
  });
  const bgOpacity = translateX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -12, 0, 12, SWIPE_THRESHOLD],
    outputRange: [1, 0.55, 0, 0.55, 1],
    extrapolate: 'clamp',
  });
  const iconScale = translateX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [1.1, 0.7, 1.1],
    extrapolate: 'clamp',
  });

  const action = (
    <Animated.View style={[styles.swipeAction, { transform: [{ scale: iconScale }] }]}>
      <Trash2 size={ms(20)} color="#fff" strokeWidth={2} />
      <Text style={[styles.swipeActionText, { fontFamily }]} numberOfLines={1}>{deleteLabel}</Text>
    </Animated.View>
  );

  return (
    <Animated.View
      style={{
        maxHeight: rowHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 600] }),
        opacity: rowHeight,
        overflow: 'hidden',
      }}
    >
      <View style={styles.cardRow}>
        <Animated.View style={[styles.swipeBackground, { opacity: bgOpacity }]} pointerEvents="none">
          {action}
          {action}
        </Animated.View>
        <Animated.View style={{ transform: [{ translateX }], opacity: cardOpacity }} {...panResponder.panHandlers}>
          {children}
        </Animated.View>
      </View>
    </Animated.View>
  );
});

export default SwipeableNotifCard;
