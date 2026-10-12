import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { palette } from '@/contexts/ThemeContext';
import type { WheelSegment } from '@/utils/luckyWheel';
import { ms } from '@/utils/responsive';
import LuckyWheelIcon from '../LuckyWheelIcon';

const BULBS = 18;

interface WheelStageProps {
  size: number;
  segments?: WheelSegment[];
  rotation: Animated.AnimatedInterpolation<string>;
  /** 0 → 1 kick applied to the pointer each time a segment passes it. */
  pointerKick: Animated.Value;
  entrance: Animated.Value;
  spinning: boolean;
  dimmed?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
}

export default React.memo(function WheelStage({
  size, segments, rotation, pointerKick, entrance, spinning, dimmed, onPress, accessibilityLabel,
}: WheelStageProps) {
  const frame = size + ms(34);
  const bulbRadius = size / 2 + ms(9);
  const bulbSize = ms(7);
  const [blink] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 1, duration: spinning ? 140 : 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0, duration: spinning ? 140 : 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, spinning]);

  const evenOpacity = blink.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const oddOpacity = blink.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const pointerRotate = pointerKick.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-22deg'] });
  const scale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  const ptrW = ms(34);
  const ptrH = ms(42);

  return (
    <Animated.View style={[styles.root, { width: frame, height: frame + ms(10), opacity: entrance, transform: [{ scale }] }]}>
      <View style={[styles.glow, { width: size * 0.92, height: size * 0.92, borderRadius: size }]} />

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
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ disabled: !onPress, busy: spinning }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        >
          <Animated.View style={{ width: size, height: size, opacity: dimmed ? 0.45 : 1, transform: [{ rotate: rotation }] }}>
            <LuckyWheelIcon size={size} segments={segments} showPointer={false} />
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

      <Animated.View
        pointerEvents="none"
        style={[styles.pointer, { width: ptrW, height: ptrH, marginLeft: -ptrW / 2, transform: [{ rotate: pointerRotate }] }]}
      >
        <Svg width={ptrW} height={ptrH} viewBox="0 0 34 42">
          <Defs>
            <SvgGradient id="ptr" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette.goldSoft} />
              <Stop offset="0.5" stopColor={palette.goldLight} />
              <Stop offset="1" stopColor={palette.goldDark} />
            </SvgGradient>
          </Defs>
          <Path d="M17 41 L3.5 16 A14 14 0 1 1 30.5 16 Z" fill="url(#ptr)" stroke="#92400E" strokeWidth={1.2} />
          <Circle cx={17} cy={14} r={5} fill="#FFFFFF" opacity={0.9} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  glow: {
    position: 'absolute',
    top: '18%',
    backgroundColor: palette.violet,
    opacity: 0.35,
    shadowColor: palette.violetVivid,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 0,
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
    backgroundColor: '#FDE68A',
    shadowColor: '#FBBF24',
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
});
