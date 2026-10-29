import { render, waitFor } from '@testing-library/react-native';
import { RewardManager } from '@/components/settings/RewardManager';
import { useRewards } from '@/hooks/useQueryHooks';
import type { ThemeColors } from '@/contexts/ThemeContext';

// Cold native-module loading is slow on the Windows-backed workspace.
jest.setTimeout(60_000);

jest.mock('@/hooks/useQueryHooks', () => ({
  useRewards: jest.fn(),
  useUploadRewardImage: () => ({ isPending: false }),
  queryKeys: { rewards: ['rewards'] },
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('@/services/api', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }));
jest.mock('@/components/PremiumLockModal', () => () => null);
jest.mock('@/components/settings/InfoHint', () => () => null);

const reward = { id: 'r1', titre: 'Café offert', cout: 5 };
const props = {
  theme: { mode: 'light', primary: '#7c3aed', primaryBg: '#ede9fe', text: '#111', textMuted: '#555', danger: '#f00' } as ThemeColors,
  t: (key: string) => key,
  isPremium: true,
  hasAccumulationLimit: false,
  accumulationLimit: '',
  stampsForReward: 10,
};

describe('reward settings cache', () => {
  it('uses the shared query and publishes refreshed rewards to the preview', async () => {
    const refetch = jest.fn();
    jest.mocked(useRewards).mockReturnValue({ data: [reward], isLoading: false, error: null, refetch } as unknown as ReturnType<typeof useRewards>);
    const onRewardsChange = jest.fn();
    const { getByText, rerender } = render(<RewardManager {...props} onRewardsChange={onRewardsChange} />);
    expect(getByText('Café offert')).toBeTruthy();
    await waitFor(() => expect(onRewardsChange).toHaveBeenLastCalledWith([reward]));

    const updated = { ...reward, titre: 'Thé offert' };
    jest.mocked(useRewards).mockReturnValue({ data: [updated], isLoading: false, error: null, refetch } as unknown as ReturnType<typeof useRewards>);
    rerender(<RewardManager {...props} onRewardsChange={onRewardsChange} reloadToken={1} />);
    expect(getByText('Thé offert')).toBeTruthy();
    await waitFor(() => expect(onRewardsChange).toHaveBeenLastCalledWith([updated]));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
