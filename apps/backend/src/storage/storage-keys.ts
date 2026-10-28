import { extname } from 'path';
import { randomBytes } from 'crypto';

export const ALLOWED_UPLOAD_FOLDERS = new Set(['logos', 'products', 'stores', 'covers', 'gallery', 'rewards', 'card-backgrounds', 'deals']);

const OWNER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)?$/;

/** Sanitize a filename: keep only safe chars, strip path separators, add a random suffix. */
export function safeFilename(original: string): string {
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

/**
 * Object key of a new upload: `<folder>/<ownerId>/<file>`. The owner segment is
 * what lets the API tell which merchant an uploaded file belongs to.
 */
export function buildUploadKey(folder: string, ownerId: string, originalName: string): string {
  if (!ALLOWED_UPLOAD_FOLDERS.has(folder)) {
    throw new Error(`Dossier non autorisé : ${folder}`);
  }
  if (!OWNER_ID_PATTERN.test(ownerId)) {
    throw new Error('Identifiant de propriétaire invalide');
  }
  return `${folder}/${ownerId}/${safeFilename(originalName)}`;
}

/**
 * True only for keys produced by {@link buildUploadKey} for this owner.
 * Legacy keys (`<folder>/<file>`, uploaded before owner prefixes existed)
 * have no owner and are never considered owned.
 */
export function isKeyOwnedBy(key: string, ownerId: string): boolean {
  if (!OWNER_ID_PATTERN.test(ownerId)) return false;
  const parts = key.split('/');
  return (
    parts.length === 3 &&
    ALLOWED_UPLOAD_FOLDERS.has(parts[0]) &&
    parts[1] === ownerId &&
    FILE_NAME_PATTERN.test(parts[2])
  );
}
