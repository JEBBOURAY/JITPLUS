import * as FileSystem from 'expo-file-system/legacy';
import api, { getApiBaseUrl, getAccessToken } from '@/services/api';
import i18n from '@/i18n';
import { MAX_LOGO_SIZE_BYTES } from '@/constants/app';

// Backend ceiling for image uploads (sharp optimizes down afterwards).
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export function normalizeUploadMimeAndExt(uri: string, mimeType?: string | null): { mime: string; ext: string } {
  const rawExt = (uri.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedInputMime = (mimeType ?? '').toLowerCase();

  const extToMime: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  const allowedMimes = new Set(Object.values(extToMime));

  const inferredMime = rawExt ? extToMime[rawExt] : undefined;

  let mime = normalizedInputMime || inferredMime || 'image/jpeg';
  if (mime === 'image/jpg') mime = 'image/jpeg';

  // iOS can report original HEIC MIME even when picker returns a compatible JPG file.
  // If inferred MIME from file extension is supported, prefer it.
  if (!allowedMimes.has(mime) && inferredMime && allowedMimes.has(inferredMime)) {
    mime = inferredMime;
  }

  let ext = rawExt;
  if (!ext) {
    ext = mime.startsWith('image/') ? mime.slice(6) : 'jpg';
  }
  if (ext === 'jpeg') ext = 'jpg';

  return { mime, ext: ext || 'jpg' };
}

/**
 * Robust image upload via expo-file-system's NATIVE multipart upload (URLSession on iOS).
 *
 * Why not axios? React Native's XHR layer streams `file://` bodies through the JS
 * bridge and fails intermittently on iOS ("Network Error"), and the global axios
 * timeout kills slow photo uploads on cellular. `uploadAsync` streams natively
 * from disk with a proper multipart boundary — reliable on both platforms.
 *
 * Guarantees:
 *  1. Pre-flight: file exists + real on-disk size validated (iOS often omits
 *     `asset.fileSize`, so the picker value cannot be trusted).
 *  2. Auth: Bearer token attached; on 401 the token is refreshed (via an axios
 *     call that triggers the refresh interceptor) and the upload retried once.
 *  3. Transient network failures: one automatic retry with a short backoff.
 *  4. Errors: precise, localized messages (client validation / server message /
 *     network) — never a silent failure.
 */
export async function uploadImageNative(opts: {
  uri: string;
  endpoint: string; // e.g. '/merchant/upload-image?type=logo'
  mime: string;
  maxBytes?: number;
}): Promise<Record<string, unknown> & { url: string }> {
  const { uri, endpoint, mime, maxBytes = MAX_LOGO_SIZE_BYTES } = opts;

  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error(i18n.t('upload.fileNotFound'));
  }
  const realSize = 'size' in info ? (info.size as number) : 0;
  if (realSize > maxBytes) {
    throw new Error(i18n.t('upload.fileTooLarge'));
  }

  const url = `${getApiBaseUrl()}${endpoint}`;

  const doUpload = async (): Promise<FileSystem.FileSystemUploadResult> => {
    const token = await getAccessToken();
    return FileSystem.uploadAsync(url, uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: mime,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await doUpload();
  } catch {
    await new Promise((r) => setTimeout(r, 800));
    try {
      result = await doUpload();
    } catch {
      throw new Error(i18n.t('upload.uploadFailed'));
    }
  }

  if (result.status === 401) {
    try {
      await api.get('/merchant/profile'); // interceptor refreshes + caches a new token
      result = await doUpload();
    } catch {
      // handled below with the server's message
    }
  }

  if (result.status < 200 || result.status >= 300) {
    let serverMessage: string | undefined;
    try {
      const parsed = JSON.parse(result.body ?? '');
      const msg = parsed?.message;
      serverMessage = Array.isArray(msg) ? String(msg[0]) : msg ? String(msg) : undefined;
    } catch {
      // non-JSON body (proxy/HTML error page) — use generic message
    }
    throw new Error(serverMessage || i18n.t('upload.uploadFailed'));
  }

  try {
    return JSON.parse(result.body) as Record<string, unknown> & { url: string };
  } catch {
    throw new Error(i18n.t('errors.unexpectedError'));
  }
}
