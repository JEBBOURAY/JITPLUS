// Zellige backdrop for the login screen. The pattern uses the same tile, radius and
// stroke as SplashAnimated, so when the splash fades its zellige the login one is
// already in place underneath and the hand-off reads as one surface.
import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';
import { palette } from '@/contexts/ThemeContext';
import { khatamPath, zelligePath } from '@/utils/khatam';

const ZELLIGE_TILE = 72;
const ZELLIGE_R = 24;
const FRIEZE_H = 22;
const FRIEZE_STEP = 26;
const FRIEZE_R = 6;

export default React.memo(function LoginBackdrop({ dark }: { dark: boolean }) {
  const { width, height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();

  const zelligeD = useMemo(() => zelligePath(width, height, ZELLIGE_TILE, ZELLIGE_R), [width, height]);
  const friezeD = useMemo(() => {
    let d = '';
    const count = Math.ceil(width / FRIEZE_STEP) + 1;
    const offset = (width - (count - 1) * FRIEZE_STEP) / 2;
    for (let i = 0; i < count; i++) d += khatamPath(offset + i * FRIEZE_STEP, FRIEZE_H / 2, FRIEZE_R);
    return d;
  }, [width]);

  const brass = dark ? palette.gold : palette.goldDeep;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Path
          d={zelligeD}
          fill="none"
          stroke={dark ? palette.violetLight : palette.violet}
          strokeOpacity={dark ? 0.07 : 0.06}
          strokeWidth={1}
        />
      </Svg>

      {/* Shopfront frieze along the bottom edge. */}
      <View style={[styles.frieze, { bottom: bottom + 6, opacity: dark ? 0.32 : 0.38 }]}>
        <Svg width={width} height={FRIEZE_H}>
          <Line x1={0} y1={1} x2={width} y2={1} stroke={brass} strokeWidth={1} />
          <Path d={friezeD} fill="none" stroke={brass} strokeWidth={1} strokeLinejoin="round" />
          <Line x1={0} y1={FRIEZE_H - 1} x2={width} y2={FRIEZE_H - 1} stroke={brass} strokeWidth={1} />
        </Svg>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frieze: { position: 'absolute', left: 0, right: 0, height: FRIEZE_H },
});
