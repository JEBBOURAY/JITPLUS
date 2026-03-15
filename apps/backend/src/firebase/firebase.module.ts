import { Module, Global } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { PUSH_PROVIDER } from '../common/interfaces';

@Global()
@Module({
  providers: [
    FirebaseService,
    { provide: PUSH_PROVIDER, useExisting: FirebaseService },
  ],
  exports: [FirebaseService, PUSH_PROVIDER],
})
export class FirebaseModule {}
