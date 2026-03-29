// ── Sentry must be initialized before all other imports ────────────────────
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.0,
});
// ── End Sentry init ──────────────────────────────────────────────────────────

import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  Logger,
  BadRequestException,
  RequestMethod,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationError } from 'class-validator';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DEFAULT_PORT } from './common/constants';
import { flattenValidationErrors } from './common/utils/validation-i18n';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust proxy (required for correct IP behind load balancer / reverse proxy)
  // Cloud Run may involve multiple proxies; use 'true' to trust the leftmost X-Forwarded-For
  app.set('trust proxy', true);

  // Compress HTTP responses (reduces JSON payload size by 60-80%)
  app.use(compression());

  // Body size limit
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  const isProd = process.env.NODE_ENV === 'production';

  // Security headers
  app.use(helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'none'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https://storage.googleapis.com'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            frameAncestors: ["'none'"],
          },
        }
      : false, // disable CSP in dev to allow Swagger UI
  }));

  // ── API Versioning ────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'uploads/*path', method: RequestMethod.ALL },
    ],
  });

  // Serve uploaded files locally (dev only — in production GCS serves them)
  if (!isProd) {
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads/',
    });
  }

  // CORS — configurable via CORS_ORIGINS (CSV)
  const corsOrigins = process.env.CORS_ORIGINS;
  if (isProd && !corsOrigins) {
    throw new Error('[SECURITY] CORS_ORIGINS must be defined in production');
  }
  if (isProd && corsOrigins === '*') {
    throw new Error('[SECURITY] CORS_ORIGINS must not be "*" in production — specify exact origins');
  }
  const allowedOrigins = corsOrigins
    ? corsOrigins.split(',').map((o) => o.trim())
    : '*';
  app.enableCors({
    origin: allowedOrigins,
    credentials: Array.isArray(allowedOrigins),
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global exception filter — sanitize internal errors
  app.useGlobalFilters(new AllExceptionsFilter());

  // Validation globale — messages d'erreur en français
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const messages = flattenValidationErrors(errors);
        return new BadRequestException(messages);
      },
    }),
  );

  // ── Swagger / OpenAPI (dev only) ──────────────────────────
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('JitPlus API')
      .setDescription('API documentation for the JitPlus loyalty platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || DEFAULT_PORT;
  const logger = new Logger('Bootstrap');

  // Disable JSON pretty-print in production (saves ~15% bandwidth)
  if (isProd) {
    app.getHttpAdapter().getInstance().set('json spaces', 0);
  }

  // Enable graceful shutdown hooks (required for Prisma disconnect)
  app.enableShutdownHooks();
  
  // ── HTTP Keep-Alive for Cloud Run ──────────────────────────
  // Cloud Run's LB has an idle timeout (~600s). Setting keepAliveTimeout
  // higher avoids race conditions where the server closes a connection
  // just as the LB sends a new request. This lets mobile clients reuse
  // TLS connections across successive API calls (no repeated handshakes).
  const server = app.getHttpServer();
  server.keepAliveTimeout = 620_000;   // 620s > Cloud Run's 600s idle timeout
  server.headersTimeout = 625_000;     // must be > keepAliveTimeout

  // Listen on 0.0.0.0 (required for Docker and Expo Go on physical device)
  // In production behind Docker, use BIND_HOST env to override if needed
  const host = process.env.BIND_HOST || '0.0.0.0';
  await app.listen(port, host);

  logger.log(`Backend JitPlus démarré sur http://${host}:${port}`);
  if (!isProd) {
    logger.log(`Swagger docs → http://localhost:${port}/api/docs`);
  }
}

bootstrap();
