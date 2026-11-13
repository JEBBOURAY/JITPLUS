import React, { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import { palette } from '@/contexts/ThemeContext';
import { font } from '@/constants/design';

const BRAND_COLOR = palette.violet;

interface BrandNameProps {
  /** Text to display, defaults to "JitPlus Pro". */
  label?: string;
  fontSize?: number;
  fontFamily?: string;
  style?: StyleProp<ViewStyle>;
  /** Solid colour for the whole label; defaults to the brand violet. */
  color?: string;
}

export default React.memo(function BrandName({
  label = 'JitPlus Pro',
  fontSize = 26,
  fontFamily = font.semibold,
  style,
  color,
}: BrandNameProps) {
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
        <SvgText
          fill={color ?? BRAND_COLOR}
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
