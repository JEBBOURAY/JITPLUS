import { Injectable, Logger } from '@nestjs/common';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { IStorageProvider } from '../common/interfaces';

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
    const extension = extname(file.originalname).toLowerCase();
    const fileName = `${randomUUID()}${extension}`;
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
