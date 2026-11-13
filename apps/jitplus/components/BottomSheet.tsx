import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation, cancelAnimation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle,
  useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';
import { SPRING_MOMENTUM, SPRING_SMOOTH, project, rubberband, spring } from '@/utils/motion';
import { hp, ms } from '@/utils/responsive';

const SCREEN_HEIGHT = Dimensions.get('window').height;
/** The exit spring aims a bit past the sheet's height; the sheet unmounts once it is fully off screen. */
const EXIT_OVERSHOOT = 48;
/** Movement before a drag commits, so taps on the sheet's buttons still go through. */
const DRAG_HYSTERESIS = 10;
const FADE_MS = 200;

interface Props {
  visible: boolean;
  /** Asks the parent to close (backdrop tap, back button, drag down). The parent then sets `visible` to false. */
  onClose: () => void;
  /** Runs once the exit animation has finished and the sheet is gone. */
  onExited?: () => void;
  /** Draggable area under the handle. When `scrollable` is set, only this area (and the handle) drags the sheet. */
  header?: ReactNode;
  children?: ReactNode;
  /** The body holds a ScrollView: let it scroll instead of dragging the sheet. */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
  backdropColor?: string;
  backdropLabel?: string;
  /** Decoration drawn over the backdrop, behind the sheet (e.g. confetti). Not touchable. */
  backdropContent?: ReactNode;
  /** Render inside the current screen or modal instead of opening a new Modal. */
  inline?: boolean;
}

/**
 * Modal bottom sheet that follows the finger 1:1. It rises from the bottom and leaves the
 * same way, can be grabbed mid-animation, resists when pulled up, and on release lands
 * where the flick was heading, continuing at the finger's speed.
 * With Reduce Motion on, it cross-fades instead of sliding.
 */
function BottomSheet({
  visible, onClose, onExited, header, children, scrollable, style, handleStyle,
  backdropColor = 'rgba(15,23,42,0.45)', backdropLabel, backdropContent, inline,
}: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // Stays true through the exit animation, after the parent has set `visible` to false.
  const [mounted, setMounted] = useState(visible);

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const fade = useSharedValue(reduceMotion ? 0 : 1);
  const sheetHeight = useSharedValue(SCREEN_HEIGHT);
  const exiting = useSharedValue(false);
  const dragStart = useSharedValue(0);
  const exitingRef = useRef(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  const finishExit = useCallback(() => {
    if (!exitingRef.current) return;
    exitingRef.current = false;
    setMounted(false);
    onExitedRef.current?.();
  }, []);

  const startExit = useCallback((velocity = 0) => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    exiting.value = true;
    if (reduceMotion) {
      fade.value = withTiming(0, { duration: FADE_MS }, (done) => { if (done) runOnJS(finishExit)(); });
      return;
    }
    const { response, dampingRatio } = SPRING_SMOOTH;
    translateY.value = withSpring(sheetHeight.value + EXIT_OVERSHOOT, spring(response, dampingRatio, velocity));
  }, [reduceMotion, exiting, fade, translateY, sheetHeight, finishExit]);

  // Unmount as soon as the sheet has left the screen instead of waiting for the spring to settle.
  useAnimatedReaction(
    () => exiting.value && translateY.value >= sheetHeight.value,
    (gone, wasGone) => { if (gone && !wasGone) runOnJS(finishExit)(); },
  );

  useEffect(() => {
    if (visible) {
      exitingRef.current = false;
      exiting.value = false;
      setMounted(true);
      cancelAnimation(translateY);
      if (reduceMotion) {
        translateY.value = 0;
        fade.value = withTiming(1, { duration: FADE_MS });
      } else {
        fade.value = 1;
        // Starts from wherever the sheet is (off screen, or mid-exit if reopened quickly).
        const { response, dampingRatio } = SPRING_SMOOTH;
        translateY.value = withSpring(0, spring(response, dampingRatio));
      }
    } else if (mounted) {
      startExit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const requestClose = useCallback(() => {
    if (!exitingRef.current) onCloseRef.current();
  }, []);

  const dragDismiss = useCallback((velocity: number) => {
    startExit(velocity);
    onCloseRef.current();
  }, [startExit]);

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetY([-DRAG_HYSTERESIS, DRAG_HYSTERESIS])
    .failOffsetX([-DRAG_HYSTERESIS * 2, DRAG_HYSTERESIS * 2])
    .onStart(() => {
      if (exiting.value) return;
      // Grab the sheet where it is on screen, even mid-animation.
      cancelAnimation(translateY);
      dragStart.value = translateY.value;
    })
    .onUpdate((e) => {
      if (exiting.value) return;
      const raw = dragStart.value + e.translationY;
      translateY.value = raw < 0 ? rubberband(raw, sheetHeight.value) : raw;
    })
    .onEnd((e) => {
      if (exiting.value) return;
      const v = e.velocityY;
      // Decide from where the flick would land, not from where the finger let go.
      const landing = translateY.value + project(v);
      if (landing > sheetHeight.value / 2) {
        runOnJS(dragDismiss)(v);
      } else {
        const { response, dampingRatio } = SPRING_MOMENTUM;
        translateY.value = withSpring(0, spring(response, dampingRatio, v));
      }
    }),
  [exiting, translateY, dragStart, sheetHeight, dragDismiss]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: fade.value,
  }));
  // The backdrop lightens continuously as the sheet is dragged down.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: fade.value * interpolate(translateY.value, [0, sheetHeight.value], [1, 0], Extrapolation.CLAMP),
  }));

  if (!mounted) return null;

  const handle = <View style={[styles.handle, { backgroundColor: theme.border }, handleStyle]} />;

  const sheet = (
    <Animated.View
      style={[styles.sheet, { backgroundColor: theme.bgCard }, style, sheetStyle]}
      onLayout={(e) => { sheetHeight.value = e.nativeEvent.layout.height; }}
      accessibilityViewIsModal
    >
      {scrollable ? (
        <>
          <GestureDetector gesture={pan}>
            <View>{handle}{header}</View>
          </GestureDetector>
          {children}
        </>
      ) : (
        <>{handle}{header}{children}</>
      )}
    </Animated.View>
  );

  const content = (
    <GestureHandlerRootView style={inline ? styles.inlineRoot : styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityRole="button" accessibilityLabel={backdropLabel} />
        {backdropContent && <View style={StyleSheet.absoluteFill} pointerEvents="none">{backdropContent}</View>}
      </Animated.View>
      {scrollable ? sheet : <GestureDetector gesture={pan}>{sheet}</GestureDetector>}
    </GestureHandlerRootView>
  );

  if (inline) return content;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  inlineRoot: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', zIndex: 20 },
  sheet: {
    borderTopLeftRadius: ms(26),
    borderTopRightRadius: ms(26),
    paddingTop: hp(10),
  },
  handle: { alignSelf: 'center', width: ms(40), height: 4, borderRadius: 2, marginBottom: hp(14) },
});

export default memo(BottomSheet);
