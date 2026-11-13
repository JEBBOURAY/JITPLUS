import { render, act } from '@testing-library/react-native';
import HomeGuide from '@/components/home/HomeGuide';
import JitPlusGuideSheet from '@/components/home/JitPlusGuideSheet';
import { useGuideSheetStore } from '@/components/home/guideSheetStore';
import { computeGuideProgress, useGuideProgress, type GuideDoneState } from '@/components/home/useGuideProgress';
import { useAutoCompleteOnboarding } from '@/components/setup/useAutoCompleteOnboarding';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
let mockAuth = { isTeamMember: false, merchant: { onboardingCompleted: false } };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: typeof mockAuth) => unknown) => select(mockAuth),
}));
jest.mock('@/components/home/JitPlusGuideSheet', () => jest.fn(() => null));
jest.mock('@/components/home/ClientShareSheet', () => () => null);
jest.mock('@/components/setup/useAutoCompleteOnboarding', () => ({ useAutoCompleteOnboarding: jest.fn() }));
jest.mock('@/components/home/useGuideProgress', () => {
  const actual = jest.requireActual('@/components/home/useGuideProgress');
  return { ...actual, useGuideProgress: jest.fn() };
});

const all: GuideDoneState = {
  program: true, logo: true, shop: true, invite: true, scan: true, reward: true, message: true,
};
const state = (done: GuideDoneState, ready = true) => ({ ...computeGuideProgress(done, false), ready });
const sheetProps = () => jest.mocked(JitPlusGuideSheet).mock.lastCall![0];

describe('Accueil step guide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { isTeamMember: false, merchant: { onboardingCompleted: false } };
    useGuideSheetStore.setState({ visible: false, progress: null });
    jest.mocked(useGuideProgress).mockReturnValue(state({ ...all, message: false }));
  });

  it('opens from the store and computes the progress once, for the sheet', () => {
    render(<HomeGuide />);
    expect(sheetProps().visible).toBe(false);
    act(() => useGuideSheetStore.getState().open());
    expect(sheetProps().visible).toBe(true);
    expect(sheetProps().progress.nextId).toBe('message');
  });

  it('closes the sheet and opens the screen of a step', () => {
    render(<HomeGuide />);
    act(() => useGuideSheetStore.getState().open());
    act(() => sheetProps().onStepAction('program'));
    expect(useGuideSheetStore.getState().visible).toBe(false);
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('opens the demo videos from the sheet', () => {
    render(<HomeGuide />);
    act(() => sheetProps().onOpenDemos());
    expect(mockPush).toHaveBeenCalledWith('/demo-videos');
  });

  it('offers to resume the setup wizard only to an owner who has not finished it', () => {
    const owner = render(<HomeGuide />);
    expect(sheetProps().onResumeSetup).toBeDefined();
    owner.unmount();

    mockAuth = { isTeamMember: true, merchant: { onboardingCompleted: false } };
    render(<HomeGuide />);
    expect(sheetProps().onResumeSetup).toBeUndefined();
  });

  it('completes the onboarding once every step is done', () => {
    const unfinished = render(<HomeGuide />);
    expect(jest.mocked(useAutoCompleteOnboarding)).toHaveBeenLastCalledWith(false);
    unfinished.unmount();

    jest.mocked(useGuideProgress).mockReturnValue(state(all));
    render(<HomeGuide />);
    expect(jest.mocked(useAutoCompleteOnboarding)).toHaveBeenLastCalledWith(true);
  });

  it('publishes the steps done for the tool card, once known and for an owner only', () => {
    const owner = render(<HomeGuide />);
    expect(useGuideSheetStore.getState().progress).toEqual({ done: 6, total: 7 });
    owner.unmount();

    jest.mocked(useGuideProgress).mockReturnValue(state({ ...all, message: false }, false));
    const loading = render(<HomeGuide />);
    expect(useGuideSheetStore.getState().progress).toBeNull();
    loading.unmount();

    mockAuth = { isTeamMember: true, merchant: { onboardingCompleted: true } };
    jest.mocked(useGuideProgress).mockReturnValue(state(all));
    render(<HomeGuide />);
    expect(useGuideSheetStore.getState().progress).toBeNull();
  });

  it('tracks an owner even with the sheet closed, a team member only while it is open', () => {
    render(<HomeGuide />).unmount();
    expect(jest.mocked(useGuideProgress)).toHaveBeenLastCalledWith(true);

    mockAuth = { isTeamMember: true, merchant: { onboardingCompleted: true } };
    render(<HomeGuide />);
    expect(jest.mocked(useGuideProgress)).toHaveBeenLastCalledWith(false);
  });
});
