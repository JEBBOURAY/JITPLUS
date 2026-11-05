import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { QrTokenService } from './qr-token.service';
import type { IQrNonceRepository } from '../../common/repositories';

const SECRET = 'test-qr-secret';
const CLIENT_ID = '0b9c2f4e-5d1a-4c3b-9e8f-7a6b5c4d3e2f';
const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (input: string) => createHmac('sha256', SECRET).update(input).digest('base64url');

function setup() {
  const qrNonce = {
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue(SECRET) } as unknown as ConfigService;
  const service = new QrTokenService(config, qrNonce as unknown as IQrNonceRepository);
  return { service, qrNonce };
}

function v2Token(clientId = CLIENT_ID, exp = Math.floor(Date.now() / 1000) + 60, nonce = 'n1') {
  return `v2.${b64(clientId)}.${exp}.${nonce}.${sign(`v2:${clientId}:${exp}:${nonce}`)}`;
}

describe('QrTokenService', () => {
  it('accepts a valid v2 token and burns its nonce', async () => {
    const { service, qrNonce } = setup();
    await expect(service.resolveClientId(v2Token())).resolves.toBe(CLIENT_ID);
    expect(qrNonce.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ nonce: 'n1' }) }));
  });

  it('rejects a replayed v2 nonce', async () => {
    const { service, qrNonce } = setup();
    qrNonce.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.resolveClientId(v2Token())).rejects.toThrow('déjà utilisé');
  });

  it('rejects an expired v2 token', async () => {
    const { service } = setup();
    await expect(service.resolveClientId(v2Token(CLIENT_ID, 1000))).rejects.toThrow('expiré');
  });

  it('rejects a tampered signature', async () => {
    const { service } = setup();
    const token = v2Token().replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    await expect(service.resolveClientId(token)).rejects.toThrow(BadRequestException);
  });

  it('rejects a correctly signed token whose id is not a UUID', async () => {
    const { service } = setup();
    await expect(service.resolveClientId(v2Token('not-a-uuid'))).rejects.toThrow('QR code invalide');
  });

  it('accepts legacy v1 and v0 tokens', async () => {
    const { service } = setup();
    const id = b64(CLIENT_ID);
    await expect(service.resolveClientId(`v1.${id}.${sign(`v1:${CLIENT_ID}`)}`)).resolves.toBe(CLIENT_ID);
    await expect(service.resolveClientId(`${id}.${sign(CLIENT_ID)}`)).resolves.toBe(CLIENT_ID);
  });

  it('strips invisible characters injected by scanners', async () => {
    const { service } = setup();
    await expect(service.resolveClientId(`﻿${v2Token()}\n`)).resolves.toBe(CLIENT_ID);
  });
});
