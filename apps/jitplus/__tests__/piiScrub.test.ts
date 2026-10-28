import { scrubPii, scrubSentryEvent } from '@/utils/piiScrub';

const JWT = `${'h'.repeat(24)}.${'p'.repeat(24)}.${'s'.repeat(24)}`;

describe('scrubPii', () => {
  it('masks emails, Moroccan phone numbers and JWTs', () => {
    expect(scrubPii('user a.b+c@mail.co.ma failed')).toBe('user [email] failed');
    expect(scrubPii('call 0612345678 or +212 6 12 34 56 78')).toBe('call [phone] or [phone]');
    expect(scrubPii(`Bearer ${JWT}`)).toBe('[token]');
  });

  it('leaves ordinary text alone', () => {
    expect(scrubPii('Request failed with status code 500')).toBe('Request failed with status code 500');
  });
});

describe('scrubSentryEvent', () => {
  it('drops expected auth failures', () => {
    expect(scrubSentryEvent({ exception: { values: [{ value: 'Session expired' }] } })).toBeNull();
    expect(scrubSentryEvent({ exception: { values: [{ value: 'No refresh token' }] } })).toBeNull();
  });

  it('scrubs messages, exceptions and breadcrumbs, and removes user identifiers', () => {
    const event = scrubSentryEvent({
      message: 'login a@b.ma',
      exception: { values: [{ value: 'phone 0712345678' }] },
      breadcrumbs: [{ message: `token ${JWT}`, data: { url: '/x?email=a@b.ma', status: 500 } }],
      user: { email: 'a@b.ma', username: 'ayoub', ip_address: '1.2.3.4' },
    });
    expect(event).toEqual({
      message: 'login [email]',
      exception: { values: [{ value: 'phone [phone]' }] },
      breadcrumbs: [{ message: 'token [token]', data: { url: '/x?email=[email]', status: 500 } }],
      user: {},
    });
  });
});
