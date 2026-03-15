/**
 * ClusterMarker — Premium cluster pin when merchants overlap at low zoom.
 *
 * Design: layered violet glow rings → solid violet circle → white bold count.
 * Consistent with the MapMarker violet identity.
 *
 * CRITICAL Android rules for react-native-maps custom markers:
 *  - collapsable={false} on ALL Views
 *  - Root = plain View with FIXED pixel dimensions
 *  - NO Animated.View, NO elevation, NO SVG
 *  - Use View opacity instead of rgba() backgrounds (bitmap capture issue)
 */
import { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

const VIOLET = '#7C3AED';
const VIOLET_LIGHT = '#A78BFA';

// Circle grows from 42px (2 merchants) to 68px (50+ merchants)
const MIN_CIRCLE = 42;
const MAX_CIRCLE = 68;
const MAX_ROOT = MAX_CIRCLE + 30; // 98

function getCircleSize(count: number): number {
  const t = Math.min((count - 2) / 48, 1);
  return Math.round(MIN_CIRCLE + t * (MAX_CIRCLE - MIN_CIRCLE));
}

function getFontSize(circleSize: number): number {
  return Math.round(circleSize * 0.36);
}

interface Props {
  count: number;
}

const ClusterMarker = memo(function ClusterMarker({ count }: Props) {
  const circle = getCircleSize(count);
  const midRing = circle + 12;
  const outerRing = circle + 22;
  const fs = getFontSize(circle);

  return (
    <View collapsable={false} style={styles.root}>
      {/* Outer soft glow */}
      <View
        collapsable={false}
        style={{
          position: 'absolute',
          width: outerRing,
          height: outerRing,
          borderRadius: outerRing / 2,
          backgroundColor: VIOLET_LIGHT,
          opacity: 0.10,
        }}
      />
      {/* Mid glow ring */}
      <View
        collapsable={false}
        style={{
          position: 'absolute',
          width: midRing,
          height: midRing,
          borderRadius: midRing / 2,
          backgroundColor: VIOLET,
          opacity: 0.18,
        }}
      />
      {/* Solid violet circle with count */}
      <View
        collapsable={false}
        style={{
          width: circle,
          height: circle,
          borderRadius: circle / 2,
          backgroundColor: VIOLET,
          borderWidth: 3,
          borderColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          ...Platform.select({ android: { elevation: 0 }, default: {} }),
        }}
      >
        <Text
          style={{
            fontSize: fs,
            fontWeight: '900',
            color: '#FFFFFF',
            lineHeight: fs + 2,
            includeFontPadding: false,
            letterSpacing: -0.5,
          }}
        >
          {count > 99 ? '99+' : String(count)}
        </Text>
      </View>
    </View>
  );
});

export default ClusterMarker;

const styles = StyleSheet.create({
  root: {
    width: MAX_ROOT,
    height: MAX_ROOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

