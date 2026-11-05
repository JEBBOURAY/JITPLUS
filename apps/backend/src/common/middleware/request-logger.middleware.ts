import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method } = req;
    // Path only: query strings carry bearer secrets (email-unsubscribe JWT,
    // claim / stamp-code tokens, search terms with phone numbers) that must
    // not land in Cloud Logging (security audit 2026-11-05).
    const path = req.originalUrl.split('?')[0];
    const userAgent = (req.get('user-agent') || '-').slice(0, 200);
    const start = Date.now();

    // Correlation ID: reuse the caller's only if it is a sane token, so a
    // client cannot inject arbitrary text / huge values into the logs.
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;

      // GreenOps: only log errors (4xx/5xx) and slow requests (>1s)
      // to reduce Cloud Logging ingestion costs ($0.50/GB).
      if (statusCode >= 400) {
        const level = statusCode >= 500 ? 'error' : 'warn';
        this.logger[level](
          `[${requestId}] ${method} ${path} ${statusCode} ${duration}ms — ${userAgent}`,
        );
      } else if (duration > 1000) {
        this.logger.warn(
          `[${requestId}] SLOW ${method} ${path} ${statusCode} ${duration}ms`,
        );
      }
    });

    next();
  }
}
