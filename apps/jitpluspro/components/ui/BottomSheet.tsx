import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { dragPosition, shouldDismiss, spring } from '@/utils/sheetPhysics';

const SCREEN_HEIGHT = Dimensions.get('window').height;
/** Vertical travel before a touch becomes a drag, so taps on the content still land. */
const DRAG_SLOP = 10;
const REDUCED_MOTION_FADE_MS = 200;

// Opened or closed by a tap: settles without overshoot.
const SETTLE = spring(1, 0.35);
// Released from a drag: the momentum of the finger earns a slight bounce.
const THROWN = spring(0.8, 0.3);

interface BottomSheetProps {
  visible: boolean;
  /** Asked by a backdrop tap, the Android back button or a downward throw. */
  onClose: () => void;
  /** False while the sheet must stay open: it then resists the drag instead of following it. */
  dismissable?: boolean;
  /**
   * The body holds a ScrollView or FlatList: only the handle and `header` drag the sheet,
   * so the list keeps scrolling (a drag on the whole sheet steals the touch on Android).
   */
  scrollable?: boolean;
  /** Draggable area under the handle (title, subtitle). */
  header?: ReactNode;
  /** Fires once the native modal is gone (iOS refuses to present a picker or alert before). */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Bottom sheet that follows the finger: it can be grabbed mid-animation, thrown
 * away with a flick, and resists at its bounds. The scrim fades with its
 * position. With "reduce motion" on, it cross-fades and does not move.
 */
export default function BottomSheet({
  visible, onClose, dismissable = true, scrollable = false, header, onDismiss, style, children,
}: BottomSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion() === true;

  // Stays mounted after `visible` turns false, for the time of the way out.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  // 0 = open, `height` = fully below the screen.
  const [position] = useState(() => new Animated.Value(SCREEN_HEIGHT));
  const [height, setHeight] = useState(SCREEN_HEIGHT);
  // True once the sheet is measured and parked just below the screen, ready to move.
  const [placed, setPlaced] = useState(false);

  const animateTo = useCallback((toValue: number, velocity = 0, thrown = false, onDone?: () => void) => {
    const animation = reduceMotion
      ? Animated.timing(position, { toValue, duration: REDUCED_MOTION_FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true })
      : Animated.spring(position, {
          toValue,
          velocity,
          ...(thrown ? THROWN : SETTLE),
          // On the way out nothing should swing back into view.
          overshootClamping: toValue !== 0,
          useNativeDriver: true,
        });
    // An interrupted animation (grabbed, or reopened while closing) does not finish.
    animation.start(({ finished }) => { if (finished) onDone?.(); });
  }, [position, reduceMotion]);

  // The first layout gives the distance to travel: the sheet starts from just below the screen.
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.height;
    setHeight(measured);
    if (placed) return;
    position.setValue(measured);
    setPlaced(true);
  }, [position, placed]);

  // Follows `visible` from wherever the sheet is: entering, reopened while closing, or closed
  // before it was even measured.
  useEffect(() => {
    if (!mounted || !placed) return;
    if (visible) {
      animateTo(0);
      return;
    }
    animateTo(height, 0, false, () => {
      setPlaced(false);
      setMounted(false);
    });
  }, [visible, mounted, placed, height, animateTo]);

  const requestClose = useCallback(() => {
    if (dismissable) onClose();
  }, [dismissable, onClose]);

  const panResponder = useMemo(() => {
    // Position when the drag started, and the finger travel already spent on the slop.
    const drag = { start: 0, slop: 0 };
    const dragged = (g: PanResponderGestureState) => drag.start + g.dy - drag.slop;
    const release = (_: unknown, g: PanResponderGestureState) => {
      const velocity = g.vy * 1000;
      if (shouldDismiss(dragged(g), velocity, height, dismissable)) {
        animateTo(height, velocity, true, onClose);
      } else {
        animateTo(0, velocity, true);
      }
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !reduceMotion && Math.abs(g.dy) > DRAG_SLOP && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: (_, g) => {
        drag.start = 0;
        drag.slop = g.dy;
        // Grabbed mid-flight: the drag continues from where the sheet is on screen.
        position.stopAnimation((value) => { drag.start = value; });
      },
      onPanResponderMove: (_, g) => {
        position.setValue(dragPosition(dragged(g), height, dismissable));
      },
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
    });
  }, [position, height, dismissable, reduceMotion, animateTo, onClose]);

  const shown = position.interpolate({ inputRange: [0, height], outputRange: [1, 0], extrapolate: 'clamp' });
  const surface = { backgroundColor: theme.bgCard, borderColor: theme.borderLight };

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={requestClose} onDismiss={onDismiss}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: shown }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel={t('common.close')} />
        <Animated.View
          {...(scrollable ? {} : panResponder.panHandlers)}
          onLayout={handleLayout}
          style={[
            styles.sheet,
            surface,
            { paddingBottom: insets.bottom + 20 },
            style,
            reduceMotion ? { opacity: shown } : { transform: [{ translateY: position }] },
          ]}
          accessibilityViewIsModal
        >
          <View {...(scrollable ? panResponder.panHandlers : {})}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            {header}
          </View>
          {children}
          {/* Fills the gap that opens under the sheet when it is pulled up past its rest position. */}
          <View style={[styles.bleed, { backgroundColor: theme.bgCard }]} pointerEvents="none" />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, marginBottom: 16 },
  bleed: { position: 'absolute', top: '100%', left: 0, right: 0, height: SCREEN_HEIGHT },
});
