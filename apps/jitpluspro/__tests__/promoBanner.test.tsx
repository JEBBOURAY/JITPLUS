import { render, fireEvent } from '@testing-library/react-native';
import { QrCode } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import PromoBanner from '@/components/home/PromoBanner';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const baseProps = {
  label: 'Guide',
  title: 'Maîtrisez JitPlus en 5 minutes',
  cta: 'Voir le guide',
  duration: '5 min',
  colors: ['#7C3AED', '#4C1D95'] as const,
  tint: '#7C3AED',
  FallbackIcon: QrCode,
  width: 320,
  onPress: jest.fn(),
};

describe('PromoBanner', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the label in uppercase, the title, the CTA and the duration', () => {
    const { getByText } = render(<PromoBanner {...baseProps} />);
    expect(getByText('GUIDE')).toBeTruthy();
    expect(getByText('Maîtrisez JitPlus en 5 minutes')).toBeTruthy();
    expect(getByText('Voir le guide')).toBeTruthy();
    expect(getByText('5 min')).toBeTruthy();
  });

  it('is a button with an accessible label combining label, title and CTA', () => {
    const { getByRole } = render(<PromoBanner {...baseProps} />);
    expect(
      getByRole('button', { name: 'Guide. Maîtrisez JitPlus en 5 minutes. Voir le guide' }),
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
