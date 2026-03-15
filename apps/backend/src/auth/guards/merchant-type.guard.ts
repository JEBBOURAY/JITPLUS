import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

/**
 * Guard that ensures the authenticated user is a merchant or team member.
 * Blocks client tokens from accessing merchant-only endpoints.
 * Must be placed AFTER AuthGuard('jwt').
 */
@Injectable()
export class MerchantTypeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentification requise');
    }

    if (user.type !== 'merchant' && user.type !== 'team_member') {
      throw new ForbiddenException('Accès réservé aux commerçants');
    }

    return true;
  }
}
