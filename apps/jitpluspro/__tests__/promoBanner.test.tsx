import { render, fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import PromoBanner from '@/components/home/PromoBanner';
import { GateIcon } from '@/components/home/PromoIcons';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const baseProps = {
  label: 'Guide',
  title: 'Prendre en main JitPlus',
  cta: 'Voir le guide',
  Icon: GateIcon,
  width: 320,
  onPress: jest.fn(),
};

describe('PromoBanner', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the label, the title and the action', () => {
    const { getByText } = render(<PromoBanner {...baseProps} />);
    expect(getByText('Guide')).toBeTruthy();
    expect(getByText('Prendre en main JitPlus')).toBeTruthy();
    expect(getByText('Voir le guide')).toBeTruthy();
  });

  it('is a button with an accessible label combining label, title and CTA', () => {
    const { getByRole } = render(<PromoBanner {...baseProps} />);
    expect(
      getByRole('button', { name: 'Guide. Prendre en main JitPlus. Voir le guide' }),
    ).toBeTruthy();
  });

  it('fires onPress with a light haptic when tapped', () => {
    const { getByRole } = render(<PromoBanner {...baseProps} />);
    fireEvent.press(getByRole('button'));
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(baseProps.onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the read badge only when read', () => {
    const { queryByLabelText, rerender } = render(
      <PromoBanner {...baseProps} readA11yLabel="Déjà consulté" />,
    );
    expect(queryByLabelText('Déjà consulté')).toBeNull();
    rerender(<PromoBanner {...baseProps} read readA11yLabel="Déjà consulté" />);
    expect(queryByLabelText('Déjà consulté')).toBeTruthy();
  });
});
