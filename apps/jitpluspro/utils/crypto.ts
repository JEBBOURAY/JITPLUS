import { logWarn } from '@/utils/devLogger';

type ExpoCryptoModule = typeof import('expo-crypto');

// expo-crypto is a native module: a top-level import runs requireNativeModule() at
// module-eval time and throws on binaries built without it (e.g. a dev client or
// Expo Go older than the JS SDK). The throw makes every importing route fail to load,
// which expo-router reports as "Cannot read property 'ErrorBoundary' of undefined".
let ExpoCrypto: ExpoCryptoModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ExpoCrypto = require('expo-crypto');
} catch (e) {
  logWarn('Crypto', 'expo-crypto native module unavailable, using JS fallback', e);
}

type WebCrypto = { getRandomValues?: (array: Uint8Array) => Uint8Array };

function fallbackRandomUUID(): string {
  const bytes = new Uint8Array(16);
  const webCrypto = (globalThis as { crypto?: WebCrypto }).crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    // Only used for idempotency keys and device IDs, which need uniqueness, not secrecy.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomUUID(): string {
  return ExpoCrypto ? ExpoCrypto.randomUUID() : fallbackRandomUUID();
}

/** Throws when the native module is missing; callers handle it like any sign-in failure. */
export async function sha256Hex(data: string): Promise<string> {
  if (!ExpoCrypto) throw new Error('expo-crypto native module unavailable');
  return ExpoCrypto.digestStringAsync(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
}
