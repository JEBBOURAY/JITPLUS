import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import {
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TEAM_MEMBER_REPOSITORY, type ITeamMemberRepository,
} from '../common/repositories';
import { LoginDto } from './dto/login.dto';
import { USER_TYPE_MERCHANT, USER_TYPE_TEAM_MEMBER } from '../common/constants';
import { checkLockout, handleFailedLogin, resetLoginAttempts, LockoutDbOps } from '../common/utils/login-lockout.helper';
import { MERCHANT_LOGIN_SELECT, MERCHANT_PROFILE_SELECT } from '../common/prisma-selects';
import { MerchantSessionService } from './merchant-session.service';
import { type AuthResult, merchantLockoutOps } from './auth-shared';

export type { AuthResult, PendingRegistrationResult } from './auth-shared';

/**
 * Email/password sign-in for merchant owners and team members.
 * Related flows live in sibling services: MerchantSignupService (registration),
 * MerchantOAuthService (Google/Apple), MerchantSessionService (refresh/logout),
 * MerchantOtpService (email verification, password reset).
 */
@Injectable()
export class AuthService {
  /**
   * Pre-hashed dummy password used when the user doesn't exist.
   * Ensures bcrypt.compare always runs, preventing timing side-channel
   * that reveals whether an email is registered.
   * Precomputed literal (cost 12, same as BCRYPT_SALT_ROUNDS) so module load
   * does not block the event loop on a synchronous bcrypt hash at cold start.
   * Generated once via: bcryptjs.hashSync('dummy-password-never-used', 12)
   */
  private static readonly DUMMY_HASH = '$2b$12$iLOz8o8RBv07i/8vPxi33.Aud5YwKZrKRr/mRMTFt/0aH6tMN2DCq';

  constructor(
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(TEAM_MEMBER_REPOSITORY) private teamMemberRepo: ITeamMemberRepository,
    private jwtService: JwtService,
    private sessions: MerchantSessionService,
  ) {}

  /** Lockout DB ops for Merchant model */
  private get merchantLockoutOps(): LockoutDbOps {
    return merchantLockoutOps(this.merchantRepo);
  }

  /** Lockout DB ops for TeamMember model */
  private get teamMemberLockoutOps(): LockoutDbOps {
    return {
      incrementFailedAttempts: (id, newAttempts, lockedUntil) =>
        this.teamMemberRepo.update({
          where: { id },
          data: { failedLoginAttempts: newAttempts, ...(lockedUntil && { lockedUntil }) },
        }).then(() => {}),
      resetFailedAttempts: (id) =>
        this.teamMemberRepo.update({
          where: { id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }).then(() => {}),
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string): Promise<AuthResult> {
    const sessionId = randomUUID();

    // Chercher merchant et teamMember en parallèle
    const [merchant, teamMember] = await Promise.all([
      this.merchantRepo.findUnique({
        where: { email: loginDto.email },
        select: MERCHANT_LOGIN_SELECT,
      }),
      this.teamMemberRepo.findUnique({
        where: { email: loginDto.email },
        select: { id: true, email: true, nom: true, password: true, role: true, isActive: true, merchantId: true, failedLoginAttempts: true, lockedUntil: true, merchant: { select: { isActive: true } } },
      }),
    ]);

    if (merchant) {
      if (!merchant.isActive || merchant.deletedAt) {
        throw new UnauthorizedException('Votre compte a été désactivé. Veuillez contacter le support.');
      }

      // Brute-force protection
      checkLockout(merchant);

      const isPasswordValid = await bcrypt.compare(loginDto.password, merchant.password);
      if (!isPasswordValid) {
        await handleFailedLogin(merchant, this.merchantLockoutOps);
        throw new UnauthorizedException(); // unreachable safety net
      }

      await resetLoginAttempts(merchant, this.merchantLockoutOps);

      const { password: _, failedLoginAttempts: _fa, lockedUntil: _lu, ...merchantData } = merchant;

      const payload = {
        sub: merchant.id,
        email: merchant.email,
        type: USER_TYPE_MERCHANT,
        role: 'owner',
        jti: sessionId,
      };

      const session = await this.sessions.openLoginSession(
        merchant.id, sessionId, loginDto, ipAddress,
        { type: USER_TYPE_MERCHANT, email: merchant.email, name: merchant.nom }, { kind: 'owner' },
      );

      return {
        access_token: this.jwtService.sign(payload),
        ...session,
        merchant: merchantData,
        userType: USER_TYPE_MERCHANT,
      };
    }

    if (teamMember) {
      if (!teamMember.isActive) {
        throw new UnauthorizedException('Ce compte a été désactivé par le propriétaire');
      }

      // Brute-force protection
      checkLockout(teamMember);

      const isPasswordValid = await bcrypt.compare(loginDto.password, teamMember.password);
      if (!isPasswordValid) {
        await handleFailedLogin(teamMember, this.teamMemberLockoutOps);
        throw new UnauthorizedException(); // unreachable safety net
      }

      await resetLoginAttempts(teamMember, this.teamMemberLockoutOps);

      // Récupérer le merchant directement via merchantId
      const ownerMerchant = await this.merchantRepo.findUnique({
        where: { id: teamMember.merchantId },
        select: MERCHANT_PROFILE_SELECT,
      });

      if (!ownerMerchant) {
        throw new UnauthorizedException('Commerce associé introuvable');
      }

      if (!ownerMerchant.isActive || ownerMerchant.deletedAt) {
        throw new UnauthorizedException('Ce compte commerce n\'existe plus');
      }

      const payload = {
        sub: ownerMerchant.id,
        email: teamMember.email,
        type: USER_TYPE_TEAM_MEMBER,
        role: 'team_member',
        teamMemberId: teamMember.id,
        teamMemberName: teamMember.nom,
        jti: sessionId,
      };

      // Le propriétaire est alerté quand un membre d'équipe se connecte depuis un nouvel appareil.
      const session = await this.sessions.openLoginSession(
        ownerMerchant.id, sessionId, loginDto, ipAddress,
        { type: USER_TYPE_TEAM_MEMBER, email: teamMember.email, name: teamMember.nom },
        { kind: 'member', name: teamMember.nom },
      );

      return {
        access_token: this.jwtService.sign(payload),
        ...session,
        merchant: ownerMerchant,
        userType: USER_TYPE_TEAM_MEMBER,
        teamMember: {
          id: teamMember.id,
          nom: teamMember.nom,
          email: teamMember.email,
          role: teamMember.role,
        },
      };
    }

    // No user found — still run bcrypt.compare to prevent timing side-channel
    await bcrypt.compare(loginDto.password, AuthService.DUMMY_HASH);
    throw new UnauthorizedException('Identifiants invalides');
  }
}
