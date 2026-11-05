import { BadRequestException, Logger } from '@nestjs/common';

// sharp is mocked: these tests cover the concurrency gate and error mapping,
// not libvips itself.
const mockToBuffer = jest.fn();
const mockSharp = jest.fn(() => {
  const chain = {
    resize: () => chain,
    webp: () => chain,
    toBuffer: mockToBuffer,
  };
  return chain;
});
const mockCache = jest.fn();
const mockConcurrency = jest.fn();
jest.mock('sharp', () => ({
  __esModule: true,
  default: Object.assign(mockSharp, { cache: mockCache, concurrency: mockConcurrency }),
}));

import {
  ImageOptimizerService,
  Semaphore,
  MAX_CONCURRENT_OPTIMIZATIONS,
  MAX_INPUT_PIXELS,
} from './image-optimizer.service';

const file = (): Express.Multer.File =>
  ({ buffer: Buffer.alloc(1000), originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 1000 }) as Express.Multer.File;

describe('Semaphore', () => {
  it('caps concurrent tasks and runs queued tasks FIFO', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];
    const task = (i: number) =>
      sem.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        order.push(i);
        active--;
        return i;
      });

    await expect(Promise.all([0, 1, 2, 3, 4].map(task))).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBe(2);
    expect(order.slice(2)).toEqual([2, 3, 4]);
    expect(sem.inFlight).toBe(0);
    expect(sem.queued).toBe(0);
  });

  it('releases the slot when a task throws', async () => {
    const sem = new Semaphore(1);
    await expect(sem.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok');
    expect(sem.inFlight).toBe(0);
  });
});

describe('ImageOptimizerService', () => {
  let logSpies: jest.SpyInstance[] = [];

  beforeEach(() => {
    logSpies = [
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
    ];
    mockToBuffer.mockReset();
    mockSharp.mockClear();
  });

  afterEach(() => logSpies.forEach((s) => s.mockRestore()));

  it('configures sharp once at load (no cache, single thread)', () => {
    expect(mockCache).toHaveBeenCalledWith(false);
    expect(mockConcurrency).toHaveBeenCalledWith(1);
  });

  it('passes limitInputPixels and returns a WebP Multer file', async () => {
    mockToBuffer.mockResolvedValue(Buffer.alloc(100));
    const out = await new ImageOptimizerService().optimize(file(), 'logo');
    expect(mockSharp).toHaveBeenCalledWith(expect.any(Buffer), { limitInputPixels: MAX_INPUT_PIXELS });
    expect(out).toMatchObject({ mimetype: 'image/webp', size: 100, originalname: 'photo.webp' });
  });

  it(`runs at most ${MAX_CONCURRENT_OPTIMIZATIONS} optimizations at once`, async () => {
    let active = 0;
    let maxActive = 0;
    mockToBuffer.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return Buffer.alloc(10);
    });
    const svc = new ImageOptimizerService();
    await Promise.all(Array.from({ length: 6 }, () => svc.optimize(file())));
    expect(maxActive).toBe(MAX_CONCURRENT_OPTIMIZATIONS);
  });

  it('maps the sharp pixel-limit error to a French BadRequestException', async () => {
    mockToBuffer.mockRejectedValue(new Error('Input image exceeds pixel limit'));
    const err = await new ImageOptimizerService().optimize(file()).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toMatch(/Image trop grande/);
  });

  it('rethrows other sharp errors unchanged', async () => {
    mockToBuffer.mockRejectedValue(new Error('unsupported image format'));
    await expect(new ImageOptimizerService().optimize(file())).rejects.toThrow('unsupported image format');
  });
});
