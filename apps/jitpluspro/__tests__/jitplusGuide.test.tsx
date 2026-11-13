import { render, fireEvent } from '@testing-library/react-native';
import JitPlusGuideSheet from '@/components/home/JitPlusGuideSheet';
import { computeGuideProgress, type GuideDoneState } from '@/components/home/useGuideProgress';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${Object.values(params).join(',')})` : key,
    isRTL: false,
  }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'light', bg: '#fff', bgCard: '#fff', text: '#0f172a', textSecondary: '#334155',
    textMuted: '#64748b', primary: '#7c3aed', primaryBg: '#f5f3ff', success: '#10b981', border: '#e2e8f0',
  }),
  palette: { gold: '#FCD34D', violet: '#7C3AED' },
}));

const none: GuideDoneState = {
  program: false,
  logo: false,
  shop: false,
  invite: false,
  scan: false,
  reward: false,
  message: false,
};
const state = (done: GuideDoneState, isTeamMember: boolean) => ({ ...computeGuideProgress(done, isTeamMember), ready: true });

const all: GuideDoneState = {
  program: true,
  logo: true,
  shop: true,
  invite: true,
  scan: true,
  reward: true,
  message: true,
};

describe('computeGuideProgress', () => {
  it('points to the first step to do', () => {
    const p = computeGuideProgress({ ...none, program: true }, false);
    expect(p.doneCount).toBe(1);
    expect(p.total).toBe(7);
    expect(p.nextId).toBe('logo');
    expect(p.allDone).toBe(false);
  });

  it('is complete when every step is done', () => {
    const p = computeGuideProgress(all, false);
    expect(p.allDone).toBe(true);
    expect(p.nextId).toBeNull();
  });

  it('locks owner-only steps for a team member and leaves them out of the count', () => {
    const p = computeGuideProgress({ ...none, program: true, message: true }, true);
    expect(p.total).toBe(3);
    expect(p.doneCount).toBe(0);
    expect(p.nextId).toBe('invite');
    expect(p.steps.filter((s) => s.locked).map((s) => s.id)).toEqual(['program', 'logo', 'shop', 'message']);
    expect(p.steps.find((s) => s.id === 'program')?.done).toBe(false);
  });
});

describe('JitPlusGuideSheet', () => {
  const props = { visible: true, onClose: jest.fn(), onStepAction: jest.fn(), onOpenDemos: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('shows the progress and sends the footer to the next step', () => {
    const { getByText, getByLabelText } = render(<JitPlusGuideSheet {...props} progress={state({ ...none, program: true, logo: true, shop: true }, false)} />);
    expect(getByText('home.guideProgress(3,7)')).toBeTruthy();
    fireEvent.press(getByLabelText('home.guideNextCta(home.guideStepInviteCta)'));
    expect(props.onStepAction).toHaveBeenCalledWith('invite');
  });

  it('unfolds only the next step to do, then the one the merchant picks', () => {
    const { getByLabelText, queryByLabelText, queryByText } = render(<JitPlusGuideSheet {...props} progress={state(none, false)} />);
    expect(queryByText('home.guideStepProgramText')).toBeTruthy();
    expect(queryByText('home.guideStepMessageText')).toBeNull();
    expect(queryByLabelText('home.guideStepMessageCta')).toBeNull();

    fireEvent.press(getByLabelText('home.guideStepMessageTitle'));
    expect(queryByText('home.guideStepMessageText')).toBeTruthy();
    expect(queryByText('home.guideStepProgramText')).toBeNull();
    fireEvent.press(getByLabelText('home.guideStepMessageCta'));
    expect(props.onStepAction).toHaveBeenCalledWith('message');
  });

  it('folds the open step when it is tapped again', () => {
    const { getByLabelText, queryByText } = render(<JitPlusGuideSheet {...props} progress={state(none, false)} />);
    fireEvent.press(getByLabelText('home.guideStepProgramTitle'));
    expect(queryByText('home.guideStepProgramText')).toBeNull();
  });

  it('lets a done step be reviewed once unfolded', () => {
    const { getByLabelText } = render(<JitPlusGuideSheet {...props} progress={state({ ...none, program: true }, false)} />);
    fireEvent.press(getByLabelText('home.guideStepProgramTitle'));
    fireEvent.press(getByLabelText('home.guideRedo : home.guideStepProgramCta'));
    expect(props.onStepAction).toHaveBeenCalledWith('program');
  });

  it('offers the demo videos once everything is done', () => {
    const { getByText, getByLabelText } = render(<JitPlusGuideSheet {...props} progress={state(all, false)} />);
    expect(getByText('home.guideAllDone')).toBeTruthy();
    fireEvent.press(getByLabelText('home.guideDemosCta'));
    expect(props.onOpenDemos).toHaveBeenCalledTimes(1);
  });

  it('hides actions of owner-only steps for a team member', () => {
    const { queryByLabelText, getAllByText } = render(<JitPlusGuideSheet {...props} progress={state(none, true)} />);
    expect(queryByLabelText('home.guideStepProgramCta')).toBeNull();
    expect(queryByLabelText('home.guideStepLogoCta')).toBeNull();
    expect(queryByLabelText('home.guideStepShopCta')).toBeNull();
    expect(queryByLabelText('home.guideStepMessageCta')).toBeNull();
    expect(getAllByText('home.guideLocked')).toHaveLength(4);
  });
});
