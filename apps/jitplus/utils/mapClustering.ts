/**
 * Advanced map clustering using Supercluster.
 *
 * Provides intelligent clustering based on zoom level and viewport.
 * Handles marker aggregation and expansion logic.
 */
import { useState, useEffect, useRef } from 'react';
import Supercluster, { type AnyProps } from 'supercluster';
import type { Merchant } from '@/types';
import { getDistanceKm } from '@/utils/distance';

/** Minimum pan distance (km) required to trigger a cluster recalculation. */
const RECLUSTER_PAN_THRESHOLD_KM = 0.5;
/** Minimum latitudeDelta change required to trigger a cluster recalculation on zoom. */
const RECLUSTER_ZOOM_THRESHOLD = 0.004;

export interface ClusterItem {
  type: 'merchant';
  id: string;
  merchant: Merchant;
  latitude: number;
  longitude: number;
}

export interface ClusterGroup {
  type: 'cluster';
  id: string;
  count: number;
  latitude: number;
  longitude: number;
  expansionZoom: number;
}

export type MapItem = ClusterItem | ClusterGroup;

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Hook to manage clustering of merchants.
 *
 * Uses a single effect that loads data into the Supercluster index and then
 * queries it for the current viewport. This eliminates the race condition
 * between separate load/query effects and ensures clustering always runs
 * with up-to-date data.
 */
export function useMapClustering(
  merchants: Merchant[],
  region: Region,
): MapItem[] {
  const [mapItems, setMapItems] = useState<MapItem[]>([]);

  // Lazy-init Supercluster once (avoids re-creating on every render)
  const clusterRef = useRef<Supercluster<AnyProps, AnyProps> | null>(null);
  if (!clusterRef.current) {
    clusterRef.current = new Supercluster({ radius: 45, maxZoom: 16 });
  }

  /** Last region for which clusters were actually computed (FinOps: skip tiny pans). */
  const lastClusteredRegionRef = useRef<Region | null>(null);
  /** Track merchants identity so we force recluster when data changes. */
  const prevMerchantsRef = useRef<Merchant[]>([]);

  useEffect(() => {
    // ── Empty data → clear markers ──
    if (!merchants.length) {
      prevMerchantsRef.current = merchants;
      lastClusteredRegionRef.current = null;
      setMapItems((prev) => (prev.length ? [] : prev));
      return;
    }

    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    const dataChanged = merchants !== prevMerchantsRef.current;

    // ── Reload index when merchants data changes ──
    if (dataChanged) {
      const points = merchants
        .filter((m) => m.latitude != null && m.longitude != null && isFinite(m.latitude) && isFinite(m.longitude))
        .map((m) => ({
          type: 'Feature' as const,
          properties: { ...m, cluster: false, merchantId: m.id, pointId: m.storeId ? `${m.id}-${m.storeId}` : m.id },
          geometry: {
            type: 'Point' as const,
            coordinates: [m.longitude!, m.latitude!],
          },
        }));

      try {
        // Supercluster type expects GeoJSON features, which we provide.
        clusterRef.current!.load(points as unknown as GeoJSON.Feature<GeoJSON.Point, any>[]);
      } catch (e) {
        if (__DEV__) console.warn('[mapClustering] Supercluster.load failed', e);
        return;
      }
      prevMerchantsRef.current = merchants;
      // Reset guard so we always recluster after a data reload
      lastClusteredRegionRef.current = null;
    }

    // ── FinOps guard: skip reclustering if the viewport barely moved ──
    if (lastClusteredRegionRef.current) {
      const prev = lastClusteredRegionRef.current;
      const panKm = getDistanceKm(prev.latitude, prev.longitude, latitude, longitude);
      const zoomDelta = Math.abs(prev.latitudeDelta - latitudeDelta);
      if (panKm < RECLUSTER_PAN_THRESHOLD_KM && zoomDelta < RECLUSTER_ZOOM_THRESHOLD) {
        return;
      }
    }
    lastClusteredRegionRef.current = region;

    // ── Compute clusters ──
    try {
      const safeDelta = Math.max(longitudeDelta, 0.001);
      const zoom = Math.min(Math.round(Math.log2(360 / safeDelta)), 20);

      const padding = 0.5;
      const minLng = longitude - (longitudeDelta * (1 + padding)) / 2;
      const minLat = latitude - (latitudeDelta * (1 + padding)) / 2;
      const maxLng = longitude + (longitudeDelta * (1 + padding)) / 2;
      const maxLat = latitude + (latitudeDelta * (1 + padding)) / 2;

      const clusters = clusterRef.current!.getClusters(
        [minLng, minLat, maxLng, maxLat],
        zoom,
      );

      const newItems: MapItem[] = clusters.map((c) => {
        const [lng, lat] = c.geometry.coordinates;
        const props = c.properties as any;

        if (props.cluster) {
          return {
            type: 'cluster' as const,
            id: `cluster-${props.cluster_id}`,
            count: props.point_count,
            latitude: lat,
            longitude: lng,
            expansionZoom: clusterRef.current!.getClusterExpansionZoom(
              props.cluster_id,
            ),
          };
        }

        return {
          type: 'merchant' as const,
          id: props.pointId ?? props.merchantId,
          merchant: props as Merchant,
          latitude: lat,
          longitude: lng,
        };
      });

      setMapItems(newItems);
    } catch (e) {
      if (__DEV__) console.warn('[mapClustering] getClusters failed', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchants, region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta]);

  return mapItems;
}

