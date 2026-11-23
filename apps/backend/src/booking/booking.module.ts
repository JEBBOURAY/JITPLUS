import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MerchantPlanModule } from '../merchant/merchant-plan.module';
import { BookingAvailabilityService } from './booking-availability.service';
import { BookingNotifyService } from './booking-notify.service';
import { BookingClientService } from './booking-client.service';
import { BookingMerchantService } from './booking-merchant.service';
import { BookingTasksService } from './booking-tasks.service';
import { BookingAdminController, BookingAdminService } from './booking-admin';
import { BookingClientController, BookingMerchantController, BookingPublicController } from './booking.controllers';

/**
 * Appointment booking. Open to every plan (no PremiumGuard).
 * FirebaseModule and EventsModule are global.
 */
@Module({
  imports: [PrismaModule, NotificationsModule, MerchantPlanModule],
  controllers: [BookingPublicController, BookingClientController, BookingMerchantController, BookingAdminController],
  providers: [
    BookingAvailabilityService,
    BookingNotifyService,
    BookingClientService,
    BookingMerchantService,
    BookingTasksService,
    BookingAdminService,
  ],
  exports: [BookingMerchantService, BookingNotifyService],
})
export class BookingModule {}
