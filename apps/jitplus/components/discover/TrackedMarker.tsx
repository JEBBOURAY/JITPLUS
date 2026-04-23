import React, { useState, useEffect, memo, type ComponentProps } from 'react';
import { Platform } from 'react-native';
import { Marker } from '@/components/SafeMapView';

const TRACK_DELAY_MS = 500;
const IS_ANDROID = Platform.OS === 'android';

const TrackedMarker = memo(function TrackedMarker(
  props: ComponentProps<typeof Marker>,
) {
  const [tracked, setTracked] = useState(IS_ANDROID);
  useEffect(() => {
    if (!IS_ANDROID) return;
    const t = setTimeout(() => setTracked(false), TRACK_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return <Marker {...props} tracksViewChanges={tracked} />;
});

export default TrackedMarker;
