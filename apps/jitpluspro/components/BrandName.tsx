import React, { useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { palette } from '@/contexts/ThemeContext';
import { font } from '@/constants/design';

const GRAD_FROM = palette.violet;
const GRAD_TO = palette.charbon;

interface BrandNameProps {
  /** Text to display, defaults to "JitPlus Pro". */
  label?: string;
  fontSize?: number;
  fontFamily?: string;
  style?: StyleProp<ViewStyle>;
  /** Solid colour for the whole label; bypasses the gradient. */
  color?: string;
}

export default React.memo(function BrandName({
  label = 'JitPlus Pro',
  fontSize = 26,
  fontFamily = font.bold,
  style,
  color,
}: BrandNameProps) {
  // Scoped per instance: SVG gradient ids collide when several copies share a screen.
  const gradId = `brandGrad_${useId()}`;

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
            <Stop offset="0%" stopColor={GRAD_FROM} stopOpacity="1" />
            <Stop offset="100%" stopColor={GRAD_TO} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <SvgText
          fill={color ?? `url(#${gradId})`}
          fontSize={fontSize}
          fontFamily={fontFamily}
          x={estWidth / 2}
          y={fontSize * 1.15}
          textAnchor="middle"
        >
          {label}
        </SvgText>
      </Svg>
    </View>
  );
});
