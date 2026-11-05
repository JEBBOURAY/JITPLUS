import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_MESSAGES, requestLang, resolveErrorKey } from './error-messages';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

function run(exception: unknown, headers: Record<string, string> = {}) {
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) };
  const req = { method: 'POST', path: '/x', ip: '1.1.1.1', headers };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) };
  new AllExceptionsFilter().catch(exception, host as never);
  return { status: res.status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('error key translation', () => {
  it('has fr/en/ar text for every error key thrown in src', () => {
    const used = new Set<string>();
    for (const f of sourceFiles(join(__dirname, '..', '..'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'(error\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'/g)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !ERROR_MESSAGES[k]);
    expect(missing).toEqual([]);
    for (const [, t] of Object.entries(ERROR_MESSAGES)) {
      expect(t.fr && t.en && t.ar).toBeTruthy();
    }
  });

  it('sends the French text by default and the key as code', () => {
    const { status, body } = run(new BadRequestException('error.auth.emailExists'));
    expect(status).toBe(400);
    expect(body).toMatchObject({ message: 'Cette adresse email est déjà utilisée.', code: 'error.auth.emailExists' });
  });

  it('follows x-lang / Accept-Language', () => {
    expect(run(new HttpException('error.auth.otpWait', HttpStatus.TOO_MANY_REQUESTS), { 'accept-language': 'ar-MA,fr;q=0.8' }).body.message)
      .toBe(ERROR_MESSAGES['error.auth.otpWait'].ar);
    expect(requestLang({ 'x-lang': 'en', 'accept-language': 'ar' })).toBe('en');
    expect(requestLang({ 'accept-language': 'de-DE,en;q=0.5' })).toBe('en');
    expect(requestLang({})).toBe('fr');
  });

  it('leaves plain messages, validation arrays and explicit codes untouched', () => {
    expect(run(new BadRequestException('Code invalide')).body).toMatchObject({ message: 'Code invalide' });
    expect(run(new BadRequestException(['nom must be a string'])).body.message).toEqual(['nom must be a string']);
    const withCode = run(new BadRequestException({ message: 'error.referral.minAmount', code: 'PAYOUT_MIN' })).body;
    expect(withCode).toMatchObject({ code: 'PAYOUT_MIN', message: ERROR_MESSAGES['error.referral.minAmount'].fr });
  });

  it('never leaks an unknown key', () => {
    expect(resolveErrorKey('error.auth.somethingNew', 'fr')).toBe('Une erreur est survenue. Veuillez réessayer.');
    expect(resolveErrorKey('Erreur de base de données.', 'fr')).toBeNull();
  });
});
