import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

// 512Mi Cloud Run instances: libvips' operation cache (default 50 MB / 100
// ops) and one worker thread per core per image are not worth the memory.
// Each upload is a one-shot transform, so the cache never hits anyway.
sharp.cache(false);
sharp.concurrency(1);

/**
 * Max decoded pixels per input (~40 MP, e.g. 8000x5000). sharp's default is
 * ~268 MP, i.e. a single crafted 10 MB PNG could decode to >1 GB of RGBA.
 */
export const MAX_INPUT_PIXELS = 40_000_000;

/** Max images optimized at once per instance; extra uploads queue in-process. */
export const MAX_CONCURRENT_OPTIMIZATIONS = 2;

/** Minimal FIFO counting semaphore (in-process). */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  get inFlight(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiters.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      // The releasing task hands its slot over directly (active stays constant).
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await fn();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }
}

function isPixelLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /pixel limit/i.test(msg);
}

interface ImageProfile {
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

const PROFILES: Record<string, ImageProfile> = {
  logo: { maxWidth: 512, maxHeight: 512, quality: 80 },
  cover: { maxWidth: 1200, maxHeight: 600, quality: 80 },
  cardBg: { maxWidth: 800, maxHeight: 500, quality: 78 },
  gallery: { maxWidth: 1200, maxHeight: 1200, quality: 82 },
  reward: { maxWidth: 600, maxHeight: 600, quality: 80 },
  // Shown as a ~88 px square in lists and full width on the detail screen
  deal: { maxWidth: 900, maxHeight: 900, quality: 78 },
  default: { maxWidth: 1024, maxHeight: 1024, quality: 80 },
};

@Injectable()
export class ImageOptimizerService {
  private readonly logger = new Logger(ImageOptimizerService.name);
  private readonly semaphore = new Semaphore(MAX_CONCURRENT_OPTIMIZATIONS);

  /**
   * Optimise une image uploadée : redimensionner + convertir en WebP.
   * Retourne un objet Multer-compatible avec le buffer optimisé.
   */
  async optimize(
    file: Express.Multer.File,
    profileName: string = 'default',
  ): Promise<Express.Multer.File> {
    const profile = PROFILES[profileName] ?? PROFILES.default;
    const originalSize = file.buffer.length;

    let optimizedBuffer: Buffer;
    try {
      optimizedBuffer = await this.semaphore.run(() =>
        sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
          .resize(profile.maxWidth, profile.maxHeight, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: profile.quality })
          .toBuffer(),
      );
    } catch (err) {
      if (isPixelLimitError(err)) {
        this.logger.warn(`Image refusée (dimensions trop grandes) [${profileName}]: ${(err as Error).message}`);
        throw new BadRequestException(
          'Image trop grande : ses dimensions dépassent la limite autorisée (40 mégapixels). Veuillez la redimensionner et réessayer.',
        );
      }
      throw err;
    }

    const savedPercent = Math.round((1 - optimizedBuffer.length / originalSize) * 100);
    this.logger.log(
      `Image optimisée: ${originalSize} → ${optimizedBuffer.length} octets (−${savedPercent}%) [${profileName}]`,
    );

    // Retourner un objet compatible Multer avec les métadonnées mises à jour
    return {
      ...file,
      buffer: optimizedBuffer,
      mimetype: 'image/webp',
      size: optimizedBuffer.length,
      originalname: file.originalname.replace(/\.\w+$/, '.webp'),
    };
  }
}
