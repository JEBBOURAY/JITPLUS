import { BadRequestException, Logger } from '@nestjs/common';
import { IStorageProvider } from '../common/interfaces';

type MaybeUrl = string | null | undefined;
type OwnershipChecker = Pick<IStorageProvider, 'isOwnedBy'>;

export const FOREIGN_IMAGE_MESSAGE =
  'Image non autorisée : utilisez une image envoyée depuis votre compte.';

const logger = new Logger('ImageOwnership');

/**
 * A merchant may only reference an image it uploaded itself, or one it already
 * references (legacy files uploaded before owner prefixes cannot be attributed
 * otherwise). This blocks pointing a profile at another merchant's file, which
 * the old-file cleanup would then delete.
 */
export function assertImageAssignable(
  storage: OwnershipChecker,
  ownerId: string,
  url: MaybeUrl,
  alreadyReferenced: readonly MaybeUrl[] = [],
): void {
  if (url == null) return;
  if (alreadyReferenced.includes(url) || storage.isOwnedBy(url, ownerId)) return;
  throw new BadRequestException(FOREIGN_IMAGE_MESSAGE);
}

export const PROFILE_IMAGE_FIELDS = ['logoUrl', 'coverUrl', 'cardBackgroundUrl'] as const;
type ProfileImageField = (typeof PROFILE_IMAGE_FIELDS)[number];

export type ProfileImages = { [K in ProfileImageField]?: string | null } & { gallery?: string[] | null };

/**
 * Validate the image fields of a profile update and return the previously
 * stored URLs that the update stops referencing (to clean up once it is saved).
 */
export function planProfileImageChanges(
  storage: OwnershipChecker,
  ownerId: string,
  current: ProfileImages,
  update: ProfileImages,
): string[] {
  const replaced: string[] = [];
  const stillUsed = new Set<string>();

  for (const field of PROFILE_IMAGE_FIELDS) {
    const previous = current[field] ?? null;
    const next = update[field];
    if (next === undefined) {
      if (previous) stillUsed.add(previous);
      continue;
    }
    assertImageAssignable(storage, ownerId, next, [previous]);
    if (next) stillUsed.add(next);
    if (previous && previous !== next) replaced.push(previous);
  }

  const previousGallery = Array.isArray(current.gallery) ? current.gallery : [];
  if (Array.isArray(update.gallery)) {
    for (const url of update.gallery) assertImageAssignable(storage, ownerId, url, previousGallery);
    update.gallery.forEach((url) => stillUsed.add(url));
    replaced.push(...previousGallery.filter((url) => !update.gallery!.includes(url)));
  } else {
    previousGallery.forEach((url) => stillUsed.add(url));
  }

  return [...new Set(replaced)].filter((url) => !stillUsed.has(url));
}

/**
 * Best-effort, fire-and-forget deletion restricted to files stored under this
 * owner's prefix. Legacy (un-prefixed) files are left in place on purpose:
 * their owner cannot be proven.
 */
export function deleteOwnedFiles(storage: IStorageProvider, ownerId: string, urls: readonly MaybeUrl[]): void {
  for (const url of urls) {
    if (!url || !storage.isOwnedBy(url, ownerId)) continue;
    storage.deleteFile(url).catch((err: unknown) => {
      logger.warn(`Image cleanup failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}
