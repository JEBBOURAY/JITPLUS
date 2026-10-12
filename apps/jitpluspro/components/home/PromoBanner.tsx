import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  I18nManager,
  type ImageSourcePropType,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import ZelligePattern from '@/components/home/ZelligePattern';
import type { LucideIcon } from '@/components/home/PromoSheet';

const CARD_HEIGHT = 140;
const CARD_RADIUS = 20;

export interface PromoBannerProps {
  /** Small uppercase tag, e.g. "Guide". */
  label: string;
  /** Two lines max, never truncated (auto-shrinks on narrow screens). */
  title: string;
  /** White pill button text. */
  cta: string;
  /** Reading time, e.g. "5 min". */
  duration: string;
  /** Diagonal gradient, one pair per card. */
  colors: readonly [string, string];
  /** Card color reused for the pill text and the tinted shadow. */
  tint: string;
  /** PNG/SVG illustration; slightly overflows the top-right corner. */
  illustration?: ImageSourcePropType;
  /** Semi-transparent white icon shown until a real illustration is provided. */
  FallbackIcon: LucideIcon;
  /** Optional geometric watermark (zellige) at 8 % opacity. */
  pattern?: 'zellige';
  /** Shows the white check badge when the card was already opened. */
  read?: boolean;
  /** Card width, computed by the carousel. */
  width: number;
  onPress: () => void;
  /** Accessible label for the read badge. */
  readA11yLabel?: string;
}

/**
 * Illustrated promo banner for the Accueil carousel: gradient card with a
 * label / title / pill-CTA column on the left and an illustration that
 * overflows the top-right corner on the right. Purely prop-driven (no theme
 * or i18n hooks) so it stays reusable and easy to test.
 */
function PromoBanner({
  label,
  title,
  cta,
  duration,
  colors,
  tint,
  illustration,
  FallbackIcon,
  pattern,
  read = false,
  width,
  onPress,
  readA11yLabel,
}: PromoBannerProps) {
  const isRTL = I18nManager.isRTL;

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
      {/* Clipped gradient body */}
      <LinearGradient
        colors={[colors[0], colors[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.body}
      >
        {pattern === 'zellige' && <ZelligePattern cells={18} spacing={10} />}

        {/* Text column (~60 %) */}
        <View style={styles.textCol}>
          <Text style={styles.label} maxFontSizeMultiplier={1.2}>
            {label.toUpperCase()}
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
          <View style={styles.footerRow}>
            <View style={styles.pill}>
              <Text style={[styles.pillText, { color: tint }]} maxFontSizeMultiplier={1.2}>
                {cta}
              </Text>
            </View>
            <Text style={styles.duration} maxFontSizeMultiplier={1.2}>
              {duration}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Illustration, allowed to overflow the card */}
      <View
        pointerEvents="none"
        style={[
          styles.illustrationWrap,
          isRTL ? { left: -10 } : { right: -10 },
        ]}
      >
        {illustration ? (
          <ExpoImage source={illustration} style={styles.illustration} contentFit="contain" />
        ) : (
          <FallbackIcon size={86} color="rgba(255,255,255,0.25)" strokeWidth={1.4} />
        )}
      </View>

      {/* Read badge */}
      {read && (
        <View
          style={[styles.readBadge, isRTL ? { left: 12 } : { right: 12 }]}
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
  body: {
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
    letterSpacing: 1.4,
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
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12.5, fontFamily: 'Lexend_700Bold' },
  duration: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11.5,
    fontFamily: 'Lexend_500Medium',
  },
  illustrationWrap: {
    position: 'absolute',
    top: -12,
    bottom: 8,
    width: 118,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: { width: '100%', height: '100%' },
  readBadge: {
    position: 'absolute',
    top: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
