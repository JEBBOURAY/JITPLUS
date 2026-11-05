import { Request } from 'express';
import { AuditLogContext } from './audit-log.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

// ── Helper: extract real client IP (respects X-Forwarded-For) ────────────────
export function extractIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }
  return req.ip ?? 'unknown';
}

// ── Helper: build audit context from JWT + HTTP request ──────────────────────
export function buildCtx(user: JwtPayload, req: Request): AuditLogContext {
  return {
    adminId: user.sub,
    adminEmail: user.email ?? 'unknown',
    ipAddress: extractIp(req),
    userAgent: (req.headers['user-agent'] as string | undefined) ?? undefined,
  };
}
