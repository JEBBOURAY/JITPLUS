import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k: string) => Promise.resolve(mockStore.get(k) ?? null)),
    setItem: jest.fn((k: string, v: string) => { mockStore.set(k, v); return Promise.resolve(); }),
  },
}));
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  close: jest.fn(() => Promise.resolve()),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));

type SentryModule = typeof import('@/services/sentry');
const init = Sentry.init as jest.Mock;
const close = Sentry.close as jest.Mock;
const flush = () => new Promise<void>((r) => setImmediate(() => r()));

function load(): SentryModule {
  let mod!: SentryModule;
  jest.isolateModules(() => { mod = require('@/services/sentry'); });
  return mod;
}

function beforeSend() {
  return init.mock.calls[init.mock.calls.length - 1][0].beforeSend as (e: object) => Promise<object | null>;
}

describe('crash reporting opt-out', () => {
  beforeEach(() => { mockStore.clear(); jest.clearAllMocks(); });

  it('stays on and sends events when the user never opted out', async () => {
    const { initSentry, isCrashReportingEnabled } = load();
    initSentry();
    await flush();
    expect(close).not.toHaveBeenCalled();
    expect(await isCrashReportingEnabled()).toBe(true);
    expect(await beforeSend()({ message: 'boom' })).not.toBeNull();
  });

  it('drops events and shuts down when a stored opt-out is found', async () => {
    mockStore.set('sentry_opt_out', 'true');
    const { initSentry, isCrashReportingEnabled } = load();
    initSentry();
    const pending = beforeSend()({ message: 'early crash' });
    await flush();
    expect(await pending).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
    expect(await isCrashReportingEnabled()).toBe(false);
  });

  it('persists the choice and restarts when re-enabled', async () => {
    const { initSentry, setCrashReportingEnabled } = load();
    initSentry();
    await flush();

    await setCrashReportingEnabled(false);
    expect(close).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('sentry_opt_out', 'true');
    expect(await beforeSend()({ message: 'x' })).toBeNull();

    await setCrashReportingEnabled(true);
    expect(init).toHaveBeenCalledTimes(2);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('sentry_opt_out', 'false');
    expect(await beforeSend()({ message: 'x' })).not.toBeNull();
  });

  it('keeps a choice made while the stored value was still loading', async () => {
    mockStore.set('sentry_opt_out', 'true');
    const { initSentry, setCrashReportingEnabled } = load();
    initSentry();
    await setCrashReportingEnabled(true);
    await flush();
    expect(close).not.toHaveBeenCalled();
  });
});
