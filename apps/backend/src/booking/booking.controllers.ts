import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_TTL } from '../common/constants';
import { ClientOnlyGuard } from '../common/guards/client-only.guard';
import { MerchantTypeGuard } from '../auth/guards/merchant-type.guard';
import { MerchantOwnerGuard } from '../auth/guards/merchant-owner.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { BookingClientService } from './booking-client.service';
import { BookingMerchantService, MERCHANT_BOOKING_ACTIONS, MerchantBookingAction } from './booking-merchant.service';
import {
  AgendaQueryDto,
  AvailabilityQueryDto,
  AvailableDaysQueryDto,
  CancelBookingDto,
  ClientBookingsQueryDto,
  ClientCreateBookingDto,
  CreateExceptionDto,
  CreateServiceDto,
  MerchantCreateBookingDto,
  RescheduleBookingDto,
  SearchBookingQueryDto,
  SetHoursDto,
  UpdateBookingSettingsDto,
  UpdateServiceDto,
} from './dto';

function positionOf(q: SearchBookingQueryDto) {
  return q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;
}

/** Read by the merchant page of the JitPlus app, signed in or not. */
@ApiTags('booking – Public')
@Controller('booking/merchants')
export class BookingPublicController {
  constructor(private readonly client: BookingClientService) {}

  /** "Rendez-vous" tab for guests: shops taking bookings, nearest first. */
  @Get('search')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  search(@Query() q: SearchBookingQueryDto) {
    return this.client.searchServices(positionOf(q));
  }

  @Get(':merchantId/offer')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 60 } })
  offer(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    return this.client.merchantOffer(merchantId);
  }

  /** Days of the bookable window with at least one free slot for the service: the client app greys out the others. */
  @Get(':merchantId/availability/days')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  availableDays(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Query() q: AvailableDaysQueryDto) {
    return this.client.availableDays(merchantId, q.serviceId);
  }

  @Get(':merchantId/availability')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 60 } })
  availability(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Query() q: AvailabilityQueryDto) {
    return this.client.availabilityForDay(merchantId, q.serviceId, q.date);
  }
}

@ApiTags('booking – Client')
@ApiBearerAuth()
@Controller('booking/client')
@UseGuards(AuthGuard('jwt'), ClientOnlyGuard)
export class BookingClientController {
  constructor(private readonly client: BookingClientService) {}

  /** "Rendez-vous" tab: the client's shops first, then the nearest; blocked shops left out. */
  @Get('search')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  search(@CurrentUser() user: JwtPayload, @Query() q: SearchBookingQueryDto) {
    return this.client.searchServices(positionOf(q), user.sub);
  }

  @Post('merchants/:merchantId/bookings')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Body() dto: ClientCreateBookingDto,
  ) {
    return this.client.create(user.sub, merchantId, dto);
  }

  @Get('bookings')
  list(@CurrentUser() user: JwtPayload, @Query() q: ClientBookingsQueryDto) {
    return this.client.list(user.sub, q.scope);
  }

  @Get('bookings/:id')
  get(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.client.get(user.sub, id);
  }

  @Post('bookings/:id/cancel')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 10 } })
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto) {
    return this.client.cancel(user.sub, id, dto.reason);
  }
}

/**
 * Pro app. Open to every plan. Owner-only for configuration; team members
 * read the agenda and handle bookings.
 */
@ApiTags('booking – Merchant')
@ApiBearerAuth()
@Controller('booking/merchant')
@UseGuards(AuthGuard('jwt'), MerchantTypeGuard)
export class BookingMerchantController {
  constructor(private readonly merchant: BookingMerchantService) {}

  @Get('setup')
  setup(@CurrentUser() user: JwtPayload) {
    return this.merchant.setup(user.sub);
  }

  @Put('settings')
  @UseGuards(MerchantOwnerGuard)
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBookingSettingsDto) {
    return this.merchant.updateSettings(user.sub, dto);
  }

  // ── Services ──
  @Post('services')
  @UseGuards(MerchantOwnerGuard)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  createService(@CurrentUser() user: JwtPayload, @Body() dto: CreateServiceDto) {
    return this.merchant.createService(user.sub, dto);
  }

  @Patch('services/:id')
  @UseGuards(MerchantOwnerGuard)
  updateService(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto) {
    return this.merchant.updateService(user.sub, id, dto);
  }

  @Delete('services/:id')
  @UseGuards(MerchantOwnerGuard)
  deleteService(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.merchant.deleteService(user.sub, id);
  }

  // ── Hours of the calendar ──
  @Put('hours')
  @UseGuards(MerchantOwnerGuard)
  setHours(@CurrentUser() user: JwtPayload, @Body() dto: SetHoursDto) {
    return this.merchant.setHours(user.sub, dto.ranges);
  }

  // ── Closures ──
  @Post('exceptions')
  @UseGuards(MerchantOwnerGuard)
  createException(@CurrentUser() user: JwtPayload, @Body() dto: CreateExceptionDto) {
    return this.merchant.createException(user.sub, dto);
  }

  @Delete('exceptions/:id')
  @UseGuards(MerchantOwnerGuard)
  deleteException(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.merchant.deleteException(user.sub, id);
  }

  // ── Agenda and bookings (owner and team) ──
  @Get('agenda')
  agenda(@CurrentUser() user: JwtPayload, @Query() q: AgendaQueryDto) {
    return this.merchant.agenda(user.sub, q);
  }

  @Get('bookings/pending')
  pending(@CurrentUser() user: JwtPayload) {
    return this.merchant.pending(user.sub);
  }

  @Post('bookings')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  createBooking(@CurrentUser() user: JwtPayload, @Body() dto: MerchantCreateBookingDto) {
    return this.merchant.createBooking(user.sub, dto);
  }

  @Get('bookings/:id')
  getOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.merchant.getOne(user.sub, id);
  }

  // Declared before bookings/:id/:action, which would otherwise take "reschedule" as an action.
  @Post('bookings/:id/reschedule')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 30 } })
  reschedule(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleBookingDto) {
    return this.merchant.reschedule(user.sub, id, dto);
  }

  @Post('bookings/:id/:action')
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: 60 } })
  setStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: string,
    @Body() dto: CancelBookingDto,
  ) {
    if (!MERCHANT_BOOKING_ACTIONS.includes(action as MerchantBookingAction)) {
      throw new BadRequestException('error.booking.unknownAction');
    }
    return this.merchant.setStatus(user.sub, id, action as MerchantBookingAction, dto.reason);
  }
}
