// ── Scratch card visuals shared by JitPlus (real card) and JitPlus Pro (preview)
// React Native only — import by path, never from the package index.
import { View, Text, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getScratchDesign } from './designs';

export const SCRATCH_CARD_ASPECT_RATIO = 1.6;

const PADDING = 16;
const LOGO_SIZE = 34;
const HEADER_GAP = 10;
const ZONE_INSET = 12;

export function scratchCardHeight(width: number): number {
  return Math.round(width / SCRATCH_CARD_ASPECT_RATIO);
}

/**
 * Area covered by the scratch coating, relative to the card. The header
 * (merchant logo + name) stays visible so the customer knows who the card is
 * from before scratching.
 */
export function getScratchZone(width: number): { x: number; y: number; width: number; height: number; radius: number } {
  const height = scratchCardHeight(width);
  const top = PADDING + LOGO_SIZE + HEADER_GAP;
  return { x: ZONE_INSET, y: top, width: width - ZONE_INSET * 2, height: height - top - ZONE_INSET, radius: 14 };
}

interface ScratchCardFaceProps {
  designId?: string | null;
  width: number;
  merchantName: string;
  /** Already resolved, absolute URL */
  logoUrl?: string | null;
  /** Small caption above the reward, e.g. "Vous avez gagné !" */
  caption: string;
  /** Big text: the reward ("-20 %", "Café offert"). Hidden while null. */
  rewardText?: string | null;
  /** Optional line under the reward (the merchant's label when it differs) */
  rewardDetail?: string | null;
  /** Line at the bottom of the card, e.g. the campaign name */
  footer?: string | null;
  isRTL?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Revealed side of the card. */
export function ScratchCardFace({
  designId, width, merchantName, logoUrl, caption, rewardText, rewardDetail, footer, isRTL, style,
}: ScratchCardFaceProps) {
  const design = getScratchDesign(designId);
  const height = scratchCardHeight(width);
  const initial = (merchantName || '?').trim().charAt(0).toUpperCase();

  return (
    <View style={[styles.wrapper, { width, height }, style]}>
      <LinearGradient colors={[design.gradient[0], design.gradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logo} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Text style={styles.logoInitial}>{initial}</Text>
          </View>
        )}
        <Text numberOfLines={1} style={[styles.merchant, { color: design.text, textAlign: isRTL ? 'right' : 'left' }]}>
          {merchantName}
        </Text>
      </View>
      <View style={styles.center}>
        <Text style={[styles.caption, { color: design.accent }]}>{caption}</Text>
        {rewardText ? (
          <Text numberOfLines={2} adjustsFontSizeToFit style={[styles.reward, { color: design.text }]}>
            {rewardText}
          </Text>
        ) : (
          <Text style={[styles.reward, { color: design.text, opacity: 0.35 }]}>• • •</Text>
        )}
        {rewardDetail ? (
          <Text numberOfLines={1} style={[styles.detail, { color: design.text }]}>{rewardDetail}</Text>
        ) : null}
      </View>
      {footer ? (
        <Text numberOfLines={1} style={[styles.footer, { color: design.text }]}>{footer}</Text>
      ) : null}
    </View>
  );
}

interface ScratchCardCoverProps {
  designId?: string | null;
  /** Card width — the cover is drawn over getScratchZone(width) */
  width: number;
  label: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Static scratch coating (JitPlus Pro preview). The client app draws the same
 * zone with Skia so it can be erased.
 */
export function ScratchCardCover({ designId, width, label, style }: ScratchCardCoverProps) {
  const design = getScratchDesign(designId);
  const zone = getScratchZone(width);
  return (
    <View
      pointerEvents="none"
      style={[styles.coverWrapper, { left: zone.x, top: zone.y, width: zone.width, height: zone.height, borderRadius: zone.radius }, style]}
    >
      <LinearGradient colors={[design.cover[0], design.cover[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.coverLabel}>
        <Text style={styles.coverLabelText}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: 18, overflow: 'hidden', padding: PADDING, justifyContent: 'space-between' },
  header: { alignItems: 'center', gap: 10, height: LOGO_SIZE },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE / 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  logoInitial: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  merchant: { flex: 1, fontSize: 15, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingHorizontal: 8 },
  caption: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  reward: { fontSize: 30, fontWeight: '800', textAlign: 'center' },
  detail: { fontSize: 13, fontWeight: '600', opacity: 0.9, textAlign: 'center', marginTop: 2 },
  footer: { fontSize: 12, opacity: 0.85, textAlign: 'center' },
  coverWrapper: { position: 'absolute', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverLabel: { backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  coverLabelText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
});
