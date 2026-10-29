import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  computeLandingRotation,
  pickTargetSegment,
  type WheelSegment,
} from '@jitplus/shared/src/luckyWheel';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import MerchantLogo from '@/components/MerchantLogo';
import { GAME_GOLD, GameStage, STAGE_TEXT, StageGoldButton } from '@/components/games/GameStage';
import { WheelStage } from './WheelStage';

const SPIN_MS = 3200;
const MIN_TRAVEL_DEG = 360 * 4;
const FRAME_EXTRA = ms(34);

interface Props {
  /** Outer width of the wheel with its lit frame. */
  size: number;
  segments: WheelSegment[];
  /** Draws a result for the test spin: a segment's prizeId, or null for a lost spin. */
  drawResult?: () => string | null;
  /** Wheel name shown under the merchant, as on the client screen. */
  name?: string;
  description?: string | null;
}

type SpinResult = { won: true; label: string } | { won: false };

/** The wheel as clients see it in JitPlus; with `drawResult` the merchant can test a spin. */
export function WheelPreview({ size, segments, drawResult, name, description }: Props) {
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const merchant = useAuthStore((s) => s.merchant);
  const [rotation] = useState(() => new Animated.Value(0));
  const angleRef = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);

  useEffect(() => () => rotation.stopAnimation(), [rotation]);

  // A change in the prizes makes the last result meaningless.
  const [resultFor, setResultFor] = useState(segments);
  if (resultFor !== segments) {
    setResultFor(segments);
    setResult(null);
  }

  const canTest = !!drawResult && segments.length > 0;
  const spin = useCallback(() => {
    if (spinning || !drawResult || segments.length === 0) return;
    const prizeId = drawResult();
    const segment = prizeId ? segments.find((s) => s.prizeId === prizeId) : undefined;
    const index = pickTargetSegment(segments, segment ? { id: prizeId ?? undefined, label: segment.label } : null);
    const target = computeLandingRotation(angleRef.current, index, segments.length, MIN_TRAVEL_DEG, Math.random() - 0.5);
    setResult(null);
    setSpinning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(rotation, {
      toValue: target,
      duration: SPIN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      angleRef.current = target;
      setSpinning(false);
      if (!finished) return;
      const landed = segments[index];
      const won = !!landed && !landed.isLost;
      setResult(won ? { won: true, label: landed.label } : { won: false });
      Haptics.notificationAsync(won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    });
  }, [spinning, drawResult, segments, rotation]);

  const rotate = useMemo(() => rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }), [rotation]);
  const merchantName = merchant?.nom ?? '';

  return (
    <GameStage>
      {name ? (
        <View style={[styles.merchantRow, { flexDirection: row }]}>
          <MerchantLogo logoUrl={merchant?.logoUrl} style={styles.logo} />
          <View style={styles.merchantText}>
            <Text style={[styles.merchantName, { textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {merchantName || name}
            </Text>
            {merchantName && name !== merchantName ? (
              <Text style={[styles.campaignName, { textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {name}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {description ? (
        <Text style={styles.description} numberOfLines={3} maxFontSizeMultiplier={1.3}>{description}</Text>
      ) : null}

      <WheelStage
        size={size - FRAME_EXTRA}
        segments={segments}
        rotation={rotate}
        spinning={spinning}
        onPress={canTest ? spin : undefined}
      />

      {drawResult && (
        <>
          <View style={styles.resultSlot} accessibilityLiveRegion="polite">
            {result && (
              <Text style={[styles.result, { color: result.won ? GAME_GOLD.light : STAGE_TEXT.muted }]} maxFontSizeMultiplier={1.3}>
                {result.won ? t('luckyWheel.preview.won', { prize: result.label }) : t('luckyWheel.preview.lost')}
              </Text>
            )}
          </View>
          <StageGoldButton
            label={spinning ? t('luckyWheel.preview.spinning') : t('luckyWheel.preview.tryIt')}
            onPress={spin}
            disabled={!canTest}
            busy={spinning}
          />
        </>
      )}
    </GameStage>
  );
}

const styles = StyleSheet.create({
  merchantRow: { alignSelf: 'stretch', alignItems: 'center', gap: 10 },
  logo: { width: ms(36), height: ms(36), borderRadius: ms(18), backgroundColor: '#FFFFFF' },
  merchantText: { flex: 1 },
  merchantName: { color: STAGE_TEXT.strong, fontSize: ms(15), fontFamily: font.bold },
  campaignName: { color: STAGE_TEXT.muted, fontSize: ms(12), fontFamily: font.regular, marginTop: 1 },
  description: { alignSelf: 'stretch', color: STAGE_TEXT.soft, fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular, textAlign: 'center' },
  resultSlot: { minHeight: ms(22), justifyContent: 'center' },
  result: { fontSize: ms(15), fontFamily: font.semibold, textAlign: 'center' },
});
