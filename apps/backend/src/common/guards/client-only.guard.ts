import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Guard that ensures only client-type JWT holders can access the route.
 * Prevents merchant/team_member tokens from hitting client endpoints.
 */
@Injectable()
export class ClientOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.type !== 'client') {
      throw new ForbiddenException('Accès réservé aux clients');
    }

    return true;
  }
}
