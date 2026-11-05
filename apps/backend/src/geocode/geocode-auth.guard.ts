import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * /geocode/* proxies paid Google APIs. Anonymous callers could run up the bill
 * (denial of wallet), so merchant-app tokens are required.
 *
 * Rollout: JitPlus Pro builds released before this guard call the proxy
 * without a token. Until GEOCODE_REQUIRE_AUTH=true (set it once those builds
 * are gone, e.g. after raising _MIN_VERSION_JITPLUSPRO), calls WITHOUT an
 * Authorization header are still let through; calls WITH one are validated.
 */
@Injectable()
export class GeocodeAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const hasAuth = typeof req.headers?.authorization === 'string' && req.headers.authorization.length > 0;
    if (!hasAuth && process.env.GEOCODE_REQUIRE_AUTH !== 'true') return true;

    await super.canActivate(context);
    const type = req.user?.type;
    if (type !== 'merchant' && type !== 'team_member') {
      throw new ForbiddenException('Accès réservé aux commerçants');
    }
    return true;
  }
}
