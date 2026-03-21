import { Injectable, Logger } from '@nestjs/common';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { IStorageProvider } from '../common/interfaces';

/** Sanitize a filename: keep only safe chars, strip path separators */
function safeFilename(original: string): string {
  const ext = extname(original).toLowerCase();
  const base = original
    .slice(0, original.length - ext.length)
    .replace(/[^a-z0-9_\-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'file';
  const suffix = randomBytes(4).toString('hex'); // 8-char uniqueness suffix
  return `${base}_${suffix}${ext}`;
}

/**
 * Local disk storage — used in development when GCP credentials are unavailable.
 * Files are saved to <project>/uploads/<folder>/<uuid>.<ext>
 * and served via express.static at /uploads.
 */
@Injectable()
export class LocalStorageService implements IStorageProvider {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadsRoot = join(process.cwd(), 'uploads');

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    const fileName = safeFilename(file.originalname);
    const dirPath = join(this.uploadsRoot, folder);

    await mkdir(dirPath, { recursive: true });

    const filePath = join(dirPath, fileName);
    await writeFile(filePath, file.buffer);

    const publicPath = `/uploads/${folder}/${fileName}`;
    this.logger.log(`Fichier sauvegardé localement: ${publicPath}`);
    return publicPath;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
    try {
      const filePath = join(process.cwd(), fileUrl);
      await unlink(filePath);
      this.logger.log(`Fichier supprimé: ${fileUrl}`);
    } catch {
      this.logger.warn(`Impossible de supprimer: ${fileUrl}`);
    }
  }
}
