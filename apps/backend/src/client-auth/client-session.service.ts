import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash, randomUUID } from 'crypto';
import {
  CLIENT_REPOSITORY, type IClientRepository,
  CLIENT_SESSION_REPOSITORY, type IClientSessionRepository,
} from '../common/repositories';
import { CLIENT_REFRESH_TOKEN_DAYS, MAX_SESSIONS_PER_CLIENT, MS_PER_DAY } from '../common/constants';
import { CLIENT_AUTH_SELECT } from '../common/prisma-selects';

/** Shape returned by buildAuthResponse — access + refresh tokens + client data. */
export interface ClientAuthResponse {
  access_token: string;
  refresh_token: string;
  isNewUser: boolean;
  client: {
    id: string;
    prenom: string | null;
    nom: string | null;
    email: string | null;
    emailVerified: boolean;
    telephone: string | null;
    telephoneVerified: boolean;
    termsAccepted: boolean;
    shareInfoMerchants: boolean;
    notifPush: boolean;
    notifWhatsapp: boolean;
    dateNaissance: Date | null;
    hasPassword: boolean;
    createdAt: Date;
  };
}

/** Client fields accepted by buildAuthResponse. */
export interface ClientAuthSubject {
  id: string;
  nom: string | null;
  prenom?: string | null;
  email: string | null;
  emailVerified?: boolean;
  telephone: string | null;
  telephoneVerified?: boolean;
  googleId?: string | null;
  password?: string | null;
  shareInfoMerchants?: boolean;
  notifPush?: boolean;
  notifWhatsapp?: boolean;
  termsAccepted?: boolean;
  dateNaissance?: Date | null;
  createdAt: Date;
}

/**
 * Client multi-device sessions: one ClientSession (hashed refresh token) per
 * device, access tokens bound to it (`sid`), rotation on refresh, logout.
 */
@Injectable()
export class ClientSessionService {
  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @Inject(CLIENT_SESSION_REPOSITORY) private clientSessionRepo: IClientSessionRepository,
    private jwtService: JwtService,
  ) {}

  /** Generate a cryptographically random refresh token */
  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  /** SHA-256 hash of the refresh token (stored in DB) */
  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTokenExpiry(): Date {
    return new Date(Date.now() + CLIENT_REFRESH_TOKEN_DAYS * MS_PER_DAY);
  }

  /** Access token bound to the device session (`sid`) so logout can target that device only. */
  private signAccessToken(
    client: { id: string; telephone: string | null; email: string | null },
    sessionId: string,
  ): string {
    return this.jwtService.sign({
      sub: client.id,
      jti: randomUUID(),
      sid: sessionId,
      telephone: client.telephone,
      email: client.email,
      type: 'client' as const,
      role: 'client' as const,
    });
  }

  /**
   * Opens a session for a new device login. Expired sessions are purged and
   * the least recently used ones beyond MAX_SESSIONS_PER_CLIENT are evicted.
   */
  private async createSession(clientId: string): Promise<{ sessionId: string; refresh_token: string }> {
    const refresh_token = this.generateRefreshToken();
    const session = await this.clientSessionRepo.create({
      data: {
        clientId,
        refreshTokenHash: this.hashRefreshToken(refresh_token),
        expiresAt: this.refreshTokenExpiry(),
      },
      select: { id: true },
    });

    await this.clientSessionRepo.deleteMany({ where: { clientId, expiresAt: { lt: new Date() } } });
    const evicted = await this.clientSessionRepo.findMany({
      where: { clientId },
      orderBy: { lastUsedAt: 'desc' },
      skip: MAX_SESSIONS_PER_CLIENT,
      select: { id: true },
    });
    if (evicted.length > 0) {
      await this.clientSessionRepo.deleteMany({ where: { id: { in: evicted.map((s) => s.id) } } });
    }

    return { sessionId: session.id, refresh_token };
  }

  /** Revokes every session of the client except `keepSessionId` (the device making the change). */
  async revokeOtherSessions(clientId: string, keepSessionId?: string): Promise<void> {
    await this.clientSessionRepo.deleteMany({
      where: { clientId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
    });
  }

  async buildAuthResponse(client: ClientAuthSubject, isNewUser: boolean): Promise<ClientAuthResponse> {
    const { sessionId, refresh_token } = await this.createSession(client.id);
    const access_token = this.signAccessToken(client, sessionId);

    return {
      access_token,
      refresh_token,
      isNewUser,
      client: {
        id: client.id,
        prenom: client.prenom ?? null,
        nom: client.nom,
        email: client.email,
        emailVerified: client.emailVerified ?? false,
        telephone: client.telephone ?? null,
        telephoneVerified: client.telephoneVerified ?? false,
        termsAccepted: client.termsAccepted ?? false,
        shareInfoMerchants: client.shareInfoMerchants ?? false,
        notifPush: client.notifPush ?? true,
        notifWhatsapp: client.notifWhatsapp ?? true,
        dateNaissance: client.dateNaissance ?? null,
        hasPassword: !!client.password,
        createdAt: client.createdAt,
      },
    };
  }

  /**
   * Logout: revoke this device's session so its refresh token cannot be reused.
   */
  async logout(clientId: string, sessionId?: string): Promise<{ success: boolean; message: string }> {
    // Tokens issued before multi-device sessions carry no sid: revoke them all.
    await this.clientSessionRepo.deleteMany({
      where: { clientId, ...(sessionId ? { id: sessionId } : {}) },
    });
    await this.clientRepo.update({
      where: { id: clientId },
      data: { pushToken: null },
    });
    return { success: true, message: 'Déconnexion réussie' };
  }

  /**
   * Refresh the access token using a valid refresh token.
   * Implements token rotation: the old refresh token is invalidated and a new one issued.
   */
  async refreshAccessToken(refreshToken: string): Promise<Omit<ClientAuthResponse, 'isNewUser'> & { client: ClientAuthResponse['client'] }> {
    const hash = this.hashRefreshToken(refreshToken);

    const session = await this.clientSessionRepo.findUnique({
      where: { refreshTokenHash: hash },
      select: { id: true, expiresAt: true, client: { select: CLIENT_AUTH_SELECT } },
    });

    if (!session) {
      throw new UnauthorizedException('error.auth.refreshInvalid');
    }

    if (session.expiresAt < new Date()) {
      await this.clientSessionRepo.delete({ where: { id: session.id } }).catch(() => {});
      throw new UnauthorizedException('error.auth.refreshExpired');
    }

    const client = session.client;
    const new_refresh_token = this.generateRefreshToken();

    // Conditional on the old hash: if two refreshes race with the same token,
    // only the first one rotates it.
    const { count } = await this.clientSessionRepo.updateMany({
      where: { id: session.id, refreshTokenHash: hash },
      data: {
        refreshTokenHash: this.hashRefreshToken(new_refresh_token),
        expiresAt: this.refreshTokenExpiry(),
        lastUsedAt: new Date(),
      },
    });
    if (count === 0) {
      throw new UnauthorizedException('error.auth.refreshInvalid');
    }

    const access_token = this.signAccessToken(client, session.id);

    return {
      access_token,
      refresh_token: new_refresh_token,
      client: {
        id: client.id,
        prenom: client.prenom ?? null,
        nom: client.nom,
        email: client.email,
        emailVerified: client.emailVerified ?? false,
        telephone: client.telephone ?? null,
        telephoneVerified: client.telephoneVerified ?? false,
        termsAccepted: client.termsAccepted,
        shareInfoMerchants: client.shareInfoMerchants,
        notifPush: client.notifPush,
        notifWhatsapp: client.notifWhatsapp,
        dateNaissance: client.dateNaissance ?? null,
        hasPassword: !!client.password,
        createdAt: client.createdAt,
      },
    };
  }
}
