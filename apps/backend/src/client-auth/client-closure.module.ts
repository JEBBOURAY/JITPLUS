import { Module } from '@nestjs/common';
import { BookingModule } from '../booking/booking.module';
import { ClientClosureService } from './client-closure.service';

/** Separate from ClientAuthModule: the admin needs the closure, not client sign-in. */
@Module({
  imports: [BookingModule],
  providers: [ClientClosureService],
  exports: [ClientClosureService],
})
export class ClientClosureModule {}
