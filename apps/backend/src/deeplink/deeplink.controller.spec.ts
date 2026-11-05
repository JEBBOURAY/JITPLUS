import type { Response } from 'express';
import { DeeplinkController } from './deeplink.controller';

function mockResponse() {
  const res = { type: jest.fn(), send: jest.fn() };
  res.type.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
}

function renderRegisterLink(ref: string | undefined): string {
  const res = mockResponse();
  new DeeplinkController().handleProRegisterLink(ref, res as unknown as Response);
  expect(res.type).toHaveBeenCalledWith('html');
  return res.send.mock.calls[0][0] as string;
}

describe('Pro sign-up invitation link (pro/register)', () => {
  it('opens the register screen with the sponsor code', () => {
    const html = renderRegisterLink('ABCD1234');
    expect(html).toContain('jitpluspro://register?ref=ABCD1234');
    expect(html).toContain('intent://register?ref=ABCD1234#Intent;scheme=jitpluspro;');
  });

  it('drops a malformed code instead of putting it in the page', () => {
    const html = renderRegisterLink('"><script>alert(1)</script>');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('?ref=');
    expect(html).toContain('jitpluspro://register');
  });

  it('rejects codes outside 4–20 characters', () => {
    expect(renderRegisterLink('AB')).not.toContain('?ref=');
    expect(renderRegisterLink('A'.repeat(21))).not.toContain('?ref=');
  });

  it('opens the register screen when there is no code', () => {
    const html = renderRegisterLink(undefined);
    expect(html).toContain('jitpluspro://register');
    expect(html).not.toContain('?ref=');
  });
});
