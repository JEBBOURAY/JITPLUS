import React, { useRef } from 'react';
import { Animated, PanResponder, Dimensions, View, I18nManager } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { ms } from '@/utils/responsive';
import { notificationStyles as styles } from './notificationStyles';
import {
  SWIPE_THRESHOLD_RATIO, PAN_MIN_DX, SWIPE_DISMISS_DURATION_MS,
  ROW_COLLAPSE_DURATION_MS, SPRING_BOUNCINESS,
} from '@/constants';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * SWIPE_THRESHOLD_RATIO;

interface SwipeableNotifCardProps {
  onDismiss: () => void;
  children: React.ReactNode;
  dismissLabel: string;
}

const SwipeableNotifCard = React.memo(function SwipeableNotifCard({ onDismiss, children, dismissLabel }: SwipeableNotifCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowHeight = useRef(new Animated.Value(1)).current;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > PAN_MIN_DX && Math.abs(gesture.dx) > Math.abs(gesture.dy * 2),
      onPanResponderMove: (_, gesture) => { translateX.setValue(gesture.dx); },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) > SWIPE_THRESHOLD) {
          const direction = I18nManager.isRTL ? -1 : 1;
          const toValue = gesture.dx > 0 ? SCREEN_WIDTH * direction : -SCREEN_WIDTH * direction;
          Animated.timing(translateX, { toValue, duration: SWIPE_DISMISS_DURATION_MS, useNativeDriver: true }).start(() => {
            Animated.timing(rowHeight, { toValue: 0, duration: ROW_COLLAPSE_DURATION_MS, useNativeDriver: false }).start(() => onDismissRef.current());
          });
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: SPRING_BOUNCINESS }).start();
        }
      },
    }),
  ).current;

  const opacity = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, SCREEN_WIDTH],
    outputRange: [0.2, 0.7, 1, 0.7, 0.2],
    extrapolate: 'clamp',
  });
  const swipeBgOpacity = translateX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -20, 0, 20, SWIPE_THRESHOLD],
    outputRange: [1, 0.6, 0, 0.6, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={{ maxHeight: rowHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }), opacity: rowHeight, overflow: 'hidden' }}>
      <Animated.View style={[styles.swipeBackground, { opacity: swipeBgOpacity }]}>
        <View style={styles.swipeAction}><Trash2 size={ms(20)} color="#fff" strokeWidth={1.5} /></View>
        <View style={styles.swipeAction}><Trash2 size={ms(20)} color="#fff" strokeWidth={1.5} /></View>
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX }], opacity }}
        accessible accessibilityActions={[{ name: 'dismiss', label: dismissLabel }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'dismiss') onDismissRef.current(); }}
        accessibilityHint={dismissLabel}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
});

export default SwipeableNotifCard;
