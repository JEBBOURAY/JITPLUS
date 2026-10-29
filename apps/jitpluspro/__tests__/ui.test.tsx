import { render, fireEvent } from '@testing-library/react-native';
import { Crown } from 'lucide-react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { NoticeBanner } from '@/components/ui/NoticeBanner';

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    bgCard: '#fff', border: '#ccc', primary: '#7c3aed', textInverse: '#fff',
    text: '#111', textSecondary: '#333', textMuted: '#555',
  }),
  palette: { gold: '#D4A64A' },
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, isRTL: true }),
}));

describe('shared UI controls', () => {
  it('blocks a button while its action is in progress', () => {
    const onPress = jest.fn();
    const { getByRole, rerender } = render(<ActionButton label="Enregistrer" onPress={onPress} loading />);
    fireEvent.press(getByRole('button', { name: 'Enregistrer' }));
    expect(onPress).not.toHaveBeenCalled();
    rerender(<ActionButton label="Enregistrer" onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'Enregistrer' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps dismissing a notice separate from opening its action', () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    const { getByRole } = render(
      <NoticeBanner Icon={Crown} title="Essai Pro" description="7 jours restants" actionLabel="Voir le forfait" onPress={onPress} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByRole('button', { name: 'common.close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    fireEvent.press(getByRole('button', { name: 'Essai Pro. 7 jours restants. Voir le forfait' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
