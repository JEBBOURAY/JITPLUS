import * as FileSystem from 'expo-file-system/legacy';
import api, { getApiBaseUrl, getAccessToken } from '@/services/api';
import i18n from '@/i18n';
import { MAX_LOGO_SIZE_BYTES } from '@/constants/app';

// Backend ceiling for image uploads (sharp optimizes down afterwards).
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const SUPPORTED_MIMES = new Set(Object.values(EXT_TO_MIME));

export function normalizeUploadMimeAndExt(uri: string, mimeType?: string | null): { mime: string; ext: string } {
  const rawExt = (uri.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedInputMime = (mimeType ?? '').toLowerCase();

  const inferredMime = rawExt ? EXT_TO_MIME[rawExt] : undefined;

  let mime = normalizedInputMime || inferredMime || 'image/jpeg';
  if (mime === 'image/jpg') mime = 'image/jpeg';

  // iOS can report original HEIC MIME even when picker returns a compatible JPG file.
  // If inferred MIME from file extension is supported, prefer it.
  if (!SUPPORTED_MIMES.has(mime) && inferredMime && SUPPORTED_MIMES.has(inferredMime)) {
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
 * Upload failure carrying the HTTP status in the axios-style `response` shape, so
 * `getErrorMessage` and the Sentry filter treat it like an API error, and the
 * native exception as `cause` (Sentry reports it as a linked exception).
 */
export class UploadError extends Error {
  readonly response?: { status: number; data?: unknown };

  constructor(message: string, opts: { status?: number; data?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = 'UploadError';
    if (opts.status !== undefined) this.response = { status: opts.status, data: opts.data };
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

// Cloud Run returns these when no instance handled the request (cold start,
// instance restart), so the upload was not processed and is safe to resend.
const RETRYABLE_STATUSES = new Set([502, 503]);

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
 *  3. Transient failures (network error, 502/503 from Cloud Run): one automatic
 *     retry with a short backoff.
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

  const retryDelay = () => new Promise((r) => setTimeout(r, 800));

  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await doUpload();
  } catch {
    await retryDelay();
    try {
      result = await doUpload();
    } catch (err) {
      throw new UploadError(i18n.t('upload.uploadFailed'), { cause: err });
    }
  }

  if (RETRYABLE_STATUSES.has(result.status)) {
    await retryDelay();
    try {
      result = await doUpload();
    } catch (err) {
      throw new UploadError(i18n.t('upload.uploadFailed'), { cause: err });
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
    let data: unknown;
    try {
      data = JSON.parse(result.body ?? '');
    } catch {
      // non-JSON body (proxy/HTML error page) — use generic message
    }
    throw new UploadError(i18n.t('upload.uploadFailed'), { status: result.status, data });
  }

  try {
    return JSON.parse(result.body) as Record<string, unknown> & { url: string };
  } catch (err) {
    throw new UploadError(i18n.t('errors.unexpectedError'), { cause: err });
  }
}
