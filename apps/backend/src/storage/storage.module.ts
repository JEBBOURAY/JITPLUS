import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { LocalStorageService } from './local-storage.service';
import { ImageOptimizerService } from './image-optimizer.service';
import { STORAGE_PROVIDER } from '../common/interfaces';

@Global()
@Module({
  providers: [
    StorageService,
    LocalStorageService,
    ImageOptimizerService,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: ConfigService, gcs: StorageService, local: LocalStorageService) => {
        const bucket = config.get<string>('GCP_STORAGE_BUCKET_NAME');
        if (bucket) return gcs;
        const { Logger } = require('@nestjs/common');
        new Logger('StorageModule').warn('GCP_STORAGE_BUCKET_NAME non défini → stockage local (uploads/)');
        return local;
      },
      inject: [ConfigService, StorageService, LocalStorageService],
    },
  ],
  exports: [StorageService, LocalStorageService, ImageOptimizerService, STORAGE_PROVIDER],
})
export class StorageModule {}
