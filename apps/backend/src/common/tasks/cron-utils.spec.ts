import { Logger } from '@nestjs/common';

jest.mock('@sentry/nestjs', () => ({ captureMessage: jest.fn() }));

describe('isCronEnabled', () => {
  const env = { ...process.env };
  const logger = { log: jest.fn(), error: jest.fn() } as unknown as Logger;

  // The "warned once" flag is module state: load a fresh copy per test,
  // together with the Sentry mock that copy sees.
  let Sentry: { captureMessage: jest.Mock };
  function load() {
    let mod!: typeof import('./cron-utils');
    jest.isolateModules(() => {
      mod = require('./cron-utils');
      Sentry = require('@sentry/nestjs');
    });
    return mod;
  }

  afterEach(() => {
    process.env = { ...env };
    jest.clearAllMocks();
  });

  it('is on by default in production and off elsewhere', () => {
    delete process.env.ENABLE_CRONS;
    process.env.NODE_ENV = 'production';
    expect(load().isCronEnabled(logger, 'A')).toBe(true);
    process.env.NODE_ENV = 'development';
    expect(load().isCronEnabled(logger, 'A')).toBe(false);
  });

  it('reports crons explicitly disabled in production to Sentry, once', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_CRONS = 'false';
    const { isCronEnabled } = load();
    expect(isCronEnabled(logger, 'A')).toBe(false);
    expect(isCronEnabled(logger, 'B')).toBe(false);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Crons disabled in production',
      expect.objectContaining({ level: 'warning', extra: { ENABLE_CRONS: 'false' } }),
    );
  });

  it('does not alert Sentry outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_CRONS = 'false';
    const { isCronEnabled } = load();
    isCronEnabled(logger, 'A');
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
