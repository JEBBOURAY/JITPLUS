import { Injectable, Logger } from '@nestjs/common';
import { join, resolve, sep } from 'path';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { IStorageProvider } from '../common/interfaces';
import { buildUploadKey, isKeyOwnedBy } from './storage-keys';

const PUBLIC_PREFIX = '/uploads/';

/**
 * Local disk storage — used in development when GCP credentials are unavailable.
 * Files are saved to <project>/uploads/<folder>/<ownerId>/<file>
 * and served via express.static at /uploads.
 */
@Injectable()
export class LocalStorageService implements IStorageProvider {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadsRoot = join(process.cwd(), 'uploads');

  async uploadFile(file: Express.Multer.File, folder: string, ownerId: string): Promise<string> {
    const key = buildUploadKey(folder, ownerId, file.originalname);
    const filePath = join(this.uploadsRoot, key);

    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, file.buffer);

    const publicPath = `${PUBLIC_PREFIX}${key}`;
    this.logger.log(`Fichier sauvegardé localement: ${publicPath}`);
    return publicPath;
  }

  isOwnedBy(fileUrl: string, ownerId: string): boolean {
    return typeof fileUrl === 'string' && fileUrl.startsWith(PUBLIC_PREFIX)
      && isKeyOwnedBy(fileUrl.slice(PUBLIC_PREFIX.length), ownerId);
  }

  async deleteFile(fileUrl: string): Promise<void> {
    if (!fileUrl || !fileUrl.startsWith(PUBLIC_PREFIX)) return;
    const filePath = resolve(this.uploadsRoot, fileUrl.slice(PUBLIC_PREFIX.length));
    // Stored URLs are user-influenced: never let "../" escape the uploads folder.
    if (!filePath.startsWith(resolve(this.uploadsRoot) + sep)) {
      this.logger.warn(`Suppression refusée hors du dossier uploads: ${fileUrl}`);
      return;
    }
    try {
      await unlink(filePath);
      this.logger.log(`Fichier supprimé: ${fileUrl}`);
    } catch {
      this.logger.warn(`Impossible de supprimer: ${fileUrl}`);
    }
  }
}
