import React, { useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { palette } from '@/contexts/ThemeContext';
import { khatamPath } from '@/utils/khatam';
import { ms, wp, hp, fontSize } from '@/utils/responsive';
import { font } from '@/constants/design';

const STAR = 10;
const STAR_D = khatamPath(STAR / 2, STAR / 2, STAR / 2);

/** "— ✦ or ✦ —" with brass khatams that twinkle once (`twinkle` 0 → 1 → 0). */
export default React.memo(function KhatamDivider({ label, lineColor, textColor, dark, twinkle }: {
  label: string;
  lineColor: string;
  textColor: string;
  dark: boolean;
  twinkle: Animated.Value;
}) {
  const size = ms(STAR);
  const starStyle = useMemo(() => ({
    width: size,
    height: size,
    transform: [
      { scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) },
      { rotate: twinkle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) },
    ],
  }), [twinkle, size]);
  const star = (
    <Svg width={size} height={size} viewBox={`0 0 ${STAR} ${STAR}`}>
      <Path d={STAR_D} fill={dark ? palette.gold : palette.goldDeep} />
    </Svg>
  );

  return (
    <View style={styles.row}>
      <View style={[styles.line, { backgroundColor: lineColor }]} />
      <Animated.View style={starStyle}>{star}</Animated.View>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
      <Animated.View style={starStyle}>{star}</Animated.View>
      <View style={[styles.line, { backgroundColor: lineColor }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    marginVertical: hp(16),
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  text: {
    fontSize: fontSize.xs,
    fontFamily: font.medium,
    marginHorizontal: wp(2),
  },
});
