import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import Svg, {
  Circle, Defs, G, LinearGradient as SvgLinearGradient, Mask, Path, Rect, Stop,
} from 'react-native-svg';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Hand } from 'lucide-react-native';
import { BRUSH, type useScratchSession } from '@/hooks/useScratchSession';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';
import type { getScratchDesign } from '@jitplus/shared/src/scratch';
import type { getScratchZone } from '@jitplus/shared/src/scratch/ScratchCardFace';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Session = ReturnType<typeof useScratchSession>;

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  zone: ReturnType<typeof getScratchZone>;
  design: ReturnType<typeof getScratchDesign>;
  pan: Session['pan'];
  coverStyle: Session['coverStyle'];
  labelStyle: Session['labelStyle'];
  scratchPathProps: Session['scratchPathProps'];
  coverVisible: boolean;
  scratching: boolean;
  showScratchLabel: boolean;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/** Scratchable coating over the card's reward zone, plus the pulsing "scratch here" label. */
export default React.memo(function ScratchCoating({
  zone, design, pan, coverStyle, labelStyle, scratchPathProps, coverVisible, scratching, showScratchLabel, fonts, t,
}: Props) {
  const zoneW = zone.width;
  const zoneH = zone.height;
  const zoneStyle = { left: zone.x, top: zone.y, width: zoneW, height: zoneH, borderRadius: zone.radius };

  return (
    <>
      {coverVisible && (
        <GestureDetector gesture={pan}>
          <View
            style={[styles.zone, zoneStyle]}
            pointerEvents={scratching ? 'auto' : 'none'}
            accessibilityLabel={t('scratch.card.scratchHere')}
          >
            <Animated.View style={[StyleSheet.absoluteFill, coverStyle]}>
              <Svg width={zoneW} height={zoneH}>
                <Defs>
                  <SvgLinearGradient id="scratchCover" x1={0} y1={0} x2={zoneW} y2={zoneH} gradientUnits="userSpaceOnUse">
                    <Stop offset={0} stopColor={design.cover[0]} />
                    <Stop offset={1} stopColor={design.cover[1]} />
                  </SvgLinearGradient>
                  {/* Luminance mask: white keeps the coating, the black stroke erases it. */}
                  <Mask id="scratchMask" x={0} y={0} width={zoneW} height={zoneH} maskUnits="userSpaceOnUse">
                    <Rect x={0} y={0} width={zoneW} height={zoneH} fill="#fff" />
                    <AnimatedPath
                      animatedProps={scratchPathProps}
                      fill="none"
                      stroke="#000"
                      strokeWidth={BRUSH * 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Mask>
                </Defs>
                <G mask="url(#scratchMask)">
                  <Rect x={0} y={0} width={zoneW} height={zoneH} fill="url(#scratchCover)" />
                  {/* Subtle pattern so the cover reads as a coating */}
                  {Array.from({ length: 5 }, (_, row) => Array.from({ length: 10 }, (__, col) => (
                    <Circle
                      key={`${row}-${col}`}
                      cx={(col + 0.5 + (row % 2) * 0.5) * (zoneW / 10)}
                      cy={(row + 0.5) * (zoneH / 5)}
                      r={ms(6)}
                      fill="#fff"
                      fillOpacity={0.18}
                    />
                  )))}
                </G>
              </Svg>
            </Animated.View>
          </View>
        </GestureDetector>
      )}
      {showScratchLabel && (
        <View pointerEvents="none" style={[styles.zone, zoneStyle, styles.scratchLabelWrap]}>
          <Animated.View style={[styles.scratchLabelPill, labelStyle]}>
            <Hand size={ms(16)} color="#fff" />
            <Text style={[styles.scratchLabelText, { fontFamily: fonts.bold }]}>{t('scratch.card.scratchHere')}</Text>
          </Animated.View>
        </View>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  zone: { position: 'absolute', overflow: 'hidden' },
  scratchLabelWrap: { alignItems: 'center', justifyContent: 'center' },
  scratchLabelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: wp(18),
    paddingVertical: hp(8),
    borderRadius: 999,
  },
  scratchLabelText: { color: '#fff', fontSize: FS.md, letterSpacing: 0.4 },
});
