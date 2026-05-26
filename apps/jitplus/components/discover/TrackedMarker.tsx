import React, { useState, useEffect, memo, type ComponentProps } from 'react';
import { Platform } from 'react-native';
import { Marker } from '@/components/SafeMapView';

// iOS Google Maps snapshots the marker's React view into a bitmap. Once
// tracksViewChanges flips to false, both rendering AND hit-testing are frozen
// against that bitmap, so the inner child MUST be fully laid out + drawn
// before we disable tracking — otherwise the marker is invisible /
// un-tappable. Children (MapMarker / ClusterMarker) are synchronous
// (RN <Image> with a bundled require, or a plain <Text>), so a small delay
// is enough. iOS gets a slightly longer window for extra safety; Android
// hosts the native view directly (no bitmap), but we still disable tracking
// for perf during pan/zoom.
const TRACK_DELAY_MS = Platform.OS === 'ios' ? 700 : 500;

const TrackedMarker = memo(function TrackedMarker(
  props: ComponentProps<typeof Marker>,
) {
  const [tracked, setTracked] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracked(false), TRACK_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return <Marker {...props} tracksViewChanges={tracked} />;
});

export default TrackedMarker;
