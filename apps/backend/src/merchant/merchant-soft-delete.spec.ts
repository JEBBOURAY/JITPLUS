import { softDeleteMerchantInTx } from './merchant-soft-delete';
import type { TransactionClient } from '../common/repositories';

describe('softDeleteMerchantInTx', () => {
  const model = () => ({ update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() });
  const tx = {
    merchant: model(), teamMember: model(), store: model(), loyaltyCard: model(),
    deviceSession: model(), merchantNotificationRead: model(), merchantInboxNotification: model(),
    notification: model(), reward: model(), profileView: model(), clientReferral: model(),
  };
  const now = new Date('2026-11-11T10:00:00Z');

  beforeAll(() => softDeleteMerchantInTx(tx as unknown as TransactionClient, 'm1', now, 'hashed-placeholder'));

  it('anonymises the merchant so its identifiers can be reused', () => {
    const { data } = tx.merchant.update.mock.calls[0][0];
    expect(tx.merchant.update.mock.calls[0][0].where).toEqual({ id: 'm1' });
    expect(data).toMatchObject({
      deletedAt: now, email: 'deleted_m1', password: '', googleId: null, appleId: null,
      pushToken: null, phoneNumber: null, referralCode: null, isActive: false,
    });
  });

  it('locks team members with the given placeholder, never an empty password', () => {
    expect(tx.teamMember.updateMany).toHaveBeenCalledWith({
      where: { merchantId: 'm1' },
      data: { isActive: false, password: 'hashed-placeholder' },
    });
  });

  it('deactivates stores and live cards, and revokes every session', () => {
    expect(tx.store.updateMany).toHaveBeenCalledWith({ where: { merchantId: 'm1' }, data: { isActive: false } });
    expect(tx.loyaltyCard.updateMany).toHaveBeenCalledWith({
      where: { merchantId: 'm1', deactivatedAt: null },
      data: { deactivatedAt: now },
    });
    expect(tx.deviceSession.deleteMany).toHaveBeenCalledWith({ where: { merchantId: 'm1' } });
  });

  it.each([
    'merchantNotificationRead', 'merchantInboxNotification', 'notification', 'reward', 'profileView', 'clientReferral',
  ] as const)('drops %s rows', (name) => {
    expect(tx[name].deleteMany).toHaveBeenCalledWith({ where: { merchantId: 'm1' } });
  });
});
