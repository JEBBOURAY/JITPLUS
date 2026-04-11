import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
}

export interface PlaceDetailsResult {
  geometry: { location: { lat: number; lng: number } };
  formatted_address?: string;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

export interface GeoResult {
  geometry: { location: { lat: number; lng: number } };
  formatted_address?: string;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
}

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  private readonly apiKey: string;
  /** Cache TTL for geocode results (1 hour) */
  private static readonly CACHE_TTL = 60 * 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY', '');
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY is not set — geocode endpoints will return empty results');
    }
  }

  async autocomplete(input: string, ville?: string, lat?: number, lng?: number): Promise<PlacePrediction[]> {
    if (!this.apiKey || input.trim().length < 2) return [];

    const cacheKey = `geo:ac:${input}:${ville || ''}:${lat ?? ''}:${lng ?? ''}`;
    const cached = await this.cache.get<PlacePrediction[]>(cacheKey);
    if (cached) return cached;

    const query = ville ? `${input}, ${ville}` : input;
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&components=country:ma&language=fr&key=${this.apiKey}`;

    // Location bias: prioritize results near user (50km radius)
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      url += `&location=${lat},${lng}&radius=50000`;
    }

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'OK' && json.predictions) {
        const results = json.predictions.slice(0, 5);
        await this.cache.set(cacheKey, results, GeocodeService.CACHE_TTL);
        return results;
      }
      if (json.status !== 'ZERO_RESULTS') {
        this.logger.warn(`Places Autocomplete status: ${json.status} — ${json.error_message || ''}`);
      }
    } catch (e) {
      this.logger.error('Places Autocomplete fetch failed', e);
    }
    return [];
  }

  async placeDetails(placeId: string): Promise<PlaceDetailsResult | null> {
    if (!this.apiKey || !placeId) return null;

    const cacheKey = `geo:pd:${placeId}`;
    const cached = await this.cache.get<PlaceDetailsResult>(cacheKey);
    if (cached) return cached;

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,formatted_address,address_components&language=fr&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'OK' && json.result) {
        await this.cache.set(cacheKey, json.result, GeocodeService.CACHE_TTL);
        return json.result;
      }
      this.logger.warn(`Place Details status: ${json.status} — ${json.error_message || ''}`);
    } catch (e) {
      this.logger.error('Place Details fetch failed', e);
    }
    return null;
  }

  async forwardGeocode(address: string): Promise<GeoResult[]> {
    if (!this.apiKey || !address.trim()) return [];

    const sanitized = address.trim().slice(0, 200);
    const cacheKey = `geo:fg:${sanitized}`;
    const cached = await this.cache.get<GeoResult[]>(cacheKey);
    if (cached) return cached;

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(sanitized)}&region=ma&language=fr&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'OK' && json.results?.length > 0) {
        await this.cache.set(cacheKey, json.results, GeocodeService.CACHE_TTL);
        return json.results;
      }
      if (json.status !== 'ZERO_RESULTS') {
        this.logger.warn(`Forward geocode status: ${json.status} — ${json.error_message || ''}`);
      }
    } catch (e) {
      this.logger.error('Forward geocode fetch failed', e);
    }
    return [];
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeoResult[]> {
    if (!this.apiKey) return [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return [];
    }

    const cacheKey = `geo:rg:${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = await this.cache.get<GeoResult[]>(cacheKey);
    if (cached) return cached;

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=fr&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'OK' && json.results?.length > 0) {
        await this.cache.set(cacheKey, json.results, GeocodeService.CACHE_TTL);
        return json.results;
      }
      if (json.status !== 'ZERO_RESULTS') {
        this.logger.warn(`Reverse geocode status: ${json.status} — ${json.error_message || ''}`);
      }
    } catch (e) {
      this.logger.error('Reverse geocode fetch failed', e);
    }
    return [];
  }
}
