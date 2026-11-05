/**
 * Advanced map clustering using Supercluster.
 *
 * Provides intelligent clustering based on zoom level and viewport.
 * Handles marker aggregation and expansion logic.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import Supercluster, { type AnyProps, type PointFeature } from 'supercluster';
import type { Merchant } from '@/types';
import { pointKey } from '@/utils/merchantPoint';

/**
 * A reference to the merchant, not a copy: spreading it rebuilt every object on
 * each filter keystroke or refetch, so every MerchantPin memo missed and all
 * visible markers re-rendered. Kept as is, React Query's structural sharing
 * keeps unchanged merchants identical across refetches.
 */
interface MerchantPointProps extends AnyProps {
  merchant: Merchant;
  pointId: string;
}

/**
 * When to recalculate, as shares of the visible span. (Fixed thresholds in km
 * or degrees were huge at street level and tiny at country level.)
 *
 * The region handed in already trails the real map by up to 10% (the screen
 * only updates it past that), so the margins add up: 10% lag + 15% pan, with a
 * span up to ~1.16x (5% here, 10% lag), still fits in the queried box, which
 * reaches 0.9 span from the centre. With a 25% pan and a 1.5x box, a few small
 * pans or a pinch out left the screen edges without pins.
 */
const RECLUSTER_PAN_RATIO = 0.15;
const RECLUSTER_SPAN_RATIO = 0.05;
/** The query covers the viewport plus this share of it (1.8x). */
const QUERY_PADDING = 0.8;

/**
 * Highest zoom at which points are still grouped. Kept at the map's own limit
 * so merchants sharing an address (mall, gallery) stay one tappable cluster
 * instead of stacked markers where only the top one can be tapped.
 */
const CLUSTER_MAX_ZOOM = 20;

/** Map zoom level (0–20) of a region, as used by Supercluster. */
function regionZoom(longitudeDelta: number): number {
  return Math.min(Math.round(Math.log2(360 / Math.max(longitudeDelta, 0.0001))), CLUSTER_MAX_ZOOM);
}

interface ClusterItem {
  type: 'merchant';
  id: string;
  merchant: Merchant;
  latitude: number;
  longitude: number;
}

interface ClusterGroup {
  type: 'cluster';
  id: string;
  count: number;
  latitude: number;
  longitude: number;
  expansionZoom: number;
  clusterId: number;
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
): { mapItems: MapItem[]; getClusterLeaves: (clusterId: number) => Merchant[] } {
  const [mapItems, setMapItems] = useState<MapItem[]>([]);

  // Lazy-init Supercluster once (avoids re-creating on every render)
  const clusterRef = useRef<Supercluster<MerchantPointProps, AnyProps> | null>(null);
  if (!clusterRef.current) {
    clusterRef.current = new Supercluster<MerchantPointProps, AnyProps>({ radius: 45, maxZoom: CLUSTER_MAX_ZOOM });
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
      const points: PointFeature<MerchantPointProps>[] = merchants
        .filter((m) => m.latitude != null && m.longitude != null && isFinite(m.latitude) && isFinite(m.longitude))
        .map((m) => ({
          type: 'Feature' as const,
          properties: { merchant: m, pointId: pointKey(m) },
          geometry: {
            type: 'Point' as const,
            coordinates: [m.longitude!, m.latitude!],
          },
        }));

      try {
        clusterRef.current!.load(points);
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
      const sameZoom = regionZoom(prev.longitudeDelta) === regionZoom(longitudeDelta)
        && Math.abs(prev.longitudeDelta - longitudeDelta) < prev.longitudeDelta * RECLUSTER_SPAN_RATIO
        && Math.abs(prev.latitudeDelta - latitudeDelta) < prev.latitudeDelta * RECLUSTER_SPAN_RATIO;
      const smallPan = Math.abs(prev.latitude - latitude) < prev.latitudeDelta * RECLUSTER_PAN_RATIO
        && Math.abs(prev.longitude - longitude) < prev.longitudeDelta * RECLUSTER_PAN_RATIO;
      if (sameZoom && smallPan) return;
    }
    lastClusteredRegionRef.current = region;

    // ── Compute clusters ──
    try {
      const zoom = regionZoom(longitudeDelta);

      const minLng = longitude - (longitudeDelta * (1 + QUERY_PADDING)) / 2;
      const minLat = latitude - (latitudeDelta * (1 + QUERY_PADDING)) / 2;
      const maxLng = longitude + (longitudeDelta * (1 + QUERY_PADDING)) / 2;
      const maxLat = latitude + (latitudeDelta * (1 + QUERY_PADDING)) / 2;

      const clusters = clusterRef.current!.getClusters(
        [minLng, minLat, maxLng, maxLat],
        zoom,
      );

      const newItems: MapItem[] = clusters.map((c) => {
        const [lng, lat] = c.geometry.coordinates;
        const props = c.properties;

        if ('cluster' in props && props.cluster) {
          return {
            type: 'cluster' as const,
            // Supercluster derives ids from the point count, so a reload can give
            // an old id to another cluster. The marker bitmap is frozen after its
            // first draw: without the count in the key it would keep the old number.
            id: `cluster-${props.cluster_id}-${props.point_count}`,
            count: props.point_count,
            latitude: lat,
            longitude: lng,
            expansionZoom: clusterRef.current!.getClusterExpansionZoom(
              props.cluster_id,
            ),
            clusterId: props.cluster_id,
          };
        }

        const point = props as MerchantPointProps;
        return {
          type: 'merchant' as const,
          id: point.pointId,
          merchant: point.merchant,
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

  /** Every merchant of a cluster (for clusters that zooming cannot split). */
  const getClusterLeaves = useCallback((clusterId: number): Merchant[] => {
    try {
      return clusterRef.current!.getLeaves(clusterId, Infinity).map((f) => f.properties.merchant);
    } catch {
      return []; // index reloaded since: the cluster id no longer exists
    }
  }, []);

  return { mapItems, getClusterLeaves };
}

