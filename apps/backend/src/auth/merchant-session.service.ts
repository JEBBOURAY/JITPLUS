import { Injectable, UnauthorizedException, Logger, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, randomBytes } from 'crypto';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TEAM_MEMBER_REPOSITORY, type ITeamMemberRepository,
  DEVICE_SESSION_REPOSITORY, type IDeviceSessionRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../common/repositories';
import { IMailProvider, MAIL_PROVIDER } from '../common/interfaces';
import { USER_TYPE_MERCHANT, USER_TYPE_TEAM_MEMBER, MAX_SESSIONS_PER_MERCHANT } from '../common/constants';
import { errMsg } from '../common/utils';
import { MERCHANT_PROFILE_SELECT } from '../common/prisma-selects';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MerchantNotifierService, NOTIFY_TARGET_SELECT } from '../merchant-inbox/merchant-notifier.service';
import { LOGIN_MESSAGES, toLoginLang, type LoginActor } from './login-alert-messages';
import { type AuthResult, type DeviceInfo, sha256 } from './auth-shared';

/**
 * Merchant device sessions: opening a session at sign-in / sign-up (refresh
 * token + DeviceSession + "new device" alert), refresh-token rotation, logout.
 */
@Injectable()
export class MerchantSessionService {
  private readonly logger = new Logger(MerchantSessionService.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(TEAM_MEMBER_REPOSITORY) private teamMemberRepo: ITeamMemberRepository,
    @Inject(DEVICE_SESSION_REPOSITORY) private deviceSessionRepo: IDeviceSessionRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    private jwtService: JwtService,
    @Inject(MAIL_PROVIDER) private mailProvider: IMailProvider,
    private jwtStrategy: JwtStrategy,
    private notifier: MerchantNotifierService,
  ) {}

  // ── Gestion des sessions d'appareils ────────────────────

  /**
   * Ouvre la session d'une connexion réussie (refresh token + DeviceSession) et
   * déclenche l'alerte « nouvel appareil » en arrière-plan.
   */
  async openLoginSession(
    merchantId: string,
    sessionId: string,
    device: DeviceInfo & { deviceName: string },
    ipAddress: string | undefined,
    user: { type: string; email: string; name?: string | null },
    actor: LoginActor,
  ): Promise<{ refresh_token: string; session_id: string }> {
    const refreshToken = randomBytes(40).toString('hex');
    const { isNewDevice } = await this.registerDeviceSession(
      merchantId, sessionId, device, ipAddress, user.type, user.email, user.name ?? undefined, sha256(refreshToken),
    );
    this.sendLoginNotification(merchantId, actor, device.deviceName, isNewDevice)
      .catch((err) => this.logger.warn('Login alert failed', errMsg(err)));
    return { refresh_token: refreshToken, session_id: sessionId };
  }

  private async registerDeviceSession(
    merchantId: string,
    sessionId: string,
    loginDto: DeviceInfo,
    ipAddress?: string,
    userType?: string,
    userEmail?: string,
    userName?: string,
    refreshTokenHash?: string,
    /** Première session d'un compte tout juste créé : un seul INSERT, rien à rapprocher. */
    isFirstSession = false,
  ): Promise<{ isNewDevice: boolean }> {
    const sessionData = {
      tokenId: sessionId,
      deviceName: loginDto.deviceName!,
      deviceOS: loginDto.deviceOS,
      ipAddress,
      userType,
      userEmail,
      userName,
      isCurrentDevice: true,
      lastActiveAt: new Date(),
      ...(refreshTokenHash ? { refreshTokenHash } : {}),
    };

    if (isFirstSession) {
      await this.deviceSessionRepo.create({
        data: { merchantId, deviceId: loginDto.deviceId, ...sessionData },
      });
      return { isNewDevice: true };
    }

    return this.txRunner.run(async (tx) => {
      // Appareil déjà connu ? Par deviceId (stable, SecureStore) ; à défaut (anciennes
      // versions de l'app) par nom + OS, pour ne pas alerter à chaque connexion.
      const existing = await tx.deviceSession.findFirst({
        where: loginDto.deviceId
          ? { merchantId, deviceId: loginDto.deviceId }
          : { merchantId, deviceId: null, deviceName: loginDto.deviceName!, deviceOS: loginDto.deviceOS ?? null },
        orderBy: { lastActiveAt: 'desc' },
        select: { id: true },
      });

      if (existing) {
        // Ligne réutilisée : le nombre de sessions ne change pas, pas d'éviction à faire.
        await tx.deviceSession.update({ where: { id: existing.id }, data: sessionData });
        return { isNewDevice: false };
      }

      await tx.deviceSession.create({
        data: { merchantId, deviceId: loginDto.deviceId, ...sessionData },
      });

      // Au-delà de la limite, on supprime les sessions les plus anciennes.
      const toKeep = await tx.deviceSession.findMany({
        where: { merchantId },
        orderBy: { lastActiveAt: 'desc' },
        take: MAX_SESSIONS_PER_MERCHANT,
        select: { id: true },
      });
      if (toKeep.length >= MAX_SESSIONS_PER_MERCHANT) {
        await tx.deviceSession.deleteMany({
          where: { merchantId, id: { notIn: toKeep.map((r: { id: string }) => r.id) } },
        });
      }
      return { isNewDevice: true };
    });
  }

  /**
   * Alerte de sécurité « nouvelle connexion » : uniquement pour un appareil inconnu
   * (inbox + push via le notifier central + email). Une reconnexion depuis un appareil
   * déjà enregistré est visible dans la liste des sessions de l'écran Sécurité.
   */
  private async sendLoginNotification(
    merchantId: string,
    actor: LoginActor,
    deviceName: string,
    isNewDevice: boolean,
  ): Promise<void> {
    if (!isNewDevice) return;

    const merchant = await this.merchantRepo.findUnique({
      where: { id: merchantId },
      select: { ...NOTIFY_TARGET_SELECT, language: true, email: true },
    });
    if (!merchant) return;

    const lang = toLoginLang(merchant.language);
    const msg = LOGIN_MESSAGES[lang];
    const who = actor.kind === 'owner' ? msg.owner : msg.member(actor.name);
    const via = actor.kind === 'owner' && actor.provider ? msg.via(actor.provider) : '';
    const body = msg.sentence(who, via, deviceName) + msg.outro;

    await this.notifier.notify(merchant, {
      category: 'SECURITY',
      title: msg.title,
      body,
      action: 'open_security',
      event: 'login_alert',
    });

    if (merchant.email) {
      this.mailProvider.sendLoginAlert(merchant.email, who + via, deviceName, new Date(), lang)
        .catch((err) => this.logger.warn('Login alert email failed', errMsg(err)));
    }
  }

  /** Access token + device session for a merchant owner who just signed up. */
  async issueOwnerSession(
    merchant: { id: string; email: string; nom: string | null },
    device: DeviceInfo,
    fallbackDeviceName: string,
  ): Promise<Pick<AuthResult, 'access_token' | 'refresh_token' | 'session_id'>> {
    const sessionId = randomUUID();
    const jwtPayload = {
      sub: merchant.id,
      email: merchant.email,
      type: USER_TYPE_MERCHANT,
      role: 'owner',
      jti: sessionId,
    };

    let refreshToken: string | undefined;
    if (device.deviceName) {
      refreshToken = randomBytes(40).toString('hex');
      const refreshHash = sha256(refreshToken);
      await this.registerDeviceSession(
        merchant.id, sessionId, device, undefined,
        'merchant', merchant.email, merchant.nom ?? undefined, refreshHash,
        /* isFirstSession */ true,
      );
    } else {
      await this.deviceSessionRepo.create({
        data: {
          merchantId: merchant.id,
          tokenId: sessionId,
          deviceName: fallbackDeviceName,
          isCurrentDevice: true,
          lastActiveAt: new Date(),
        },
      });
    }

    return {
      access_token: this.jwtService.sign(jwtPayload),
      ...(refreshToken && { refresh_token: refreshToken }),
      session_id: sessionId,
    };
  }

  /**
   * Refresh an access token using an opaque refresh token + session ID.
   * Rotates the refresh token on every call (prevents replay attacks).
   */
  async refreshWithToken(refreshToken: string, sessionId: string): Promise<AuthResult> {
    const session = await this.deviceSessionRepo.findUnique({
      where: { tokenId: sessionId },
      select: {
        id: true,
        merchantId: true,
        refreshTokenHash: true,
        userType: true,
        userEmail: true,
        userName: true,
      },
    });

    if (!session || !session.refreshTokenHash) {
      throw new UnauthorizedException('Session expirée. Veuillez vous reconnecter.');
    }

    // Constant-time comparison via hash equality
    const incomingHash = sha256(refreshToken);
    if (incomingHash !== session.refreshTokenHash) {
      // Potential token theft — delete the session immediately
      await this.deviceSessionRepo.delete({ where: { id: session.id } })
        .catch((err) => this.logger.error(`Failed to revoke stolen session ${session.id}`, errMsg(err)));
      throw new UnauthorizedException('Token de rafraîchissement invalide.');
    }

    const merchant = await this.merchantRepo.findUnique({
      where: { id: session.merchantId },
      select: MERCHANT_PROFILE_SELECT,
    });

    if (!merchant || !merchant.isActive || merchant.deletedAt) {
      throw new UnauthorizedException('Compte commerçant inactif ou introuvable.');
    }

    const userType = (session.userType as string) || USER_TYPE_MERCHANT;

    let teamMember: { id: string; nom: string } | null = null;
    if (userType === USER_TYPE_TEAM_MEMBER) {
      const member = session.userEmail
        ? await this.teamMemberRepo.findUnique({
            where: { email: session.userEmail },
            select: { id: true, nom: true, isActive: true, merchantId: true },
          })
        : null;
      if (!member || !member.isActive || member.merchantId !== session.merchantId) {
        await this.deviceSessionRepo.delete({ where: { id: session.id } })
          .catch((err) => this.logger.error(`Failed to revoke team member session ${session.id}`, errMsg(err)));
        throw new UnauthorizedException("Compte membre d'équipe désactivé ou introuvable.");
      }
      teamMember = { id: member.id, nom: member.nom };
    }

    // Rotate: generate new access token session ID + new refresh token
    const newSessionId = randomUUID();
    const newRefreshToken = randomBytes(40).toString('hex');
    const newRefreshHash = sha256(newRefreshToken);

    // Conditioned on the old hash so two concurrent refreshes with the same
    // token cannot both rotate the session.
    const { count } = await this.deviceSessionRepo.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash },
      data: { tokenId: newSessionId, lastActiveAt: new Date(), refreshTokenHash: newRefreshHash },
    });
    if (count === 0) {
      throw new UnauthorizedException('Token de rafraîchissement invalide.');
    }

    const payload: Record<string, unknown> = {
      sub: session.merchantId,
      email: session.userEmail,
      type: userType,
      role: userType === USER_TYPE_TEAM_MEMBER ? 'team_member' : 'owner',
      jti: newSessionId,
      ...(teamMember ? { teamMemberId: teamMember.id, teamMemberName: teamMember.nom } : {}),
    };

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: newRefreshToken,
      session_id: newSessionId,
      merchant,
      userType,
    };
  }

  async logout(sessionId?: string): Promise<{ message: string }> {
    if (!sessionId) return { message: 'Déconnecté' };
    // Immediately invalidate the in-memory cache to close the replay window
    await this.jwtStrategy.invalidateSession(sessionId);
    try {
      // Revoke the session but keep the row: the device stays "known", so signing
      // back in on the same phone does not raise a "new sign-in" security alert.
      // (Revoking from Security or changing the password still deletes the row.)
      await this.deviceSessionRepo.updateMany({
        where: { tokenId: sessionId },
        data: { tokenId: null, refreshTokenHash: null, isCurrentDevice: false },
      });
    } catch (err) {
      this.logger.warn('Session cleanup failed', errMsg(err));
    }

    return { message: 'Déconnecté' };
  }
}
