import { Injectable, UnauthorizedException, BadRequestException, ConflictException, Logger, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { CLIENT_REPOSITORY, type IClientRepository } from '../common/repositories';
import { CLIENT_AUTH_SELECT } from '../common/prisma-selects';
import { AppleTokenError, AppleTokenVerifier, type AppleTokenFailure, type AppleTokenPayload } from '../common/apple/apple-token-verifier.service';
import { ClientSessionService, type ClientAuthResponse } from './client-session.service';

/** i18n keys (resolved by the client app) for rejected Apple tokens. */
const CLIENT_APPLE_ERRORS: Record<AppleTokenFailure, string> = {
  invalid: 'error.auth.appleTokenInvalid',
  algorithm: 'error.auth.appleAlgorithmNotSupported',
  keyNotFound: 'error.auth.appleKeyNotFound',
  notConfigured: 'error.auth.appleNotConfigured',
  nonceMissing: 'error.auth.appleNonceMissing',
  nonceMismatch: 'error.auth.appleNonceMismatch',
};

/** Client sign-in with Google / Apple identity tokens (creates the account on first use). */
@Injectable()
export class ClientOAuthService {
  private readonly logger = new Logger(ClientOAuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    @Inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    private configService: ConfigService,
    private appleVerifier: AppleTokenVerifier,
    private sessions: ClientSessionService,
  ) {
    this.googleClient = new OAuth2Client();
  }

  // ── Google Login ──────────────────────────────────────

  /**
   * Login with Google ID token
   * Verifies the token using google-auth-library (verifyIdToken)
   */
  async googleLogin(idToken: string): Promise<ClientAuthResponse> {
    try {
      // Dev bypass: accept fake token ONLY when explicitly opted-in via a dedicated flag
      if (
        process.env.NODE_ENV === 'development' &&
        process.env.ALLOW_DEV_AUTH_BYPASS === 'true' &&
        idToken === 'dev-google-token'
      ) {
        const devEmail = 'dev-google@test.com';
        let client = await this.clientRepo.findUnique({ where: { email: devEmail }, select: CLIENT_AUTH_SELECT });
        const isNewUser = !client || !client.nom;
        if (!client) {
          client = await this.clientRepo.create({
            data: { email: devEmail, googleId: 'dev-google-id', prenom: 'Dev', nom: 'Google', termsAccepted: true },
            select: CLIENT_AUTH_SELECT,
          });
        }
        this.logger.debug('[DEV] Google dev login bypass');
        return this.sessions.buildAuthResponse(client, isNewUser);
      }

      // Verify Google ID token using google-auth-library (cryptographic verification)
      // expo-auth-session uses browser flow → token audience is always the Web client ID
      const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const androidClientIds = (this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID') || '').split(',').map(s => s.trim()).filter(Boolean);
      const allowedAudiences = [webClientId, ...androidClientIds].filter(Boolean) as string[];

      if (allowedAudiences.length === 0) {
        this.logger.error('Google login misconfigured: GOOGLE_CLIENT_ID and GOOGLE_ANDROID_CLIENT_ID are both empty');
        throw new UnauthorizedException('error.auth.googleNotConfigured');
      }

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: allowedAudiences,
      });
      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException('error.auth.googleTokenInvalid');
      }

      const { sub: googleId, email, given_name, family_name } = payload;

      if (!email) {
        throw new BadRequestException('error.auth.googleEmailMissing');
      }

      // Try to find client by googleId first, then by email
      let client = await this.clientRepo.findUnique({ where: { googleId }, select: CLIENT_AUTH_SELECT });

      if (!client) {
        client = await this.clientRepo.findUnique({ where: { email: email.toLowerCase() }, select: CLIENT_AUTH_SELECT });
        if (client) {
          // Link Google account to existing client
          client = await this.clientRepo.update({
            where: { id: client.id },
            data: { googleId },
            select: CLIENT_AUTH_SELECT,
          });
        }
      }

      if (!client) {
        try {
          // Google provides name + email — terms will be accepted during complete-profile step
          client = await this.clientRepo.create({
            data: {
              email: email.toLowerCase(),
              emailVerified: true,
              googleId,
              prenom: given_name || null,
              nom: family_name || null,
              termsAccepted: false,
            },
            select: CLIENT_AUTH_SELECT,
          });
        } catch (error: any) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('error.auth.googleEmailExists');
          }
          throw error;
        }
      }

      const isNewUser = !client || !client.nom;
      return this.sessions.buildAuthResponse(client, isNewUser);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      this.logger.error('Google login failed:', error);
      throw new UnauthorizedException('error.auth.googleFailed');
    }
  }

  // ── Apple Login ────────────────────────────────────────

  /**
   * Verify an Apple identity token (shared AppleTokenVerifier).
   * Nonce: the app sends sha256(rawNonce) to Apple and forwards the raw nonce
   * here; the JWT `nonce` claim must match (replay protection).
   */
  private async verifyAppleToken(identityToken: string, rawNonce?: string): Promise<AppleTokenPayload> {
    try {
      return await this.appleVerifier.verify(identityToken, rawNonce);
    } catch (err) {
      if (err instanceof AppleTokenError) throw new UnauthorizedException(CLIENT_APPLE_ERRORS[err.reason]);
      throw err;
    }
  }

  /**
   * Login with Apple identity token.
   * Verifies the token using Apple's JWKS endpoint.
   */
  async appleLogin(identityToken: string, givenName?: string, familyName?: string, rawNonce?: string): Promise<ClientAuthResponse> {
    try {
      const payload = await this.verifyAppleToken(identityToken, rawNonce);
      const { sub: appleId, email } = payload;

      if (!appleId) {
        throw new UnauthorizedException('error.auth.appleTokenInvalidId');
      }

      // Try to find client by appleId first, then by email
      let client = await this.clientRepo.findFirst({ where: { appleId }, select: CLIENT_AUTH_SELECT });

      if (!client && email) {
        client = await this.clientRepo.findUnique({ where: { email: email.toLowerCase() }, select: CLIENT_AUTH_SELECT });
        if (client) {
          // Link Apple account to existing client
          client = await this.clientRepo.update({
            where: { id: client.id },
            data: { appleId },
            select: CLIENT_AUTH_SELECT,
          }) as typeof client;
        }
      }

      if (!client) {
        try {
          client = await this.clientRepo.create({
            data: {
              email: email ? email.toLowerCase() : null,
              emailVerified: !!email,
              appleId,
              prenom: givenName || null,
              nom: familyName || null,
              termsAccepted: false,
            },
            select: CLIENT_AUTH_SELECT,
          });
        } catch (error: any) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException('error.auth.appleEmailExists');
          }
          throw error;
        }
      }

      const isNewUser = !client || !client.nom;
      return this.sessions.buildAuthResponse(client, isNewUser);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      this.logger.error('Apple login failed:', error);
      throw new UnauthorizedException('error.auth.appleFailed');
    }
  }
}
