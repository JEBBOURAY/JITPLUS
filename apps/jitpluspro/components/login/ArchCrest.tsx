// Horseshoe arch ("bab") framing the logo on the login screen: a brass outline that
// draws itself, a khatam keystone, and a soft violet halo that breathes behind the logo.
import React, { useId, useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { palette } from '@/contexts/ThemeContext';
import { khatamPath } from '@/utils/khatam';
import { ms } from '@/utils/responsive';

// Geometry in viewBox units; the whole crest is scaled once with ms().
const VB_W = 128;
const VB_H = 132;
const CX = VB_W / 2;
const KEY_R = 8;
const R_OUT = 52;
const R_IN = 45;
const ARC_CY = KEY_R + 2 + R_OUT;
/** How far below the springing line the horseshoe closes in. */
const HORSESHOE_DEG = 28;
const LOGO_CY = 76;
const LOGO = 60;
const HALO = 96;
const BRASS_LIGHT = '#E9C877';

function horseshoe(r: number) {
  const a = (HORSESHOE_DEG * Math.PI) / 180;
  const dx = r * Math.cos(a);
  const py = ARC_CY + r * Math.sin(a);
  const d = `M${CX - dx} ${VB_H} L${CX - dx} ${py} A${r} ${r} 0 1 1 ${CX + dx} ${py} L${CX + dx} ${VB_H}`;
  const length = r * (Math.PI + 2 * a) + 2 * (VB_H - py);
  return { d, length, dx };
}

const OUTER = horseshoe(R_OUT);
const INNER = horseshoe(R_IN);
const KEYSTONE = khatamPath(CX, KEY_R + 1, KEY_R);

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Scale of the crest once the email form is open. */
const COMPACT_SCALE = 0.78;

interface ArchCrestProps {
  dark: boolean;
  /** 0 → 1, JS-driven: the brass outline draws itself. */
  draw: Animated.Value;
  /** 0 → 1, native: logo and inner line appear. */
  reveal: Animated.Value;
  /** 0 → 1, native: keystone pops in. */
  keystone: Animated.Value;
  /** 0 ↔ 1 loop, native: halo breathing. */
  halo: Animated.Value;
  /** 0 → 1, native: shrink while the email form is open. */
  compact: Animated.Value;
  /** Layout flag matching `compact`, so the reserved height follows the visual size. */
  isCompact: boolean;
  children: React.ReactNode;
}

export default React.memo(function ArchCrest({ dark, draw, reveal, keystone, halo, compact, isCompact, children }: ArchCrestProps) {
  const gradId = `archBrass_${useId()}`;
  const s = ms(VB_W) / VB_W;
  const w = VB_W * s;
  const h = VB_H * s;
  const viewBox = `0 0 ${VB_W} ${VB_H}`;

  // Built once per set of Animated values: recreating interpolations on every
  // render would detach and re-attach their native animation nodes.
  const a = useMemo(() => {
    const keyPivot = (KEY_R + 1 - VB_H / 2) * s;
    return {
      frame: {
        width: w,
        height: h,
        transform: [
          // Scale around the top edge, so the crest shrinks towards the language bar.
          { translateY: compact.interpolate({ inputRange: [0, 1], outputRange: [0, -((1 - COMPACT_SCALE) * h) / 2] }) },
          { scale: compact.interpolate({ inputRange: [0, 1], outputRange: [1, COMPACT_SCALE] }) },
        ],
      },
      halo: {
        opacity: Animated.multiply(reveal, halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] })),
        transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }) }],
      },
      // Hidden until drawing starts, so the round cap leaves no dot at the start point.
      strokeOpacity: draw.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] }),
      dashOffset: draw.interpolate({ inputRange: [0, 1], outputRange: [OUTER.length, 0] }),
      keystone: {
        opacity: keystone.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateY: keyPivot },
          { scale: keystone },
          { rotate: keystone.interpolate({ inputRange: [0, 1], outputRange: ['45deg', '0deg'] }) },
          { translateY: -keyPivot },
        ],
      },
      logo: {
        opacity: reveal,
        transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }],
      },
    };
  }, [draw, reveal, keystone, halo, compact, s, w, h]);

  return (
    <View style={{ width: w, height: isCompact ? h * COMPACT_SCALE : h }}>
      <Animated.View style={a.frame}>
        {/* Decoration only: hidden from screen readers. */}
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View
            style={[
              styles.abs,
              {
                width: HALO * s,
                height: HALO * s,
                borderRadius: (HALO * s) / 2,
                left: (CX - HALO / 2) * s,
                top: (LOGO_CY - HALO / 2) * s,
                backgroundColor: dark ? 'rgba(167,139,250,0.20)' : 'rgba(124,58,237,0.12)',
              },
              a.halo,
            ]}
          />

          <Svg width={w} height={h} viewBox={viewBox} style={StyleSheet.absoluteFill}>
            <BrassDefs id={gradId} />
            <AnimatedPath
              d={OUTER.d}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeOpacity={a.strokeOpacity}
              strokeDasharray={[OUTER.length, OUTER.length]}
              strokeDashoffset={a.dashOffset}
            />
          </Svg>

          {/* Inner line and sill fade in behind the drawing stroke. */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reveal }]}>
            <Svg width={w} height={h} viewBox={viewBox}>
              <BrassDefs id={gradId} />
              <Path
                d={INNER.d}
                fill="none"
                stroke={dark ? palette.violetLight : palette.violet}
                strokeOpacity={dark ? 0.35 : 0.22}
                strokeWidth={1}
              />
              <Line
                x1={CX - OUTER.dx - 8}
                y1={VB_H - 1}
                x2={CX + OUTER.dx + 8}
                y2={VB_H - 1}
                stroke={`url(#${gradId})`}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </Animated.View>

          {/* Keystone khatam */}
          <Animated.View style={[StyleSheet.absoluteFill, a.keystone]}>
            <Svg width={w} height={h} viewBox={viewBox}>
              <BrassDefs id={gradId} />
              <Path d={KEYSTONE} fill={`url(#${gradId})`} />
            </Svg>
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.abs,
            {
              width: LOGO * s,
              height: LOGO * s,
              left: (CX - LOGO / 2) * s,
              top: (LOGO_CY - LOGO / 2) * s,
            },
            a.logo,
          ]}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  );
});

/** Brass gradient; declared per <Svg> because react-native-svg defs don't cross roots. */
function BrassDefs({ id }: { id: string }) {
  return (
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={BRASS_LIGHT} />
        <Stop offset="1" stopColor={palette.goldDeep} />
      </LinearGradient>
    </Defs>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
});
