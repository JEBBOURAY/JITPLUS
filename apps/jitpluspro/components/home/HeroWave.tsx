import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const SEGMENTS = 48;

/** One period of a sine wave across the width, filled down to the bottom edge. */
function wavePath(width: number, height: number, amplitude: number, phase: number): string {
  const mid = height - amplitude - 1;
  let d = '';
  for (let i = 0; i <= SEGMENTS; i++) {
    const x = (i / SEGMENTS) * width;
    const y = mid - amplitude * Math.sin((i / SEGMENTS) * Math.PI * 2 + phase);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(2)}`;
  }
  return `${d}L${width} ${height}L0 ${height}Z`;
}

interface Props {
  /** Screen width: one wave period. */
  width: number;
  height: number;
  /** Colour of the page under the hero. */
  color: string;
}

/**
 * Bottom edge of the Accueil hero: the page colour rises into the hero as a
 * soft wave, with a fainter one behind it. Static: a looping drift on a
 * screen people keep open all day reads as decoration.
 */
function HeroWave({ width, height, color }: Props) {
  const { frontPath, backPath } = useMemo(
    () => ({
      frontPath: wavePath(width, height, height * 0.3, 0),
      backPath: wavePath(width, height, height * 0.42, Math.PI * 0.6),
    }),
    [width, height],
  );

  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]} importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={backPath} fill={color} opacity={0.35} />
        <Path d={frontPath} fill={color} />
      </Svg>
    </View>
  );
}

export default React.memo(HeroWave);

const styles = StyleSheet.create({
  // One pixel past the hero edge so no violet hairline shows under the wave.
  wrap: { position: 'absolute', left: 0, right: 0, bottom: -1, overflow: 'hidden' },
});
