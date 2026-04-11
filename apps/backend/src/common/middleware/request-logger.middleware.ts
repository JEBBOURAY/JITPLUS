import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const userAgent = req.get('user-agent') || '-';
    const start = Date.now();

    // Generate a unique correlation ID per request
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;

      // GreenOps: only log errors (4xx/5xx) and slow requests (>1s)
      // to reduce Cloud Logging ingestion costs ($0.50/GB).
      if (statusCode >= 400) {
        const level = statusCode >= 500 ? 'error' : 'warn';
        this.logger[level](
          `[${requestId}] ${method} ${originalUrl} ${statusCode} ${duration}ms — ${userAgent}`,
        );
      } else if (duration > 1000) {
        this.logger.warn(
          `[${requestId}] SLOW ${method} ${originalUrl} ${statusCode} ${duration}ms`,
        );
      }
    });

    next();
  }
}
