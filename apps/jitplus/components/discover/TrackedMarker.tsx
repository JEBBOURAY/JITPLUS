import React, { useState, useEffect, memo, type ComponentProps } from 'react';
import { Marker } from '@/components/SafeMapView';

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
