import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SetupWizard from '@/components/setup/SetupWizard';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import type { Merchant } from '@/types';

// `mock*` names may be read lazily from jest.mock factories.
const mockReplace = jest.fn();
const mockMutateAsync = jest.fn<Promise<void>, []>();
// What the "reward" page's save resolves to in the test.
const mockState = { rewardSaveResult: true, rewardDirty: false };
const mockRewardSave = jest.fn(async () => mockState.rewardSaveResult);

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${Object.values(params).join(',')})` : key,
    isRTL: false,
    locale: 'fr',
  }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'light', bg: '#fff', bgCard: '#fff', bgInput: '#f1f5f9', text: '#0f172a', textSecondary: '#334155',
    textMuted: '#64748b', primary: '#7c3aed', primaryBg: '#ede9fe', border: '#e2e8f0', borderLight: '#f1f5f9',
    success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
  }),
  palette: { violet: '#7C3AED' },
}));
jest.mock('@/hooks/useQueryHooks', () => ({
  useCompleteOnboarding: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));
jest.mock('@/utils/haptics', () => ({ hapticSuccess: jest.fn(), hapticLight: jest.fn() }));

// Each page is covered by its own screen; here only the navigation matters.
jest.mock('@/components/setup/steps/BrandStep', () => ({
  BrandStep: () => jest.requireActual<typeof import('react')>('react').createElement(jest.requireActual<typeof import('react-native')>('react-native').Text, null, 'page:brand'),
}));
jest.mock('@/components/setup/steps/CardStep', () => ({
  CardStep: () => jest.requireActual<typeof import('react')>('react').createElement(jest.requireActual<typeof import('react-native')>('react-native').Text, null, 'page:card'),
}));
jest.mock('@/components/setup/steps/AboutStep', () => ({
  AboutStep: () => jest.requireActual<typeof import('react')>('react').createElement(jest.requireActual<typeof import('react-native')>('react-native').Text, null, 'page:about'),
}));
jest.mock('@/components/setup/steps/SocialStep', () => ({
  SocialStep: () => jest.requireActual<typeof import('react')>('react').createElement(jest.requireActual<typeof import('react-native')>('react-native').Text, null, 'page:social'),
}));
jest.mock('@/components/setup/steps/GalleryStep', () => ({
  GalleryStep: () => jest.requireActual<typeof import('react')>('react').createElement(jest.requireActual<typeof import('react-native')>('react-native').Text, null, 'page:gallery'),
}));
jest.mock('@/components/setup/steps/DoneStep', () => ({
  DoneStep: () => jest.requireActual<typeof import('react')>('react').createElement(jest.requireActual<typeof import('react-native')>('react-native').Text, null, 'page:done'),
}));
jest.mock('@/components/setup/steps/RewardStep', () => ({
  RewardStep: ({ registerSave }: { registerSave: (fn: (() => Promise<boolean>) | null, dirty?: boolean) => void }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => {
      registerSave(mockRewardSave, mockState.rewardDirty);
      return () => registerSave(null);
    }, [registerSave]);
    return React.createElement(jest.requireActual<typeof import('react-native')>('react-native').Text, null, 'page:reward');
  },
}));

const merchant = { id: 'm1', nom: 'Café Atlas', email: 'a@b.c', categorie: 'CAFE' } as Merchant;
const storageKey = `${ASYNC_STORAGE_KEYS.SETUP_STEP}:${merchant.id}`;

async function renderWizard(initialStep: Parameters<typeof SetupWizard>[0]['initialStep'] = null) {
  const utils = render(<SetupWizard merchant={merchant} initialStep={initialStep} />);
  await waitFor(() => expect(utils.queryByText(/^page:/)).toBeTruthy());
  return utils;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockReplace.mockClear();
  mockMutateAsync.mockReset();
  mockRewardSave.mockClear();
  mockState.rewardSaveResult = true;
  mockState.rewardDirty = false;
});

describe('SetupWizard', () => {
  it('opens on the logo page, then walks through the pages in order', async () => {
    const { getByText, getByLabelText } = await renderWizard();
    expect(getByText('page:brand')).toBeTruthy();
    expect(getByLabelText('setup.stepOf(1,7), setup.step.brand.label')).toBeTruthy();

    fireEvent.press(getByText('setup.continue'));
    await waitFor(() => expect(getByText('page:card')).toBeTruthy());
    expect(await AsyncStorage.getItem(storageKey)).toBe('card');
  });

  it('the back arrow on the first page goes back to the Accueil', async () => {
    const { getByLabelText } = await renderWizard();
    fireEvent.press(getByLabelText('common.back'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('"Passer" moves on without running the page save', async () => {
    const { getByText, getByLabelText } = await renderWizard('reward');
    expect(getByText('page:reward')).toBeTruthy();
    fireEvent.press(getByLabelText('setup.skipA11y'));
    expect(getByText('page:about')).toBeTruthy();
    expect(mockRewardSave).not.toHaveBeenCalled();
  });

  it('"Passer" asks before dropping unsaved input, and can save it', async () => {
    mockState.rewardDirty = true;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText, getByLabelText } = await renderWizard('reward');
    fireEvent.press(getByLabelText('setup.skipA11y'));
    expect(getByText('page:reward')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledTimes(1);

    const buttons = alertSpy.mock.calls[0][2] ?? [];
    expect(buttons.map((b) => b.text)).toEqual(['common.cancel', 'setup.unsaved.discard', 'common.save']);
    await act(async () => { buttons[2].onPress?.(); });
    expect(mockRewardSave).toHaveBeenCalledTimes(1);
    expect(getByText('page:about')).toBeTruthy();
    alertSpy.mockRestore();
  });

  it('"Continuer" waits for the page save and stays when it fails', async () => {
    mockState.rewardSaveResult = false;
    const { getByText } = await renderWizard('reward');
    await act(async () => { fireEvent.press(getByText('setup.continue')); });
    expect(mockRewardSave).toHaveBeenCalledTimes(1);
    expect(getByText('page:reward')).toBeTruthy();

    mockState.rewardSaveResult = true;
    await act(async () => { fireEvent.press(getByText('setup.continue')); });
    expect(getByText('page:about')).toBeTruthy();
  });

  it('resumes at the saved page and never exposes "Passer" on the recap', async () => {
    await AsyncStorage.setItem(storageKey, 'social');
    const { getByText, queryByLabelText } = await renderWizard();
    expect(getByText('page:social')).toBeTruthy();
    expect(queryByLabelText('setup.skipA11y')).toBeTruthy();

    fireEvent.press(getByText('setup.continue'));
    await waitFor(() => expect(getByText('page:gallery')).toBeTruthy());
    fireEvent.press(getByText('setup.continue'));
    await waitFor(() => expect(getByText('page:done')).toBeTruthy());
    expect(queryByLabelText('setup.skipA11y')).toBeNull();
  });

  it('resumes on the recap when the merchant left before "Terminer"', async () => {
    await AsyncStorage.setItem(storageKey, 'done');
    const { getByText } = await renderWizard();
    expect(getByText('page:done')).toBeTruthy();
  });

  it('the back arrow with unsaved input can save, then goes back', async () => {
    mockState.rewardDirty = true;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText, getByLabelText } = await renderWizard('reward');
    fireEvent.press(getByLabelText('common.back'));
    expect(getByText('page:reward')).toBeTruthy();
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    await act(async () => { buttons[2].onPress?.(); });
    expect(mockRewardSave).toHaveBeenCalledTimes(1);
    expect(getByText('page:card')).toBeTruthy();
    alertSpy.mockRestore();
  });

  it('"Terminer" marks the onboarding as completed and opens the Accueil', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    const { getByText } = await renderWizard('done');
    await act(async () => { fireEvent.press(getByText('setup.done.finish')); });
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    expect(await AsyncStorage.getItem(storageKey)).toBeNull();
  });

  it('stays on the recap when the server refuses to complete the onboarding', async () => {
    mockMutateAsync.mockRejectedValue(new Error('offline'));
    const { getByText } = await renderWizard('done');
    await act(async () => { fireEvent.press(getByText('setup.done.finish')); });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(getByText('page:done')).toBeTruthy();
  });
});
