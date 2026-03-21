/**
 * MapMarker — Premium individual merchant pin.
 *
 * Design: layered violet glow → frosted white circle → category icon.
 * Gives depth and a high-end feel on the map.
 *
 * CRITICAL Android rules for react-native-maps custom markers:
 *  - collapsable={false} on ALL Views
 *  - Root = plain View with FIXED pixel dimensions
 *  - NO Animated.View, NO elevation, NO SVG
 *  - Only PNG <Image> from react-native (not expo-image)
 *  - Use View opacity instead of rgba() backgrounds (bitmap capture issue)
 */
import { memo } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { CATEGORY_EMOJI } from '@/utils/categories';

const VIOLET = '#7C3AED';
const VIOLET_LIGHT = '#A78BFA';
const CIRCLE = 44;
const RING = CIRCLE + 12;       // 56
const GLOW = RING + 14;         // 70
const OUTER_GLOW = GLOW + 12;   // 82
const SIZE = OUTER_GLOW + 8;    // 90
const LOGO_SIZE = 20;
const PIN_TAIL = 8;
const TOTAL_HEIGHT = SIZE + PIN_TAIL;
const LOGO = require('@/assets/images/jitpluslogo.png');

function getCategoryEmoji(categorie?: string | null): string | null {
  if (!categorie) return null;
  return CATEGORY_EMOJI[categorie.toUpperCase()] ?? null;
}

interface Props {
  userPoints?: number;
  categorie?: string | null;
}

const MapMarker = memo(function MapMarker({ userPoints = 0, categorie }: Props) {
  const hasBadge = userPoints > 0;
  const emoji = getCategoryEmoji(categorie);

  return (
    <View collapsable={false} style={styles.root}>
      {/* Outer soft glow — widest, faintest layer */}
      <View collapsable={false} style={styles.outerGlow} />
      {/* Mid glow — builds gradient depth */}
      <View collapsable={false} style={styles.glow} />
      {/* Violet ring — solid colour ring behind the white circle */}
      <View collapsable={false} style={styles.ring} />
      {/* White frosted circle with category icon or logo */}
      <View collapsable={false} style={styles.circle}>
        {emoji ? (
          <Text style={styles.emoji}>{emoji}</Text>
        ) : (
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        )}
      </View>
      {/* Pin tail — small triangle pointing down */}
      <View collapsable={false} style={styles.pinTail} />
      {/* Points badge — premium violet pill */}
      {hasBadge && (
        <View collapsable={false} style={styles.badge}>
          <Text style={styles.badgeText}>
            {userPoints > 999 ? '999+' : String(userPoints)}
          </Text>
        </View>
      )}
    </View>
  );
});

export default MapMarker;

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: TOTAL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: (SIZE - CIRCLE) / 2 - 2,
  },
  outerGlow: {
    position: 'absolute',
    top: (TOTAL_HEIGHT - OUTER_GLOW) / 2 - PIN_TAIL / 2,
    width: OUTER_GLOW,
    height: OUTER_GLOW,
    borderRadius: OUTER_GLOW / 2,
    backgroundColor: VIOLET_LIGHT,
    opacity: 0.07,
  },
  glow: {
    position: 'absolute',
    top: (TOTAL_HEIGHT - GLOW) / 2 - PIN_TAIL / 2,
    width: GLOW,
    height: GLOW,
    borderRadius: GLOW / 2,
    backgroundColor: VIOLET,
    opacity: 0.12,
  },
  ring: {
    position: 'absolute',
    top: (TOTAL_HEIGHT - RING) / 2 - PIN_TAIL / 2,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    backgroundColor: VIOLET,
    opacity: 0.22,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: VIOLET,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 0 },
      default: {
        shadowColor: VIOLET,
        shadowOpacity: 0.18,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
      },
    }),
  },
  emoji: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  pinTail: {
    width: 10,
    height: PIN_TAIL,
    backgroundColor: VIOLET,
    opacity: 0.35,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    marginTop: -1,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: VIOLET,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 13,
    includeFontPadding: false,
  },
});
