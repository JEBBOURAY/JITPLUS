import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { palette } from '@/contexts/ThemeContext';
import { resolveImageUrl } from '@/utils/imageUrl';
import { font } from '@/constants/design';
import { CATEGORY_EMOJI } from '@jitplus/shared';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const FALLBACK_EMOJI = CATEGORY_EMOJI.AUTRE;

/** Merchant theme color, else the brand violet (same rule as the client app's getMerchantAccent). */
export function dealAccent(themeColor?: string | null): string {
  return themeColor && HEX.test(themeColor) ? themeColor : palette.violet;
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((n >> shift) & 0xff) * (1 - amount)).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

interface DealThumbProps {
  /** Deal photo */
  imageUrl?: string | null;
  /** Merchant cover, darkened under the badge when the deal has no photo */
  coverUrl?: string | null;
  themeColor?: string | null;
  category?: string | null;
  /** Translated badge ("-30 %", "1+1 OFFERT"), shown on the generated visuals */
  badge?: string | null;
  width: number;
  height?: number;
  radius?: number;
}

/**
 * Deal visual: the photo, else the merchant cover darkened with the badge on
 * top, else a gradient of the merchant color with the category emoji.
 */
function DealThumb({ imageUrl, coverUrl, themeColor, category, badge, width, height = width, radius = 12 }: DealThumbProps) {
  const box = { width, height, borderRadius: radius };
  const scale = Math.min(width, height);
  const badgeStyle = { fontSize: Math.max(11, Math.round(scale * 0.17)), lineHeight: Math.max(14, Math.round(scale * 0.22)) };

  if (imageUrl) {
    return (
      <ExpoImage
        source={{ uri: resolveImageUrl(imageUrl) }}
        style={[styles.base, box]}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        accessibilityIgnoresInvertColors
      />
    );
  }

  const badgeText = badge ? (
    <Text style={[styles.badge, badgeStyle]} numberOfLines={2} adjustsFontSizeToFit maxFontSizeMultiplier={1}>
      {badge}
    </Text>
  ) : null;

  if (coverUrl) {
    return (
      <View style={[styles.base, box]}>
        <ExpoImage source={{ uri: resolveImageUrl(coverUrl) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        <View style={[StyleSheet.absoluteFill, styles.dim]} />
        <View style={styles.center}>{badgeText ?? <Text style={{ fontSize: Math.round(scale * 0.36) }}>{emojiOf(category)}</Text>}</View>
      </View>
    );
  }

  const accent = dealAccent(themeColor);
  return (
    <LinearGradient colors={[accent, darken(accent, 0.45)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.base, box]}>
      <View style={styles.center}>
        <Text style={{ fontSize: Math.round(scale * (badgeText ? 0.26 : 0.36)) }} maxFontSizeMultiplier={1}>{emojiOf(category)}</Text>
        {badgeText}
      </View>
    </LinearGradient>
  );
}

function emojiOf(category?: string | null): string {
  return (category && CATEGORY_EMOJI[category]) || FALLBACK_EMOJI;
}

export default React.memo(DealThumb);

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  dim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 2 },
  badge: { color: '#FFFFFF', fontFamily: font.bold, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
