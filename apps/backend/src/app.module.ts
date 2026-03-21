import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MerchantModule } from './merchant/merchant.module';
import { RewardsModule } from './rewards/rewards.module';
import { FirebaseModule } from './firebase/firebase.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClientAuthModule } from './client-auth/client-auth.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { TwilioModule } from './twilio/twilio.module';
import { StorageModule } from './storage/storage.module';
import { AdminModule } from './admin/admin.module';
// GoogleWalletModule temporarily disabled for Play Store compliance
// import { GoogleWalletModule } from './google-wallet/google-wallet.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { OtpCleanupService } from './common/tasks/otp-cleanup.service';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { RepositoryModule } from './common/repositories';
import { EventsModule } from './events';
import { THROTTLE_TTL } from './common/constants';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        DIRECT_DATABASE_URL: Joi.string().optional(),
        DATABASE_POOL_SIZE: Joi.number().integer().min(1).max(50).optional(),
        JWT_SECRET: Joi.string().min(32).required(),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        CORS_ORIGINS: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        GOOGLE_CLIENT_ID: Joi.string().optional(),
        BACKEND_URL: Joi.string().uri().optional(),
        // ── Google Cloud Platform ──────────────────────────────────────────
        GCP_PROJECT_ID: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        GCP_STORAGE_BUCKET_NAME: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        // Cloud SQL instance connection name (PROJECT:REGION:INSTANCE) — used by Cloud SQL proxy / unix socket
        // DATABASE_URL must reference the socket when deployed on Cloud Run:
        //   postgresql://user:pass@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE
        CLOUD_SQL_INSTANCE: Joi.string().optional(),
        // ── External services ─────────────────────────────────────────────
        RESEND_API_KEY: Joi.string().optional(),
        // SMTP — required in production for transactional emails (OTP, welcome, etc.)
        SMTP_HOST: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        SMTP_USER: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        SMTP_PASS: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        SMTP_FROM: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        TWILIO_ACCOUNT_SID: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        TWILIO_AUTH_TOKEN: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        TWILIO_WHATSAPP_FROM: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),

        // Firebase — required in production for push notifications
        FIREBASE_PROJECT_ID: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        FIREBASE_CLIENT_EMAIL: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        FIREBASE_PRIVATE_KEY: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().required(), otherwise: Joi.string().optional() }),
        QR_HMAC_SECRET: Joi.when('NODE_ENV', { is: 'production', then: Joi.string().min(32).required(), otherwise: Joi.string().optional() }),
      }),
      validationOptions: { allowUnknown: true },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: THROTTLE_TTL, limit: 60 }],
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
      ttl: THROTTLE_TTL,
      max: 500,
    }),
    PrismaModule,
    RepositoryModule,
    EventsModule,
    MailModule,
    TwilioModule,
    FirebaseModule,
    StorageModule,
    AuthModule,
    ClientAuthModule,
    MerchantModule,
    RewardsModule,
    NotificationsModule,
    HealthModule,
    AdminModule,
    // GoogleWalletModule, // temporarily disabled for Play Store compliance
  ],
  providers: [
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    OtpCleanupService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*path');
  }
}
