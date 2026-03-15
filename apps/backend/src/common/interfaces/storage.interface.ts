// ── Storage Provider Interface ───────────────────────────────────────────────
// Abstract away the file storage backend (GCS, S3, Azure Blob, local disk).

export interface IStorageProvider {
  /**
   * Upload a file and return its public URL.
   * @param file  Multer file object (buffer + metadata)
   * @param folder  Destination folder path (e.g. 'logos', 'products')
   */
  uploadFile(file: Express.Multer.File, folder: string): Promise<string>;

  /**
   * Delete a file by its public URL. No-op if URL is invalid or file not found.
   */
  deleteFile(fileUrl: string): Promise<void>;
}
