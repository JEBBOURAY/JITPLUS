import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

/** Discreet diamond grid used as a zellige watermark on gradients. */
function ZelligePattern({ cells, spacing }: { cells: number; spacing: number }) {
  const items = useMemo(() => Array.from({ length: cells }, (_, i) => i), [cells]);
  return (
    <View style={styles.pattern} pointerEvents="none">
      {items.map((i) => (
        <View key={i} style={[styles.cell, { margin: spacing }]} />
      ))}
    </View>
  );
}

export default React.memo(ZelligePattern);

const styles = StyleSheet.create({
  pattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    alignContent: 'space-evenly',
  },
  cell: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '45deg' }],
  },
});
