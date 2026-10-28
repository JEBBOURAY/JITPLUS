import { BadRequestException } from '@nestjs/common';
import { IStorageProvider } from '../common/interfaces';
import { assertImageAssignable, deleteOwnedFiles, planProfileImageChanges } from './image-ownership';
import { buildUploadKey, isKeyOwnedBy } from './storage-keys';

const ME = 'merchant-1';
const PREFIX = 'https://storage.googleapis.com/bucket/';
const own = (folder: string, name: string) => `${PREFIX}${folder}/${ME}/${name}_1a2b3c4d.webp`;
const foreign = (folder: string) => `${PREFIX}${folder}/merchant-2/x_1a2b3c4d.webp`;
const legacy = (folder: string) => `${PREFIX}${folder}/x_1a2b3c4d.webp`;

function storage(): jest.Mocked<IStorageProvider> {
  return {
    uploadFile: jest.fn(),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    isOwnedBy: jest.fn((url: string, ownerId: string) =>
      url.startsWith(PREFIX) && isKeyOwnedBy(url.slice(PREFIX.length), ownerId)),
  };
}

describe('storage keys', () => {
  it('prefixes new uploads with the owner id', () => {
    expect(buildUploadKey('logos', ME, 'Mon Logo.webp')).toMatch(/^logos\/merchant-1\/Mon_Logo_[0-9a-f]{8}\.webp$/);
  });

  it('refuses unknown folders and unsafe owner ids', () => {
    expect(() => buildUploadKey('../etc', ME, 'a.webp')).toThrow();
    expect(() => buildUploadKey('logos', '../x', 'a.webp')).toThrow();
  });

  it('recognizes only keys under the owner prefix', () => {
    expect(isKeyOwnedBy(`logos/${ME}/a_1.webp`, ME)).toBe(true);
    expect(isKeyOwnedBy('logos/merchant-2/a_1.webp', ME)).toBe(false);
    expect(isKeyOwnedBy('logos/a_1.webp', ME)).toBe(false);
    expect(isKeyOwnedBy(`logos/${ME}/../merchant-2/a.webp`, ME)).toBe(false);
    expect(isKeyOwnedBy(`unknown/${ME}/a.webp`, ME)).toBe(false);
  });
});

describe('assertImageAssignable', () => {
  it('accepts null, own uploads and already referenced URLs', () => {
    const s = storage();
    expect(() => assertImageAssignable(s, ME, null)).not.toThrow();
    expect(() => assertImageAssignable(s, ME, own('logos', 'a'))).not.toThrow();
    expect(() => assertImageAssignable(s, ME, legacy('logos'), [legacy('logos')])).not.toThrow();
  });

  it('rejects another merchant file, a legacy file not referenced, or an external URL', () => {
    const s = storage();
    for (const url of [foreign('logos'), legacy('logos'), 'https://evil.example/a.png']) {
      expect(() => assertImageAssignable(s, ME, url)).toThrow(BadRequestException);
    }
  });
});

describe('planProfileImageChanges', () => {
  it('rejects a logo pointing at another merchant file', () => {
    expect(() =>
      planProfileImageChanges(storage(), ME, { logoUrl: own('logos', 'old') }, { logoUrl: foreign('logos') }),
    ).toThrow(BadRequestException);
  });

  it('rejects a gallery entry that is neither current nor owned', () => {
    expect(() =>
      planProfileImageChanges(storage(), ME, { gallery: [legacy('gallery')] }, { gallery: [legacy('gallery'), foreign('gallery')] }),
    ).toThrow(BadRequestException);
  });

  it('allows reordering legacy gallery photos and lists removed ones', () => {
    const a = legacy('gallery');
    const b = own('gallery', 'b');
    const c = own('gallery', 'c');
    const replaced = planProfileImageChanges(storage(), ME, { gallery: [a, b, c] }, { gallery: [c, a] });
    expect(replaced).toEqual([b]);
  });

  it('lists replaced and cleared images, but not those still referenced elsewhere', () => {
    const logo = own('logos', 'l');
    const cover = own('covers', 'c');
    const replaced = planProfileImageChanges(
      storage(),
      ME,
      { logoUrl: logo, coverUrl: cover, gallery: [cover] },
      { logoUrl: null, coverUrl: own('covers', 'new') },
    );
    expect(replaced).toEqual([logo]);
  });
});

describe('deleteOwnedFiles', () => {
  it('deletes only files under the owner prefix', () => {
    const s = storage();
    deleteOwnedFiles(s, ME, [own('logos', 'a'), foreign('logos'), legacy('logos'), null, undefined]);
    expect(s.deleteFile).toHaveBeenCalledTimes(1);
    expect(s.deleteFile).toHaveBeenCalledWith(own('logos', 'a'));
  });
});
