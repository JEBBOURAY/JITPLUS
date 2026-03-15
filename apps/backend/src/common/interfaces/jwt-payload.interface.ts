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
  teamMemberId?: string;
  teamMemberName?: string;
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
  teamMemberId?: string;
  teamMemberName?: string;
  /** Standard JWT fields */
  iat?: number;
  exp?: number;
}
