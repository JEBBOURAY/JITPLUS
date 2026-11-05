import { Request } from 'express';
import { AuditLogContext } from './audit-log.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

// ── Helper: client IP for the audit trail ───────────────────────────────────
// req.ip already resolves X-Forwarded-For through `trust proxy` (main.ts),
// counting only trusted hops. The left-most XFF entry is client-controlled
// and would let a caller write any IP into audit_logs.
export function extractIp(req: Request): string {
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
