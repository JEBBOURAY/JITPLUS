import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ResendService } from './resend.service';
import type { IMailProvider } from '../common/interfaces';

describe('ResendService — SMTP fallback blast', () => {
  it('sends with at most 3 in flight and keeps the success/failure accounting', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const sendRaw = jest.fn(async (to: string) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (to.startsWith('bad')) throw new Error('rejected');
    });
    const config = { get: jest.fn((_k: string, def?: unknown) => def) } as unknown as ConfigService;
    const jwt = { sign: jest.fn(() => 'tok') } as unknown as JwtService;
    const service = new ResendService(config, { sendRaw } as unknown as IMailProvider, jwt);

    const recipients = Array.from({ length: 10 }, (_, i) => ({ email: `${i % 4 === 0 ? 'bad' : 'ok'}${i}@x.ma`, clientId: `c${i}` }));
    const res = await service.sendBlast(recipients, 'Subject', 'Body', { nom: 'Shop' });

    expect(sendRaw).toHaveBeenCalledTimes(10);
    expect(new Set(sendRaw.mock.calls.map((c) => c[0]))).toEqual(new Set(recipients.map((r) => r.email)));
    expect(maxInFlight).toBe(3);
    expect(res).toEqual({ total: 10, successCount: 7, failureCount: 3 });
  });
});
