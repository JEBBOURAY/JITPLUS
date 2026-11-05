import { detectCountry } from '@/utils/detectCountry';

function mockDevice(timeZone: string | undefined, locale: string) {
  jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    (() => ({ resolvedOptions: () => ({ timeZone, locale }) })) as unknown as typeof Intl.DateTimeFormat,
  );
}

describe('detectCountry', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the time zone set by the mobile network', () => {
    mockDevice('Africa/Casablanca', 'en-US');
    expect(detectCountry().code).toBe('MA');
    mockDevice('Europe/Paris', 'ar-MA');
    expect(detectCountry().code).toBe('FR');
  });

  it('picks Canada, not the United States, for a Canadian time zone', () => {
    mockDevice('America/Toronto', 'en-US');
    expect(detectCountry().code).toBe('CA');
  });

  it('falls back to the language region when the time zone is unknown', () => {
    mockDevice('Etc/UTC', 'fr-BE');
    expect(detectCountry().code).toBe('BE');
    mockDevice(undefined, 'ar-Arab-MA');
    expect(detectCountry().code).toBe('MA');
  });

  it('defaults to Morocco when nothing matches', () => {
    mockDevice('Etc/UTC', 'en');
    expect(detectCountry().code).toBe('MA');
    mockDevice('Etc/UTC', 'xx-ZZ');
    expect(detectCountry().code).toBe('MA');
  });

  it('defaults to Morocco when Intl is unavailable', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl');
    });
    expect(detectCountry().code).toBe('MA');
  });
});
