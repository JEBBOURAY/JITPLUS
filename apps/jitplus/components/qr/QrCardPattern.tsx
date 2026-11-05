import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { khatamPath, zelligePath } from '@/utils/khatam';
import { ms } from '@/utils/responsive';

interface QrCardPatternProps {
  width: number;
  height: number;
}

const TILE = ms(46);
const STAR_R = ms(15);
const ROSETTE_R = ms(118);

/**
 * Card watermark: a faint zellige of khatam outlines, with a large khatam
 * rosette cut by the top-right corner. Purely decorative; the card clips it.
 */
export default memo(function QrCardPattern({ width, height }: QrCardPatternProps) {
  const zellige = zelligePath(width, height, TILE, STAR_R);
  const cx = width - ROSETTE_R * 0.32;
  const cy = ROSETTE_R * 0.12;
  const rosette = [
    khatamPath(cx, cy, ROSETTE_R),
    khatamPath(cx, cy, ROSETTE_R * 0.82, 22.5),
    khatamPath(cx, cy, ROSETTE_R * 0.56),
  ].join(' ');

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path d={zellige} fill="none" stroke="#FFFFFF" strokeOpacity={0.07} strokeWidth={1} strokeLinejoin="round" />
      <Path d={khatamPath(cx, cy, ROSETTE_R)} fill="#FFFFFF" fillOpacity={0.05} />
      <Path d={rosette} fill="none" stroke="#FFFFFF" strokeOpacity={0.14} strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  );
});
