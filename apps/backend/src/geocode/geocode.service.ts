import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY', '');
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY is not set — geocode endpoints will return empty results');
    }
  }

  async autocomplete(input: string, ville?: string): Promise<PlacePrediction[]> {
    if (!this.apiKey || input.trim().length < 2) return [];

    const query = ville ? `${input}, ${ville}` : input;
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&components=country:ma&language=fr&types=geocode|establishment&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'OK' && json.predictions) {
        return json.predictions.slice(0, 5);
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

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,formatted_address,address_components&language=fr&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'OK' && json.result) {
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
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(sanitized)}&region=ma&language=fr&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'OK' && json.results?.length > 0) {
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

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=fr&key=${this.apiKey}`;

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (json.status === 'OK' && json.results?.length > 0) {
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
