import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import type { WheelSegment } from '@jitplus/shared/src/luckyWheel';
import { font } from '@/constants/design';
import { GAME_GOLD } from '@/components/games/GameStage';

const LABEL_MIN_SIZE = 160;

interface Props {
  size: number;
  segments: WheelSegment[];
}

/** Static wheel drawing (rim, slices, hub and labels); rotate it from the outside. */
export const WheelFace = React.memo(function WheelFace({ size, segments }: Props) {
  const cx = size / 2;
  const outerR = size / 2 - 1;
  const r = outerR - size * 0.04;
  const count = Math.max(1, segments.length);
  const angle = (2 * Math.PI) / count;
  const showLabels = size >= LABEL_MIN_SIZE && segments.length > 0;
  const labelFS = Math.max(8, Math.min(size * 0.04, 12));
  const textR = r * 0.6;

  const slices = useMemo(() => segments.map((seg, i) => {
    const a0 = i * angle - Math.PI / 2;
    const a1 = a0 + angle;
    const d = count === 1
      ? `M${cx - r},${cx} A${r},${r} 0 1 1 ${cx + r},${cx} A${r},${r} 0 1 1 ${cx - r},${cx} Z`
      : `M${cx},${cx} L${cx + r * Math.cos(a0)},${cx + r * Math.sin(a0)} A${r},${r} 0 ${angle > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a1)},${cx + r * Math.sin(a1)} Z`;
    return <Path key={`s${i}`} d={d} fill={seg.color} />;
  }), [segments, angle, count, cx, r]);

  const dividers = useMemo(() => (count > 1 ? segments.map((_, i) => {
    const a = i * angle - Math.PI / 2;
    return (
      <Line
        key={`d${i}`}
        x1={cx}
        y1={cx}
        x2={cx + r * Math.cos(a)}
        y2={cx + r * Math.sin(a)}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={Math.max(1, size * 0.006)}
      />
    );
  }) : null), [segments, angle, count, cx, r, size]);

  // RN <Text> overlays rather than SVG text: correct Arabic shaping.
  const labels = useMemo(() => {
    if (!showLabels) return null;
    const maxChars = Math.max(4, Math.floor((r * 0.42) / (labelFS * 0.52)));
    return segments.map((seg, i) => {
      const mid = i * angle - Math.PI / 2 + angle / 2;
      let rot = (mid * 180) / Math.PI + 90;
      if (rot > 180) rot -= 360;
      if (rot > 90 || rot < -90) rot += 180;
      const label = seg.label.length > maxChars ? `${seg.label.slice(0, maxChars - 1)}…` : seg.label;
      const w = labelFS * Math.max(3, label.length) * 0.65;
      const h = labelFS * 1.4;
      return (
        <Text
          key={`t${i}`}
          numberOfLines={1}
          allowFontScaling={false}
          style={[
            styles.label,
            {
              left: cx + textR * Math.cos(mid) - w / 2,
              top: cx + textR * Math.sin(mid) - h / 2,
              width: w,
              height: h,
              lineHeight: h,
              fontSize: labelFS,
              transform: [{ rotate: `${rot}deg` }],
            },
          ]}
        >
          {label}
        </Text>
      );
    });
  }, [showLabels, segments, angle, cx, textR, r, labelFS]);

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="wfHub" cx="50%" cy="45%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" />
            <Stop offset="100%" stopColor="#E2E8F0" />
          </RadialGradient>
          <RadialGradient id="wfHubRing" cx="50%" cy="40%" r="55%">
            <Stop offset="0%" stopColor={GAME_GOLD.light} />
            <Stop offset="100%" stopColor={GAME_GOLD.dark} />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cx} r={outerR} fill={GAME_GOLD.dark} />
        <Circle cx={cx} cy={cx} r={outerR - size * 0.008} fill={GAME_GOLD.base} />
        <Circle cx={cx} cy={cx} r={r + size * 0.005} fill={GAME_GOLD.dark} />
        <G>{slices}</G>
        <G>{dividers}</G>
        <Circle cx={cx} cy={cx} r={size * 0.14} fill="url(#wfHubRing)" />
        <Circle cx={cx} cy={cx} r={size * 0.09} fill="url(#wfHub)" />
      </Svg>
      {labels}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { position: 'absolute', color: '#FFFFFF', textAlign: 'center', fontFamily: font.bold },
});
