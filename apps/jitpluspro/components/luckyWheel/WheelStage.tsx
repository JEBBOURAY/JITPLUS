import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router/react-navigation';
import type { WheelSegment } from '@jitplus/shared/src/luckyWheel';
import { ms } from '@/utils/responsive';
import { GAME_GOLD, GAME_STAGE_GRADIENT, GAME_VIOLET } from '@/components/games/GameStage';
import { WheelFace } from './WheelFace';

const BULBS = 18;

interface Props {
  /** Diameter of the wheel itself; the lit frame adds ms(34). */
  size: number;
  segments: WheelSegment[];
  rotation?: Animated.AnimatedInterpolation<string>;
  spinning?: boolean;
  /** Spins on tap; screen readers use the button under the wheel instead. */
  onPress?: () => void;
}

/** The JitPlus spin stage: glow, lit frame, gloss and gold pointer around the wheel. */
export const WheelStage = React.memo(function WheelStage({ size, segments, rotation, spinning, onPress }: Props) {
  const frame = size + ms(34);
  const bulbRadius = size / 2 + ms(9);
  const bulbSize = ms(7);
  const [blink] = useState(() => new Animated.Value(0));
  const isFocused = useIsFocused();

  // A single timing loops on the native side (a sequence would hop through JS
  // each half). 0 and 1 light the same bulbs, so the restart is seamless.
  useEffect(() => {
    if (!isFocused) return;
    blink.setValue(0);
    const loop = Animated.loop(
      Animated.timing(blink, { toValue: 1, duration: spinning ? 280 : 1800, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, spinning, isFocused]);

  const evenOpacity = useMemo(() => blink.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.35, 1] }), [blink]);
  const oddOpacity = useMemo(() => blink.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1, 0.35] }), [blink]);
  const ptrW = ms(34);
  const ptrH = ms(42);

  return (
    <View style={[styles.root, { width: frame, height: frame + ms(10) }]}>
      <View pointerEvents="none" style={[styles.glow, { width: size * 0.92, height: size * 0.92, borderRadius: size }]} />

      <View style={[styles.frame, { width: frame, height: frame, borderRadius: frame / 2, top: ms(10) }]}>
        {Array.from({ length: BULBS }, (_, i) => {
          const a = (i / BULBS) * Math.PI * 2;
          return (
            <Animated.View
              key={i}
              style={[
                styles.bulb,
                {
                  width: bulbSize,
                  height: bulbSize,
                  borderRadius: bulbSize / 2,
                  left: frame / 2 + Math.cos(a) * bulbRadius - bulbSize / 2,
                  top: frame / 2 + Math.sin(a) * bulbRadius - bulbSize / 2,
                  opacity: i % 2 === 0 ? evenOpacity : oddOpacity,
                },
              ]}
            />
          );
        })}

        <Pressable
          onPress={onPress}
          disabled={!onPress}
          accessible={false}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        >
          <Animated.View style={{ width: size, height: size, transform: rotation ? [{ rotate: rotation }] : undefined }}>
            <WheelFace size={size} segments={segments} />
          </Animated.View>
          {/* Static gloss: stays put while the wheel turns underneath. */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.55 }}
            style={[styles.gloss, { width: size, height: size, borderRadius: size / 2 }]}
          />
        </Pressable>
      </View>

      <View pointerEvents="none" style={[styles.pointer, { width: ptrW, height: ptrH, marginLeft: -ptrW / 2 }]}>
        <Svg width={ptrW} height={ptrH} viewBox="0 0 34 42">
          <Defs>
            <SvgGradient id="wheelStagePtr" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={GAME_GOLD.soft} />
              <Stop offset="0.5" stopColor={GAME_GOLD.light} />
              <Stop offset="1" stopColor={GAME_GOLD.dark} />
            </SvgGradient>
          </Defs>
          <Path d="M17 41 L3.5 16 A14 14 0 1 1 30.5 16 Z" fill="url(#wheelStagePtr)" stroke="#92400E" strokeWidth={1.2} />
          <Circle cx={17} cy={14} r={5} fill="#FFFFFF" opacity={0.9} />
        </Svg>
      </View>
    </View>
  );
});

/** Small wheel on the violet stage colours, for list rows and summaries. */
export const WheelTile = React.memo(function WheelTile({ size, segments }: { size: number; segments: WheelSegment[] }) {
  return (
    <LinearGradient colors={GAME_STAGE_GRADIENT} style={[styles.tile, { width: size, height: size, borderRadius: size * 0.26 }]}>
      <WheelFace size={Math.round(size * 0.8)} segments={segments} />
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  glow: {
    position: 'absolute',
    top: '18%',
    backgroundColor: GAME_VIOLET.base,
    opacity: 0.35,
    shadowColor: GAME_VIOLET.vivid,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
  },
  frame: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A1356',
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.55)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 18,
  },
  bulb: {
    position: 'absolute',
    backgroundColor: GAME_GOLD.soft,
    shadowColor: GAME_GOLD.light,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  gloss: { position: 'absolute', top: 0, left: 0 },
  pointer: {
    position: 'absolute',
    top: 0,
    left: '50%',
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 20,
  },
  tile: { alignItems: 'center', justifyContent: 'center' },
});
