import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';

/**
 * Max uploads buffered at once on one instance. Multer keeps each file in
 * memory (up to MAX_FILE_SIZE) before sharp processes it; with Cloud Run
 * concurrency 400 and 512 MiB, ~40 parallel 10 MB uploads could OOM the
 * instance and take its WebSockets / crons down with it (security audit
 * 2026-11-05). Guards run before interceptors, so a refused request is
 * rejected before its body is buffered.
 */
export const MAX_CONCURRENT_UPLOADS = 8;

let inFlight = 0;

@Injectable()
export class UploadConcurrencyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (inFlight >= MAX_CONCURRENT_UPLOADS) {
      throw new ServiceUnavailableException('Serveur occupé, réessayez dans quelques secondes.');
    }
    inFlight++;
    const res = context.switchToHttp().getResponse();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inFlight--;
    };
    // 'close' fires on completion AND on client abort.
    res.once('close', release);
    res.once('finish', release);
    return true;
  }
}

/** Test helper. */
export function __uploadsInFlight(): number {
  return inFlight;
}
