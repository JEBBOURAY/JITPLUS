import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import { ms } from '@/utils/responsive';
import { palette } from '@/contexts/ThemeContext';

interface BrandTextProps {
  size?: number;
}

/**
 * "JitPlus" wordmark in solid brand violet.
 */
export default memo(function BrandText({ size = 24 }: BrandTextProps) {
  const scaledSize = ms(size);
  const width = scaledSize * 5.2;
  const height = scaledSize * 1.4;

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="JitPlus" accessibilityRole="image">
      <Svg width={width} height={height}>
        <SvgText
          fill={palette.violet}
          fontSize={scaledSize}
          fontWeight="700"
          fontFamily="Lexend_700Bold"
          x={width / 2}
          y={scaledSize}
          textAnchor="middle"
        >
          JitPlus
        </SvgText>
      </Svg>
    </View>
  );
});