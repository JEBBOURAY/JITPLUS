import { Controller, Get, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GeocodeService } from './geocode.service';

@ApiTags('Geocode')
@Controller('geocode')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class GeocodeController {
  constructor(private readonly geocodeService: GeocodeService) {}

  /** Google Places Autocomplete proxy — used by address search inputs */
  @Get('autocomplete')
  async autocomplete(
    @Query('input') input?: string,
    @Query('ville') ville?: string,
    @Query('lat') latStr?: string,
    @Query('lng') lngStr?: string,
  ) {
    if (!input || input.trim().length < 2) {
      return { predictions: [] };
    }
    const lat = Number(latStr);
    const lng = Number(lngStr);
    const predictions = await this.geocodeService.autocomplete(
      input,
      ville,
      Number.isFinite(lat) ? lat : undefined,
      Number.isFinite(lng) ? lng : undefined,
    );
    return { predictions };
  }

  /** Google Place Details proxy — returns coordinates for a place_id */
  @Get('place-details')
  async placeDetails(@Query('placeId') placeId?: string) {
    if (!placeId) {
      throw new BadRequestException('placeId is required');
    }
    const result = await this.geocodeService.placeDetails(placeId);
    return { result };
  }

  /** Forward geocode — address string → coordinates */
  @Get('forward')
  async forward(@Query('address') address?: string) {
    if (!address || !address.trim()) {
      return { results: [] };
    }
    const results = await this.geocodeService.forwardGeocode(address);
    return { results };
  }

  /** Reverse geocode — coordinates → address components */
  @Get('reverse')
  async reverse(
    @Query('lat') latStr?: string,
    @Query('lng') lngStr?: string,
  ) {
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new BadRequestException('lat and lng must be valid numbers');
    }
    const results = await this.geocodeService.reverseGeocode(lat, lng);
    return { results };
  }
}
