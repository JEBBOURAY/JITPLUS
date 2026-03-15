import { ConfigService } from '@nestjs/config';
import { JwtModuleAsyncOptions } from '@nestjs/jwt';

/**
 * Shared async factory for JwtModule.registerAsync.
 *
 * All JitPlus services use the same secret, algorithm, and issuer.
 * Only the audience (and optionally the expiration env key) differ per module.
 *
 * Usage:
 *   JwtModule.registerAsync(jwtModuleFactory('jitplus-merchant'))
 *   JwtModule.registerAsync(jwtModuleFactory('jitplus-client', 'JWT_CLIENT_EXPIRATION', '2h'))
 */
export function jwtModuleFactory(
  audience: string,
  expirationEnvKey = 'JWT_EXPIRATION',
  defaultExpiration = '1h',
): JwtModuleAsyncOptions {
  return {
    useFactory: (config: ConfigService) => {
      const expiresIn = (config.get<string>(expirationEnvKey) ?? defaultExpiration) as import('ms').StringValue;

      return {
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn,
          algorithm: 'HS256' as const,
          issuer: 'jitplus-api',
          audience,
        },
      };
    },
    inject: [ConfigService],
  };
}
