import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { extname } from 'path';
import { randomBytes } from 'crypto';
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
  const suffix = randomBytes(4).toString('hex');
  return `${base}_${suffix}${ext}`;
}

@Injectable()
export class StorageService implements IStorageProvider {
  private readonly storage: Storage;
  private readonly bucketName: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly configService: ConfigService) {
    this.storage = new Storage({
      projectId: this.configService.get<string>('GCP_PROJECT_ID'),
      // Si vous exécutez sur Cloud Run, l'authentification est automatique via le compte de service.
      // En local, il faudra configurer GOOGLE_APPLICATION_CREDENTIALS
    });
    this.bucketName = this.configService.get<string>('GCP_STORAGE_BUCKET_NAME', '');
  }

  private static readonly ALLOWED_FOLDERS = new Set(['logos', 'products', 'stores', 'covers']);

  /**
   * Upload un fichier vers Google Cloud Storage
   * @param file Le fichier uploadé via Multer (buffer, mimetype, originalname)
   * @param folder Le dossier de destination dans le bucket (ex: 'logos', 'products')
   * @returns L'URL publique du fichier
   */
  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    // Prevent path traversal — only allow known folder names
    if (!StorageService.ALLOWED_FOLDERS.has(folder)) {
      throw new Error(`Dossier non autorisé : ${folder}`);
    }

    const bucket = this.storage.bucket(this.bucketName);
    
    // Build a safe, human-readable filename from originalname + short random suffix
    const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf']);
    const extension = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(extension)) {
      throw new Error(`Extension de fichier non autorisée : ${extension}`);
    }
    const fileName = `${folder}/${safeFilename(file.originalname)}`;
    const fileUpload = bucket.file(fileName);

    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
      resumable: false, // Upload simple pour les petits fichiers
    });

    return new Promise((resolve, reject) => {
      // Timeout to prevent stalled uploads from hanging the worker indefinitely
      const uploadTimeout = setTimeout(() => {
        stream.destroy();
        reject(new Error('Upload timeout: GCS stream stalled for 30s'));
      }, 30_000);

      stream.on('error', (err) => {
        clearTimeout(uploadTimeout);
        this.logger.error(`Erreur lors de l'upload vers GCS: ${err.message}`, err.stack);
        reject(err);
      });

      stream.on('finish', async () => {
        clearTimeout(uploadTimeout);
        const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${fileName}`;
        this.logger.log(`Fichier uploadé avec succès: ${publicUrl}`);
        resolve(publicUrl);
      });

      stream.end(file.buffer);
    });
  }

  async deleteFile(fileUrl: string): Promise<void> {
    if (!fileUrl) return;

    try {
      // Extraire le chemin du fichier depuis l'URL
      // URL type: https://storage.googleapis.com/bucket-name/folder/file.ext
      const bucketUrlPrefix = `https://storage.googleapis.com/${this.bucketName}/`;
      if (!fileUrl.startsWith(bucketUrlPrefix)) {
        this.logger.warn(`L'URL ${fileUrl} ne correspond pas au bucket configuré.`);
        return;
      }

      const fileName = fileUrl.replace(bucketUrlPrefix, '');
      const file = this.storage.bucket(this.bucketName).file(fileName);
      
      await file.delete();
      this.logger.log(`Fichier supprimé: ${fileName}`);
    } catch (error: unknown) {
      const gcsError = error as { code?: number; message?: string };
      if (gcsError.code === 404) {
        this.logger.warn(`Fichier introuvable lors de la suppression: ${fileUrl}`);
      } else {
        this.logger.error(`Erreur lors de la suppression du fichier: ${gcsError.message || 'Unknown error'}`);
        // On ne reject pas ici pour ne pas bloquer le flux principal si la suppression échoue
      }
    }
  }
}
