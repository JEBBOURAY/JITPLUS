import React, { useCallback, useId } from 'react';
import { View, Text, StyleSheet, Pressable, I18nManager } from 'react-native';
import Svg, { ClipPath, Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import { hapticLight } from '@/utils/haptics';
import ZelligePattern from '@/components/home/ZelligePattern';
import { PROMO_TONES } from '@/components/home/promoTones';
import { PROMO_ICON_GRID, type PromoIcon } from '@/components/home/PromoIcons';

const CARD_HEIGHT = 140;
const CARD_RADIUS = 20;
const DEFAULT_COLORS = [PROMO_TONES.violet.fill, PROMO_TONES.violet.deep] as const;

const ICON_SIZE = 112;
const ICON_EDGE = 66; // illustration centre to the trailing edge
const ICON_SCALE = ICON_SIZE / PROMO_ICON_GRID;
const READ_BADGE = 22;

/** How far the illustration rises above the card; the carousel reserves this space. */
export const PROMO_BANNER_OVERFLOW = 30;

interface PromoBannerProps {
  /** Small uppercase tag, e.g. "Guide". */
  label: string;
  /** Two lines max, never truncated (auto-shrinks on narrow screens). */
  title: string;
  /** Action label. */
  cta: string;
  /** Diagonal gradient, one pair per card. */
  colors?: readonly [string, string];
  /** Card color reused for the pill text, the tinted shadow and the illustration above the card. */
  tint?: string;
  /** Line illustration on the trailing side, rising above the card. */
  Icon: PromoIcon;
  /** Optional geometric watermark (zellige) at 8 % opacity. */
  pattern?: 'zellige';
  /** Shows the check badge under the illustration when the card was already opened. */
  read?: boolean;
  /** Card width, computed by the carousel. */
  width: number;
  onPress: () => void;
  /** Accessible label for the read badge. */
  readA11yLabel?: string;
}

/** Optional help card, shown after the setup checklist is complete. */
function PromoBanner({
  label,
  title,
  cta,
  colors = DEFAULT_COLORS,
  tint = PROMO_TONES.violet.fill,
  Icon,
  pattern,
  read = false,
  width,
  onPress,
  readA11yLabel,
}: PromoBannerProps) {
  const isRTL = I18nManager.isRTL;
  const iconX = isRTL ? ICON_EDGE : width - ICON_EDGE;
  const cardRect = { x: 0, y: PROMO_BANNER_OVERFLOW, width, height: CARD_HEIGHT, rx: CARD_RADIUS };
  // Svg ids must be unique on web, where every card shares one document.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fillId = `promoFill${uid}`;
  const clipId = `promoClip${uid}`;
  const iconTransform = `translate(${iconX - ICON_SIZE / 2} 0) scale(${ICON_SCALE})`;

  const handlePress = useCallback(() => {
    hapticLight();
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.wrap,
        { width, shadowColor: tint },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${title}. ${cta}`}
    >
      <View pointerEvents="none" style={styles.art}>
        <Svg width={width} height={CARD_HEIGHT + PROMO_BANNER_OVERFLOW}>
          <Defs>
            <LinearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors[0]} />
              <Stop offset="1" stopColor={colors[1]} />
            </LinearGradient>
            <ClipPath id={clipId}>
              <Rect {...cardRect} />
            </ClipPath>
          </Defs>

          {/* Drawn twice: tinted under the card (the part above it), white inside it. */}
          <G transform={iconTransform}>
            <Icon color={tint} />
          </G>
          <Rect {...cardRect} fill={`url(#${fillId})`} />
          <G clipPath={`url(#${clipId})`}>
            <G transform={iconTransform}>
              <Icon color="#FFFFFF" />
            </G>
          </G>
        </Svg>
      </View>

      {pattern === 'zellige' && (
        <View pointerEvents="none" style={styles.patternClip}>
          <ZelligePattern cells={18} spacing={10} />
        </View>
      )}

      {/* Text column (~60 %) */}
      <View style={styles.textCol}>
        <Text style={styles.label} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
        <Text
          style={styles.title}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.15}
        >
          {title}
        </Text>
        <View style={styles.pill}>
          <Text style={[styles.pillText, { color: tint }]} maxFontSizeMultiplier={1.2}>
            {cta}
          </Text>
        </View>
      </View>

      {read && (
        <View
          style={[styles.readBadge, { left: iconX - READ_BADGE / 2 }]}
          accessibilityLabel={readA11yLabel}
        >
          <Check size={12} color="#FFFFFF" strokeWidth={3} />
        </View>
      )}
    </Pressable>
  );
}

export default React.memo(PromoBanner);

const styles = StyleSheet.create({
  wrap: {
    height: CARD_HEIGHT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  art: {
    position: 'absolute',
    top: -PROMO_BANNER_OVERFLOW,
    left: 0,
  },
  patternClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  textCol: {
    width: '62%',
    height: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontFamily: 'Lexend_600SemiBold',
  },
  title: {
    flexGrow: 1,
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    marginTop: 4,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.2,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12.5, fontFamily: 'Lexend_700Bold' },
  readBadge: {
    position: 'absolute',
    bottom: 10,
    width: READ_BADGE,
    height: READ_BADGE,
    borderRadius: READ_BADGE / 2,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
