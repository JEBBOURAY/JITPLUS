import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, I18nManager, StyleSheet, View } from 'react-native';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';

interface ToggleSwitchProps {
  value: boolean;
  activeColor?: string;
}

const TRACK_W = ms(46);
const TRACK_H = ms(28);
const PAD = ms(3);
const KNOB = TRACK_H - PAD * 2;
const TRAVEL = (TRACK_W - KNOB - PAD * 2) * (I18nManager.isRTL ? -1 : 1);

/**
 * Purely visual switch: the parent row owns the press + accessibility role.
 * Colour and position are driven by a single native-driver value (opacity of an
 * active overlay + knob translate) so toggling never touches the JS thread.
 */
function ToggleSwitch({ value, activeColor = palette.violet }: ToggleSwitchProps) {
  const theme = useTheme();
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [value, progress]);

  const translateX = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }),
    [progress],
  );

  return (
    <View style={[styles.track, { backgroundColor: theme.isDark ? '#334155' : palette.gray200 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.trackActive, { backgroundColor: activeColor, opacity: progress }]} />
      <Animated.View style={[styles.knob, { transform: [{ translateX }] }]} />
    </View>
  );
}

export default memo(ToggleSwitch);

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    padding: PAD,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackActive: { borderRadius: TRACK_H / 2 },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});
