import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import Svg, { G, Path, Circle, Line, Defs, RadialGradient, Stop, Polygon } from 'react-native-svg';
import { palette } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { prizeColor, segmentTextColor, type WheelSegment } from '@/utils/luckyWheel';

/** Decorative wheel (home tile): the same violet and gold family as a real campaign. */
const DEFAULT_SEGMENTS: WheelSegment[] = Array.from({ length: 8 }, (_, i) => ({ label: '', color: prizeColor(i % 4) }));

export type { WheelSegment };

interface Props {
  size?: number;
  segments?: WheelSegment[];
  /** The full-screen wheel draws its own fixed pointer outside the rotating layer. */
  showPointer?: boolean;
}

export default React.memo(function LuckyWheelIcon({ size = 28, segments, showPointer = true }: Props) {
  const fonts = useAppFonts();
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 1;
  const rimWidth = size * 0.035;
  const r = outerR - rimWidth;
  const items = segments ?? DEFAULT_SEGMENTS;
  const count = items.length;
  const angle = (2 * Math.PI) / count;
  const hubR = size * 0.12;
  const hubInnerR = size * 0.08;
  const showLabels = !!segments && size >= 100;

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

  const dividers = useMemo(() => items.map((_, i) => {
    const a = i * angle - Math.PI / 2;
    return (
      <Line
        key={`d${i}`}
        x1={cx}
        y1={cy}
        x2={cx + r * Math.cos(a)}
        y2={cy + r * Math.sin(a)}
        stroke="rgba(255,255,255,0.28)"
        strokeWidth={Math.max(1, size * 0.004)}
      />
    );
  }), [items, angle, cx, cy, r, size]);

  // Labels run along the radius (from the hub toward the rim): the long side of
  // a slice, so prize names stay readable instead of being cut after 5 letters.
  const labelData = useMemo(() => {
    if (!showLabels) return null;
    const inner = hubR + size * 0.03;
    const outer = r - size * 0.035;
    const length = outer - inner;
    const mid = (inner + outer) / 2;
    // Font size limited by the slice width at the middle of the label.
    const chord = 2 * mid * Math.sin(angle / 2);
    const maxFont = Math.min(chord * 0.42, size * 0.045);
    // Lost slices stay blank (dark = nothing): the odds list names them once.
    return items.flatMap((seg, i) => {
      if (seg.isLost) return [];
      // Shrink long prize names to fit the radius before cutting them.
      const fontSize = Math.max(8, Math.min(maxFont, length / Math.max(1, seg.label.length * 0.56)));
      const midAngle = i * angle - Math.PI / 2 + angle / 2;
      let rotDeg = (midAngle * 180) / Math.PI;
      // Left half: turn the text over so it never reads upside down.
      if (Math.cos(midAngle) < 0) rotDeg += 180;
      return [{
        key: `t${i}`,
        x: cx + mid * Math.cos(midAngle) - length / 2,
        y: cy + mid * Math.sin(midAngle) - fontSize * 0.7,
        width: length,
        height: fontSize * 1.4,
        fontSize,
        rotDeg,
        label: seg.label,
        color: segmentTextColor(seg.color),
      }];
    });
  }, [showLabels, items, angle, cx, cy, r, hubR, size]);

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
          <RadialGradient id="hubGrad" cx="50%" cy="40%" r="55%">
            <Stop offset="0%" stopColor="#FFFFFF" />
            <Stop offset="100%" stopColor="#EDE9FE" />
          </RadialGradient>
        </Defs>

        {/* Rim: one gold ring and a fine light line inside */}
        <Circle cx={cx} cy={cy} r={outerR} fill={palette.goldDark} />
        <Circle cx={cx} cy={cy} r={r + Math.max(1, size * 0.006)} fill="rgba(255,255,255,0.85)" />

        <G>{slices}</G>
        <G>{dividers}</G>

        {/* Hub */}
        <Circle cx={cx} cy={cy} r={hubR} fill={palette.goldDark} />
        <Circle cx={cx} cy={cy} r={hubInnerR} fill="url(#hubGrad)" />

        {showPointer && (
          <Polygon points={ptrPoints} fill={palette.gold} stroke={palette.goldDark} strokeWidth={size * 0.008} />
        )}
      </Svg>
      {/* Labels as RN Text overlays: proper Arabic shaping */}
      {labelData?.map((l) => (
        <Text
          key={l.key}
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={1}
          style={[
            wheelLabelStyle.base,
            {
              left: l.x,
              top: l.y,
              width: l.width,
              height: l.height,
              lineHeight: l.height,
              fontSize: l.fontSize,
              fontFamily: fonts.semibold,
              color: l.color,
              transform: [{ rotate: `${l.rotDeg}deg` }],
            },
          ]}
        >
          {l.label}
        </Text>
      ))}
    </View>
  );
});

const wheelLabelStyle = StyleSheet.create({
  base: { position: 'absolute', textAlign: 'center' },
});
