import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Path, Circle, Line, Defs, RadialGradient, Stop, Polygon } from 'react-native-svg';
import { palette } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';

const DEFAULT_COLORS = [
  palette.violet,
  palette.gold,
  '#EF4444',
  '#10B981',
  palette.violet,
  palette.gold,
  '#EF4444',
  '#10B981',
];

export interface WheelSegment {
  label: string;
  color: string;
}

interface Props {
  size?: number;
  segments?: WheelSegment[];
}

export default React.memo(function LuckyWheelIcon({ size = 28, segments }: Props) {
  const fonts = useAppFonts();
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 1;
  const rimWidth = size * 0.04;
  const r = outerR - rimWidth;
  const items = segments ?? DEFAULT_COLORS.map((c) => ({ label: '', color: c }));
  const count = items.length;
  const angle = (2 * Math.PI) / count;
  const showLabels = !!segments && size >= 100;
  const labelFS = Math.max(7, Math.min(size * 0.038, 12));
  const textR = r * 0.58;
  const hubR = size * 0.14;
  const hubInnerR = size * 0.09;

  // Segment slices (memoized to avoid trig recalculation on every render)
  const slices = useMemo(() => items.map((seg, i) => {
    const startAngle = i * angle - Math.PI / 2;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
    return <Path key={`s${i}`} d={d} fill={seg.color} />;
  }), [items, angle, cx, cy, r]);

  // Divider lines between segments
  const dividers = useMemo(() => items.map((_, i) => {
    const a = i * angle - Math.PI / 2;
    return (
      <Line
        key={`d${i}`}
        x1={cx}
        y1={cy}
        x2={cx + r * Math.cos(a)}
        y2={cy + r * Math.sin(a)}
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={size * 0.006}
      />
    );
  }), [items, angle, cx, cy, r, size]);

  // Labels — use React Native <Text> for proper Arabic shaping
  const labelData = useMemo(() => showLabels
    ? items.map((seg, i) => {
        const midAngle = i * angle - Math.PI / 2 + angle / 2;
        const tx = cx + textR * Math.cos(midAngle);
        const ty = cy + textR * Math.sin(midAngle);
        let rotDeg = (midAngle * 180) / Math.PI + 90;
        if (rotDeg > 180) rotDeg -= 360;
        if (rotDeg > 90 || rotDeg < -90) rotDeg += 180;
        const maxChars = Math.floor((r * 0.42) / (labelFS * 0.52));
        const label =
          seg.label.length > maxChars
            ? seg.label.slice(0, maxChars - 1) + '\u2026'
            : seg.label;
        return { key: `t${i}`, tx, ty, rotDeg, label };
      })
    : null, [showLabels, items, angle, cx, cy, textR, r, labelFS]);

  // Pointer triangle at top
  const ptrW = size * 0.07;
  const ptrH = size * 0.1;
  const ptrPoints = useMemo(
    () => `${cx},${rimWidth * 0.5 + ptrH} ${cx - ptrW},${rimWidth * 0.3} ${cx + ptrW},${rimWidth * 0.3}`,
    [cx, rimWidth, ptrH, ptrW],
  );

  return (
    <View style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityRole="image">
      <Defs>
        <RadialGradient id="hubGrad" cx="50%" cy="45%" r="50%">
          <Stop offset="0%" stopColor="#FFF" />
          <Stop offset="100%" stopColor="#E2E8F0" />
        </RadialGradient>
        <RadialGradient id="hubRingGrad" cx="50%" cy="40%" r="55%">
          <Stop offset="0%" stopColor={palette.goldLight} />
          <Stop offset="100%" stopColor={palette.goldDark} />
        </RadialGradient>
      </Defs>

      {/* Outer gold rim */}
      <Circle cx={cx} cy={cy} r={outerR} fill={palette.goldDark} />
      <Circle cx={cx} cy={cy} r={outerR - size * 0.008} fill={palette.gold} />
      <Circle cx={cx} cy={cy} r={r + size * 0.005} fill={palette.goldDark} />

      {/* Segments */}
      <G>{slices}</G>
      <G>{dividers}</G>

      {/* Center hub — layered for depth */}
      <Circle cx={cx} cy={cy} r={hubR} fill="url(#hubRingGrad)" />
      <Circle cx={cx} cy={cy} r={hubInnerR} fill="url(#hubGrad)" />

      {/* Pointer notch (gold triangle) */}
      <Polygon points={ptrPoints} fill={palette.gold} stroke={palette.goldDark} strokeWidth={size * 0.008} />
    </Svg>
    {/* Labels as RN Text overlays — proper Arabic text shaping */}
    {labelData?.map((l) => {
      const labelW = labelFS * l.label.length * 0.65;
      const labelH = labelFS * 1.4;
      return (
        <Text
          key={l.key}
          numberOfLines={1}
          style={[
            wheelLabelStyle.base,
            {
              left: l.tx - labelW / 2,
              top: l.ty - labelH / 2,
              width: labelW,
              height: labelH,
              lineHeight: labelH,
              fontSize: labelFS,
              fontFamily: fonts.bold,
              transform: [{ rotate: `${l.rotDeg}deg` }],
            },
          ]}
        >
          {l.label}
        </Text>
      );
    })}
    </View>
  );
});

const wheelLabelStyle = StyleSheet.create({
  base: {
    position: 'absolute',
    color: '#FFF',
    fontWeight: '700',
    textAlign: 'center',
  },
});
