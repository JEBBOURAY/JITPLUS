/**
 * ClusterMarker — simple square marker showing the exact clustered count.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const VIOLET = '#7C3AED';
const SIZE = 34;

interface Props {
  count: number;
}

const ClusterMarker = memo(function ClusterMarker({ count }: Props) {
  return (
    <View collapsable={false} style={styles.root} accessibilityLabel={`${count} merchants`} accessibilityRole="image">
      <View collapsable={false} style={styles.square}>
        <Text style={styles.countText}>{String(count)}</Text>
      </View>
    </View>
  );
});

export default ClusterMarker;

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  square: {
    width: SIZE,
    height: SIZE,
    borderRadius: 6,
    backgroundColor: VIOLET,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
});

