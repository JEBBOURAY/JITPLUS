import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

/**
 * Guard qui bloque les membres d'équipe.
 * Seul le propriétaire (merchant) peut accéder aux routes protégées par ce guard.
 * IMPORTANT: Ce guard doit toujours être placé APRÈS AuthGuard('jwt').
 */
@Injectable()
export class MerchantOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If user is not set (guard applied without JwtAuthGuard), deny access
    if (!user) {
      throw new UnauthorizedException('Authentification requise');
    }

    if (user.type === 'client') {
      throw new ForbiddenException('Accès réservé aux commerçants');
    }

    if (user.type === 'team_member') {
      throw new ForbiddenException(
        'Accès réservé au propriétaire du commerce. Les membres d\'équipe ne peuvent pas effectuer cette action.',
      );
    }

    return true;
  }
}
