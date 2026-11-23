import { fireEvent, render } from '@testing-library/react-native';
import { StampActionBar, type VisitToggle } from '@/components/transaction/StampActionBar';
import { computeStampPlan, type StampPlanInput } from '@/utils/stampTransaction';

jest.mock('@/contexts/ThemeContext', () => {
  const theme = {
    mode: 'light', primary: '#7C3AED', primaryBg: '#F3EEFF', bgCard: '#fff', bgInput: '#F4F4F5',
    border: '#E5E7EB', borderLight: '#F1F1F1', text: '#111', textSecondary: '#555', textMuted: '#999',
  };
  return { useTheme: () => theme, palette: { violet: '#7C3AED' } };
});

// Returns "key" or "key:count" so each test reads which label the bar chose.
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, opts?: { count?: number }) => (opts?.count != null ? `${key}:${opts.count}` : key),
    isRTL: false,
  }),
}));

const base: StampPlanInput = { mode: 'PER_VISIT', currentStamps: 12, amount: 0, countVisit: true };

function renderBar({
  input = {},
  visit = { on: true, disabled: false, onChange: jest.fn() },
  collectionCount = 0,
}: { input?: Partial<StampPlanInput>; visit?: VisitToggle | null; collectionCount?: number } = {}) {
  const plan = computeStampPlan({ ...base, ...input, countVisit: visit?.on ?? true });
  return render(
    <StampActionBar
      plan={plan}
      currentStamps={input.currentStamps ?? base.currentStamps}
      visit={visit}
      collectionCount={collectionCount}
      loading={false}
      bottomInset={0}
      onSubmit={jest.fn()}
    />,
  );
}

describe('StampActionBar — the visit switch next to the button', () => {
  it('stamp on, no gift: adds one stamp', () => {
    const { getByText, getByRole } = renderBar();
    expect(getByText('stampScreen.ctaEarn_one:1')).toBeTruthy();
    expect(getByRole('switch').props.accessibilityState).toMatchObject({ checked: true });
    expect(getByText('stampScreen.visitOn')).toBeTruthy();
  });

  it('stamp on with a gift: adds the stamp and gives the gift', () => {
    const { getByText } = renderBar({ input: { reward: { cout: 5 } } });
    expect(getByText('stampScreen.ctaEarnAndRedeem_one:1')).toBeTruthy();
  });

  it('stamp off with a gift: gives the gift only', () => {
    const { getByText } = renderBar({ input: { reward: { cout: 5 } }, visit: { on: false, disabled: false, onChange: jest.fn() } });
    expect(getByText('stampScreen.ctaRedeem')).toBeTruthy();
    expect(getByText('stampScreen.visitOff')).toBeTruthy();
  });

  it('stamp off and nothing chosen: the button is disabled', () => {
    const onSubmit = jest.fn();
    const plan = computeStampPlan({ ...base, countVisit: false });
    const { getByText, getByRole } = render(
      <StampActionBar
        plan={plan}
        currentStamps={12}
        visit={{ on: false, disabled: false, onChange: jest.fn() }}
        collectionCount={0}
        loading={false}
        bottomInset={0}
        onSubmit={onSubmit}
      />,
    );
    expect(getByText('stampScreen.ctaNothing')).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'stampScreen.ctaNothing' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('stamp off with collection products only: validates the products', () => {
    const { getByText } = renderBar({ visit: { on: false, disabled: false, onChange: jest.fn() }, collectionCount: 2 });
    expect(getByText('collection.till.ctaOnly_other:2')).toBeTruthy();
  });

  it('at the stamp limit: the switch is off and locked', () => {
    const onChange = jest.fn();
    const { getByRole, getByText } = renderBar({
      input: { currentStamps: 10, accumulationLimit: 10 },
      visit: { on: true, disabled: true, onChange },
    });
    const sw = getByRole('switch');
    expect(sw.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    expect(getByText('stampScreen.visitOff')).toBeTruthy();
    fireEvent.press(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tapping the row flips the switch', () => {
    const onChange = jest.fn();
    const { getByRole } = renderBar({ visit: { on: true, disabled: false, onChange } });
    fireEvent.press(getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('per-amount mode has no switch', () => {
    const { queryByRole } = renderBar({ input: { mode: 'PER_AMOUNT', amount: 50, amountPerStamp: 10 }, visit: null });
    expect(queryByRole('switch')).toBeNull();
  });
});
