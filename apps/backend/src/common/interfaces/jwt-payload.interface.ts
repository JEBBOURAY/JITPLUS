/**
 * Shape of the JWT payload after token verification.
 * Used across controllers and guards as the `@CurrentUser()` type.
 */
export interface JwtPayload {
  userId: string;
  sub: string;
  email?: string;
  telephone?: string;
  type: 'merchant' | 'team_member' | 'client' | 'qr' | 'admin';
  role?: 'owner' | 'team_member' | 'client' | 'admin';
  sessionId?: string;
  /** ClientSession id of the device that owns the token (client tokens only) */
  clientSessionId?: string;
  teamMemberId?: string;
  teamMemberName?: string;
  /** Token `iat` (seconds). Admin tokens are checked against Admin.tokensValidAfter. */
  issuedAt?: number;
  /** Issue time in ms (admin tokens since 2026-11-23), compared exactly with tokensValidAfter. */
  issuedAtMs?: number;
}

/**
 * Shape of the raw JWT token payload before mapping in jwt.strategy.ts.
 * Matches what `JwtService.sign()` produces.
 */
export interface JwtTokenPayload {
  sub: string;
  email?: string;
  telephone?: string | null;
  type: 'merchant' | 'team_member' | 'client' | 'qr' | 'admin';
  role?: 'owner' | 'team_member' | 'client' | 'admin';
  jti?: string;
  /** ClientSession id (client tokens only) */
  sid?: string;
  teamMemberId?: string;
  teamMemberName?: string;
  /** Standard JWT fields */
  iat?: number;
  exp?: number;
  /** Issue time in ms (admin tokens) */
  iatMs?: number;
}
