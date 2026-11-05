import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppleTokenVerifier } from './apple-token-verifier.service';

/** Global so every auth flow shares one JWKS cache. */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [AppleTokenVerifier],
  exports: [AppleTokenVerifier],
})
export class AppleAuthModule {}
