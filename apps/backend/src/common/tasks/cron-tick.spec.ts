import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { ExecutionContext } from '@nestjs/common';
import { CronTickService, isDueAt, tickSlot, TICK_MAX_SKEW_MS } from './cron-tick.service';
import { CronTickAuthGuard } from './cron-tick-auth.guard';
import { drainBackground, pendingBackgroundCount, trackBackground } from './background-work';

// `cron` is a dependency of @nestjs/schedule only: load the very copy it uses.
// eslint-disable-next-line @typescript-eslint/no-require-imports
type CronJob = ReturnType<SchedulerRegistry['getCronJobs']> extends Map<string, infer J> ? J : never;
const { CronJob } = require(require.resolve('cron', { paths: [require.resolve('@nestjs/schedule')] })) as {
  CronJob: { from(params: Record<string, unknown>): CronJob };
};

const at = (iso: string) => new Date(iso);
const job = (cronTime: string, onTick: () => unknown = () => undefined, timeZone?: string) =>
  CronJob.from({ cronTime, onTick: onTick as () => void, start: false, ...(timeZone ? { timeZone } : {}) });

describe('isDueAt', () => {
  it('matches only the minutes of the expression', () => {
    const every5 = job('*/5 * * * *');
    expect(isDueAt(every5, at('2026-11-24T10:05:00Z'))).toBe(true);
    expect(isDueAt(every5, at('2026-11-24T10:06:00Z'))).toBe(false);
    expect(isDueAt(job('* * * * *'), at('2026-11-24T03:07:00Z'))).toBe(true);
  });

  it("uses the job's own time zone, like the timer would", () => {
    const noonUtc = job('0 12 * * *', undefined, 'UTC');
    expect(isDueAt(noonUtc, at('2026-11-24T12:00:00Z'))).toBe(true);
    expect(isDueAt(noonUtc, at('2026-11-24T11:00:00Z'))).toBe(false);
    const noonTokyo = job('0 12 * * *', undefined, 'Asia/Tokyo'); // UTC+9, no DST
    expect(isDueAt(noonTokyo, at('2026-11-24T03:00:00Z'))).toBe(true);
    expect(isDueAt(noonTokyo, at('2026-11-24T12:00:00Z'))).toBe(false);
  });
});

describe('tickSlot', () => {
  it("floors Cloud Scheduler's planned time to the minute", () => {
    expect(tickSlot('2026-11-24T10:05:00.412Z').toISOString()).toBe('2026-11-24T10:05:00.000Z');
  });
  it('falls back to now when the header is missing or invalid', () => {
    const now = at('2026-11-24T10:05:37Z');
    expect(tickSlot(undefined, now).toISOString()).toBe('2026-11-24T10:05:00.000Z');
    expect(tickSlot('not a date', now).toISOString()).toBe('2026-11-24T10:05:00.000Z');
  });
});

describe('CronTickService', () => {
  const build = (jobs: CronJob[]) => {
    const registry = { getCronJobs: () => new Map(jobs.map((j, i) => [`job${i}`, j])) } as unknown as SchedulerRegistry;
    return new CronTickService(registry);
  };

  it('stops the running timers and only ticks those (a disabled @Cron stays off)', async () => {
    const ran: string[] = [];
    const active = job('* * * * *', () => ran.push('active'));
    const disabled = job('* * * * *', () => ran.push('disabled'));
    active.start();
    const service = build([active, disabled]);

    expect(service.stopInProcessTimers()).toBe(1);
    expect(active.isActive).toBe(false);

    const slot = at('2026-11-24T10:05:00Z');
    const res = await service.tick(slot, slot);
    expect(res).toEqual({ slot: slot.toISOString(), ran: 1 });
    expect(ran).toEqual(['active']);
  });

  it('runs due jobs in parallel and waits for them to finish', async () => {
    const order: string[] = [];
    const slow = (name: string, ms: number) => () =>
      new Promise<void>((resolve) => setTimeout(() => { order.push(name); resolve(); }, ms));
    const a = job('*/5 * * * *', slow('a', 30));
    const b = job('*/5 * * * *', slow('b', 10));
    const notDue = job('0 3 * * *', () => order.push('notDue'));
    [a, b, notDue].forEach((j) => j.start());
    const service = build([a, b, notDue]);
    service.stopInProcessTimers();

    const slot = at('2026-11-24T10:05:00Z');
    const started = Date.now();
    const res = await service.tick(slot, slot);
    expect(res.ran).toBe(2);
    expect(order).toEqual(['b', 'a']);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('a job error does not fail the tick or the other jobs', async () => {
    const ran: string[] = [];
    const bad = job('* * * * *', async () => { throw new Error('boom'); });
    const good = job('* * * * *', () => ran.push('good'));
    [bad, good].forEach((j) => j.start());
    const service = build([bad, good]);
    service.stopInProcessTimers();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const slot = at('2026-11-24T10:05:00Z');
    await expect(service.tick(slot, slot)).resolves.toMatchObject({ ran: 2 });
    expect(ran).toEqual(['good']);
    errSpy.mockRestore();
  });

  it('skips a stale tick (late retry) without running anything', async () => {
    const ran: string[] = [];
    const j = job('* * * * *', () => ran.push('x'));
    j.start();
    const service = build([j]);
    service.stopInProcessTimers();
    const slot = at('2026-11-24T10:05:00Z');
    const res = await service.tick(slot, new Date(slot.getTime() + TICK_MAX_SKEW_MS + 60_000));
    expect(res).toMatchObject({ ran: 0, skipped: 'stale' });
    expect(ran).toEqual([]);
  });

  it('waits for background work started by requests', async () => {
    const service = build([]);
    service.stopInProcessTimers();
    let done = false;
    void trackBackground(new Promise<void>((resolve) => setTimeout(() => { done = true; resolve(); }, 20)));
    const slot = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    await service.tick(slot);
    expect(done).toBe(true);
  });
});

describe('background work', () => {
  it('forgets settled work, rejected or not, and keeps the original promise', async () => {
    const failing = Promise.reject(new Error('nope'));
    const tracked = trackBackground(failing);
    expect(tracked).toBe(failing);
    await expect(tracked).rejects.toThrow('nope');
    await trackBackground(Promise.resolve(1));
    expect(pendingBackgroundCount()).toBe(0);
  });

  it('gives up after maxMs and reports what is left', async () => {
    let release!: () => void;
    void trackBackground(new Promise<void>((resolve) => { release = resolve; }));
    expect(await drainBackground(30, 10)).toBe(1);
    release();
    expect(await drainBackground(100, 10)).toBe(0);
  });

  it('picks up work chained from drained work', async () => {
    let second = false;
    void trackBackground(
      new Promise<void>((resolve) => setTimeout(resolve, 10)).then(() => {
        void trackBackground(new Promise<void>((r) => setTimeout(() => { second = true; r(); }, 10)));
      }),
    );
    expect(await drainBackground(500, 5)).toBe(0);
    expect(second).toBe(true);
  });
});

describe('CronTickAuthGuard', () => {
  const INVOKER = 'cron-invoker@jitplus-97259.iam.gserviceaccount.com';
  const AUDIENCE = 'https://api.example.test/api/v1/internal/cron/tick';
  const env = { ...process.env };
  const ctx = (authorization?: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }) }) as unknown as ExecutionContext;
  const guard = (payload?: Record<string, unknown>, verifyError?: Error) => {
    const config = { get: (k: string) => ({ CRON_TICK_AUDIENCE: AUDIENCE, CRON_TICK_INVOKER: INVOKER })[k] } as unknown as ConfigService;
    const g = new CronTickAuthGuard(config);
    const verifyIdToken = jest.fn(async () => {
      if (verifyError) throw verifyError;
      return { getPayload: () => payload };
    });
    (g as unknown as { client: { verifyIdToken: typeof verifyIdToken } }).client = { verifyIdToken };
    return { g, verifyIdToken };
  };

  beforeEach(() => { process.env.CRON_MODE = 'http'; });
  afterAll(() => { process.env = env; });

  it('accepts a verified token of the invoker account, checked against the audience', async () => {
    const { g, verifyIdToken } = guard({ email: INVOKER, email_verified: true });
    await expect(g.canActivate(ctx('Bearer tok'))).resolves.toBe(true);
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'tok', audience: AUDIENCE });
  });

  it('refuses another account, an unverified e-mail, a bad token or no token', async () => {
    await expect(guard({ email: 'someone@gmail.com', email_verified: true }).g.canActivate(ctx('Bearer tok'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard({ email: INVOKER, email_verified: false }).g.canActivate(ctx('Bearer tok'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard(undefined, new Error('Wrong recipient')).g.canActivate(ctx('Bearer tok'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard({ email: INVOKER, email_verified: true }).g.canActivate(ctx())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('hides the route when crons run on timers', async () => {
    process.env.CRON_MODE = 'timer';
    await expect(guard({ email: INVOKER, email_verified: true }).g.canActivate(ctx('Bearer tok'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
