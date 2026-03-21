/**
 * BrandName — renders "JitPlus Pro" with a Violet → Cyan gradient.
 *
 * Built with react-native-svg (already in the project) so no extra
 * native dependency is needed.  The gradient id is scoped per-instance
 * via a unique suffix to avoid SVG defs conflicts when multiple copies
 * appear on the same screen.
 */
import React, { useId, useMemo } from 'react';
import { View, ViewStyle } from 'react-native';

import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

const GRAD_FROM = '#7C3AED'; // Violet
const GRAD_TO   = '#1F2937'; // Charbon

interface BrandNameProps {
  /** Text to display, defaults to "JitPlus Pro" */
  label?: string;
  /** Font size (default 26) */
  fontSize?: number;
  /** Font family (default Lexend_800ExtraBold; falls back to bold) */
  fontFamily?: string;
  /** Optional container style */
  style?: ViewStyle;
  /** Solid color override — bypasses the gradient when set */
  color?: string;
}

export default React.memo(function BrandName({
  label     = 'JitPlus Pro',
  fontSize  = 26,
  fontFamily = 'Lexend_800ExtraBold',
  style,
  color,
}: BrandNameProps) {
  // Unique id avoids defs collision when rendered multiple times
  const uid    = useId();
  const gradId = `brandGrad_${uid}`;

  // Memoize dimensions to avoid recalculation on every render
  const { estWidth, svgHeight } = useMemo(() => ({
    estWidth: label.length * fontSize * 0.65 + fontSize * 1.5,
    svgHeight: fontSize * 1.5,
  }), [label, fontSize]);

  return (
    <View
      style={[{ alignSelf: 'center' }, style]}
      accessible
      accessibilityLabel={label}
      accessibilityRole="text"
    >
      <Svg width={estWidth} height={svgHeight}>
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%"   stopColor={GRAD_FROM} stopOpacity="1" />
            <Stop offset="100%" stopColor={GRAD_TO}   stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <SvgText
          fill={color ?? `url(#${gradId})`}
          fontSize={fontSize}
          fontWeight="700"
          fontFamily={fontFamily}
          x={estWidth / 2}
          y={fontSize * 1.15}
          textAnchor="middle"
          // letterSpacing omitted: unreliable / ignored in many RN-SVG versions
        >
          {label}
        </SvgText>
      </Svg>
    </View>
  );
});
