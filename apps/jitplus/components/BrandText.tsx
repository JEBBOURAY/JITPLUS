import { View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Text as SvgText } from 'react-native-svg';
import { ms } from '@/utils/responsive';

interface BrandTextProps {
  size?: number;
}

/**
 * "JitPlus" with an Améthyste Solaire gradient (Violet → Gold).
 * Uses SVG so the gradient applies to the text fill on both platforms.
 */
export default function BrandText({ size = 24 }: BrandTextProps) {
  const scaledSize = ms(size);
  const width = scaledSize * 5.2;
  const height = scaledSize * 1.4;

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id="brand" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#7C3AED" />
            <Stop offset="100%" stopColor="#F59E0B" />
          </SvgGradient>
        </Defs>
        <SvgText
          fill="url(#brand)"
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
}