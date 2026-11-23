import { Module } from '@nestjs/common';
import { SignupFunnelService } from './signup-funnel.service';

/** Separate from ClientAuthModule: the admin reads the counters, it does not need client sign-in. */
@Module({
  providers: [SignupFunnelService],
  exports: [SignupFunnelService],
})
export class SignupFunnelModule {}
