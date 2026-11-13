import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, I18nManager } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import { hapticLight } from '@/utils/haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { PROMO_OUTLINE, PROMO_SURFACE, PROMO_TONES, type PromoTone } from '@/components/home/promoTones';
import { PROMO_ICON_GRID, type PromoIcon } from '@/components/home/PromoIcons';

const CARD_HEIGHT = 120;
const CARD_RADIUS = 18;

const ICON_SIZE = 112;
const ICON_EDGE = 66; // illustration centre to the trailing edge
const ICON_SCALE = ICON_SIZE / PROMO_ICON_GRID;
const READ_BADGE = 22;

/** How far the illustration rises above the card; the carousel reserves this space. */
export const PROMO_BANNER_OVERFLOW = 30;

interface PromoBannerProps {
  /** Small tag above the title, e.g. "Comprendre". */
  label: string;
  /** Two lines max, never truncated (auto-shrinks on narrow screens). */
  title: string;
  /** Action label. */
  cta: string;
  /** Accent of the tag, the illustration and the action; shared with the sheet the card opens. */
  tone?: PromoTone;
  /** Line illustration on the trailing side, rising above the card. */
  Icon: PromoIcon;
  /** Shows the check badge under the illustration when the card was already opened. */
  read?: boolean;
  /** Card width, computed by the carousel. */
  width: number;
  onPress: () => void;
  /** Accessible label for the read badge. */
  readA11yLabel?: string;
}

/** Help card of the Accueil carousel: opens the sheet that explains one topic. */
function PromoBanner({
  label,
  title,
  cta,
  tone = 'violet',
  Icon,
  read = false,
  width,
  onPress,
  readA11yLabel,
}: PromoBannerProps) {
  const theme = useTheme();
  const scheme = theme.mode === 'dark' ? 'dark' : 'light';
  // The tone's text-safe variant for the tag and the drawing, its fill under the white action label.
  const ink = PROMO_TONES[tone][scheme];
  const fill = PROMO_TONES[tone].fill;
  const isRTL = I18nManager.isRTL;
  const iconX = isRTL ? ICON_EDGE : width - ICON_EDGE;
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
        { width },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${title}. ${cta}`}
    >
      <View pointerEvents="none" style={styles.art}>
        <Svg width={width} height={CARD_HEIGHT + PROMO_BANNER_OVERFLOW}>
          <Rect
            x={0.5}
            y={PROMO_BANNER_OVERFLOW + 0.5}
            width={width - 1}
            height={CARD_HEIGHT - 1}
            rx={CARD_RADIUS}
            fill={PROMO_SURFACE[scheme]}
            stroke={PROMO_OUTLINE[scheme]}
          />
          <G transform={iconTransform}>
            <Icon color={ink} />
          </G>
        </Svg>
      </View>

      {/* Text column (~60 %) */}
      <View style={styles.textCol}>
        <Text style={[styles.label, { color: ink }]} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
        <Text
          style={[styles.title, { color: theme.text }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.15}
        >
          {title}
        </Text>
        <View style={[styles.pill, { backgroundColor: fill }]}>
          <Text style={styles.pillText} maxFontSizeMultiplier={1.2}>
            {cta}
          </Text>
        </View>
      </View>

      {read && (
        <View
          style={[styles.readBadge, { left: iconX - READ_BADGE / 2, backgroundColor: fill }]}
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
  wrap: { height: CARD_HEIGHT },
  pressed: { transform: [{ scale: 0.97 }] },
  art: {
    position: 'absolute',
    top: -PROMO_BANNER_OVERFLOW,
    left: 0,
  },
  textCol: {
    width: '62%',
    height: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Lexend_600SemiBold',
  },
  title: {
    flexGrow: 1,
    fontSize: 17,
    lineHeight: 22,
    marginTop: 4,
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  pillText: { color: '#FFFFFF', fontSize: 12.5, fontFamily: 'Lexend_600SemiBold' },
  readBadge: {
    position: 'absolute',
    bottom: 10,
    width: READ_BADGE,
    height: READ_BADGE,
    borderRadius: READ_BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
