import { memo, useCallback, useMemo } from 'react';
import type { Merchant } from '@/types';
import MapMarker from '@/components/MapMarker';
import ClusterMarker from '@/components/ClusterMarker';
import TrackedMarker from './TrackedMarker';
import { pointName } from '@/utils/merchantPoint';

const CENTER_ANCHOR = { x: 0.5, y: 0.5 } as const;

/**
 * Markers take primitive props so the memo holds across re-clustering, which
 * rebuilds every map item object on each region change.
 */
export const MerchantPin = memo(function MerchantPin({ merchant, latitude, longitude, onPress }: {
  merchant: Merchant;
  latitude: number;
  longitude: number;
  onPress: (merchant: Merchant) => void;
}) {
  const coordinate = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  const handlePress = useCallback(() => onPress(merchant), [onPress, merchant]);
  const hasDeal = (merchant.activeDealCount ?? 0) > 0;
  return (
    // Remounting re-enables view tracking, which TrackedMarker turns off after the first draw.
    <TrackedMarker key={hasDeal ? 'deal' : 'plain'} coordinate={coordinate} onPress={handlePress} anchor={CENTER_ANCHOR}>
      <MapMarker hasDeal={hasDeal} label={pointName(merchant)} />
    </TrackedMarker>
  );
});

export const ClusterPin = memo(function ClusterPin({ count, latitude, longitude, expansionZoom, clusterId, onPress }: {
  count: number;
  latitude: number;
  longitude: number;
  expansionZoom: number;
  clusterId: number;
  onPress: (latitude: number, longitude: number, expansionZoom: number, clusterId: number) => void;
}) {
  const coordinate = useMemo(() => ({ latitude, longitude }), [latitude, longitude]);
  const handlePress = useCallback(() => onPress(latitude, longitude, expansionZoom, clusterId), [onPress, latitude, longitude, expansionZoom, clusterId]);
  return (
    <TrackedMarker coordinate={coordinate} onPress={handlePress} anchor={CENTER_ANCHOR}>
      <ClusterMarker count={count} />
    </TrackedMarker>
  );
});
