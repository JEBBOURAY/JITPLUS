import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { hapticLight, hapticSuccess, safeSelection } from '@/utils/haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

describe('optional haptic feedback', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the requested native feedback', () => {
    hapticLight();
    hapticSuccess();
    safeSelection();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('never prevents an action when native feedback fails', async () => {
    jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error('Not available'));
    expect(hapticLight).not.toThrow();
    await Promise.resolve();
    jest.mocked(Haptics.impactAsync).mockImplementationOnce(() => { throw new Error('No native module'); });
    expect(hapticLight).not.toThrow();
  });

  it('skips native feedback on the web', () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web');
    hapticLight();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    platform.restore();
  });
});
