import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

interface ImageProfile {
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

const PROFILES: Record<string, ImageProfile> = {
  logo: { maxWidth: 512, maxHeight: 512, quality: 80 },
  cover: { maxWidth: 1200, maxHeight: 600, quality: 80 },
  default: { maxWidth: 1024, maxHeight: 1024, quality: 80 },
};

@Injectable()
export class ImageOptimizerService {
  private readonly logger = new Logger(ImageOptimizerService.name);

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

    const optimizedBuffer = await sharp(file.buffer)
      .resize(profile.maxWidth, profile.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: profile.quality })
      .toBuffer();

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
