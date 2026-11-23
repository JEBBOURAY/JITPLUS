import { api } from '@/services/api';
import { saveClientLanguage } from '@/services/clientLanguage';
import { useAuthStore } from '@/stores/authStore';
import type { Client } from '@/types';

jest.mock('@/services/api', () => ({ api: { updateProfile: jest.fn() } }));

const updateProfile = api.updateProfile as jest.Mock;
const client = { id: 'c1', prenom: 'Sara', language: 'fr' } as Client;

describe('saveClientLanguage', () => {
  beforeEach(() => {
    updateProfile.mockReset();
    useAuthStore.getState().setClient(client);
  });

  it('patches the store at once and saves on the server', async () => {
    let resolve!: () => void;
    updateProfile.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    const pending = saveClientLanguage('ar');
    expect(useAuthStore.getState().client?.language).toBe('ar');
    resolve();
    await pending;
    expect(updateProfile).toHaveBeenCalledWith({ language: 'ar' });
    expect(useAuthStore.getState().client?.language).toBe('ar');
  });

  it('rolls the store back when the server refuses', async () => {
    updateProfile.mockRejectedValue(new Error('offline'));
    await expect(saveClientLanguage('en')).rejects.toThrow('offline');
    expect(useAuthStore.getState().client?.language).toBe('fr');
  });

  it('leaves a client that changed meanwhile alone', async () => {
    updateProfile.mockImplementation(async () => {
      useAuthStore.getState().setClient(null);
      throw new Error('offline');
    });
    await expect(saveClientLanguage('en')).rejects.toThrow();
    expect(useAuthStore.getState().client).toBeNull();
  });

  it('still saves when signed out (no store patch)', async () => {
    useAuthStore.getState().setClient(null);
    updateProfile.mockResolvedValue(undefined);
    await saveClientLanguage('en');
    expect(updateProfile).toHaveBeenCalledWith({ language: 'en' });
    expect(useAuthStore.getState().client).toBeNull();
  });
});
