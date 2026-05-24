import React, { useState, useEffect, memo, type ComponentProps } from 'react';
import { Marker } from '@/components/SafeMapView';

// Augmenté à 800ms pour laisser le temps au moteur iOS Google Maps 
// de bien "peindre" la vue avant de geler le rendu du marqueur.
const TRACK_DELAY_MS = 800;

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
