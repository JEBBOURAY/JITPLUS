import { act, fireEvent, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import {
  DemoHintHost, hideDemoHint, markDemoSeen, recordDemoHintShown, shouldShowDemoHint, showDemoHint,
} from '@/components/demo/DemoHint';

beforeEach(async () => { await AsyncStorage.clear(); hideDemoHint(); });

describe('demo hint', () => {
  it('shows at most twice per page', async () => {
    expect(await shouldShowDemoHint('clients')).toBe(true);
    await recordDemoHintShown('clients');
    expect(await shouldShowDemoHint('clients')).toBe(true);
    await recordDemoHintShown('clients');
    expect(await shouldShowDemoHint('clients')).toBe(false);
    expect(await shouldShowDemoHint('messages')).toBe(true);
  });

  it('never shows again once the demo was watched', async () => {
    await markDemoSeen('roue');
    expect(await shouldShowDemoHint('roue')).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.DEMO_VIDEOS_SEEN))!)).toEqual(['roue']);
  });

  it('opens the demo when the bubble is pressed, then hides', () => {
    const onPress = jest.fn();
    const { getByRole, queryByRole } = render(<DemoHintHost />);
    act(() => showDemoHint({
      id: 'clients', rect: { x: 300, y: 50, width: 80, height: 36 },
      text: 'Voir', color: '#7C3AED', textColor: '#fff', isRTL: false, onPress,
    }));
    fireEvent.press(getByRole('button', { name: 'Voir' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(queryByRole('button')).toBeNull();
  });
});
