import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    // ── NestJS / HTTP exceptions ──
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        // Preserve validation error arrays so clients can show field-level errors
        if (Array.isArray(body.message)) {
          message = body.message;
        } else if ('message' in body) {
          message = body.message as string;
        } else {
          message = res;
        }
      }
    }

    // ── Custom Quota Error ──
    else if (exception instanceof Error && exception.name === 'QuotaExceededError') {
      status = HttpStatus.FORBIDDEN; // 403 Forbidden
      message = 'Limite de messages WhatsApp atteinte. Veuillez contacter le service client pour augmenter votre quota.';
    }

    // ── Email Quota Error ──
    else if (exception instanceof Error && exception.name === 'EmailQuotaExceededError') {
      status = HttpStatus.FORBIDDEN; // 403 Forbidden
      message = 'Limite d\'envoi d\'emails atteinte. Veuillez contacter le service client pour augmenter votre quota.';
    }

    // ── Prisma known errors ──
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // unique constraint
          status = HttpStatus.CONFLICT;
          message = 'Cette ressource existe déjà.';
          break;
        case 'P2025': // record not found
          status = HttpStatus.NOT_FOUND;
          message = 'Ressource introuvable.';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Erreur de base de données.';
      }
    }

    // ── Prisma validation errors ──
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Données invalides.';
    }

    // Capture unexpected server errors in Sentry (5xx only — skip expected 4xx)
    if (status >= 500) {
      Sentry.captureException(exception);
    }

    // Log full details internally — structured JSON for Cloud Logging
    const logPayload = JSON.stringify({
      severity: status >= 500 ? 'ERROR' : 'WARNING',
      httpRequest: {
        requestMethod: request.method,
        requestUrl: request.path,
        status,
        remoteIp: request.ip,
      },
      message: `${request.method} ${request.path} → ${status}`,
      validationErrors: Array.isArray(message) ? message : undefined,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    if (status >= 500) {
      this.logger.error(logPayload);
    } else {
      this.logger.warn(logPayload);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
