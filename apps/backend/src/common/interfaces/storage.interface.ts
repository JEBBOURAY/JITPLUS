// ── Storage Provider Interface ───────────────────────────────────────────────
// Abstract away the file storage backend (GCS, S3, Azure Blob, local disk).

export interface IStorageProvider {
  /**
   * Upload a file and return its public URL.
   * @param file  Multer file object (buffer + metadata)
   * @param folder  Destination folder path (e.g. 'logos', 'products')
   * @param ownerId  Merchant id the file belongs to; stored in the object key
   */
  uploadFile(file: Express.Multer.File, folder: string, ownerId: string): Promise<string>;

  /**
   * Delete a file by its public URL. No-op if URL is invalid or file not found.
   * Callers must check {@link isOwnedBy} first: this method does not know who
   * is asking.
   */
  deleteFile(fileUrl: string): Promise<void>;

  /** True if the URL points to a file this provider stored for `ownerId`. */
  isOwnedBy(fileUrl: string, ownerId: string): boolean;
}
