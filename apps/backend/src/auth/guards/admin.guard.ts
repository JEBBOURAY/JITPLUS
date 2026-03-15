import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException, Inject } from '@nestjs/common';
import { ADMIN_USER_REPOSITORY, type IAdminUserRepository } from '../../common/repositories';

/**
 * Guard that ensures the authenticated user is an active admin.
 * Must be placed AFTER JwtAuthGuard.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private adminRepo: IAdminUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentification requise');
    }

    if (user.type !== 'admin') {
      throw new ForbiddenException('Accès réservé aux administrateurs');
    }

    // Verify admin is still active in DB (handles post-JWT-issuance deactivation)
    const admin = await this.adminRepo.findUnique({ where: { id: user.sub } });
    if (!admin || !admin.isActive) {
      throw new ForbiddenException('Ce compte administrateur est désactivé.');
    }

    return true;
  }
}
