import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OTP_REPOSITORY, type IOtpRepository } from '../repositories';

/**
 * Scheduled task: purge expired OTP records from the database.
 * Runs every 30 minutes to prevent unbounded table growth from
 * users who request an OTP but never verify it.
 */
@Injectable()
export class OtpCleanupService {
  private readonly logger = new Logger(OtpCleanupService.name);

  constructor(
    @Inject(OTP_REPOSITORY) private readonly otpRepo: IOtpRepository,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupExpiredOtps(): Promise<void> {
    try {
      const result = await this.otpRepo.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      if (result.count > 0) {
        this.logger.log(`OTP cleanup: ${result.count} enregistrement(s) expiré(s) supprimé(s)`);
      }
    } catch (error) {
      this.logger.error('Erreur lors du nettoyage des OTPs expirés', error);
    }
  }
}
