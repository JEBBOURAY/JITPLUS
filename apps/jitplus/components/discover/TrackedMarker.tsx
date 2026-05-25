import React, { useState, useEffect, memo, type ComponentProps } from 'react';
import { Marker } from '@/components/SafeMapView';

// iOS Google Maps captures the marker's React view into a bitmap. If
// tracksViewChanges starts false, the snapshot is taken before the child
// (MapMarker / ClusterMarker) is laid out → empty/0-sized icon → marker is
// invisible AND not tappable on iOS. Start true on both platforms, then
// disable tracking after the first render so we keep good perf.
const TRACK_DELAY_MS = 500;

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
