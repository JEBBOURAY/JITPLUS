import { act, fireEvent, render } from '@testing-library/react-native';
import { ToastHost, toast, useToastStore } from '@/components/ui/Toast';
import { hapticError, hapticSuccess } from '@/utils/haptics';

jest.mock('@/utils/haptics', () => ({ hapticSuccess: jest.fn(), hapticError: jest.fn() }));
jest.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ locale: 'fr', t: (k: string) => k }) }));
jest.mock('@/hooks/useReduceMotion', () => ({ useReduceMotion: () => true }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));

describe('toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    act(() => useToastStore.getState().hide());
  });
  afterEach(() => jest.useRealTimers());

  it('shows a success message with its haptic, then hides it by itself', () => {
    const { queryByText } = render(<ToastHost />);
    act(() => toast.success('Bon plan arrêté'));
    expect(queryByText('Bon plan arrêté')).toBeTruthy();
    expect(hapticSuccess).toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(2300); });
    expect(queryByText('Bon plan arrêté')).toBeNull();
  });

  it('keeps errors longer and closes them on tap', () => {
    const { queryByText, getByText } = render(<ToastHost />);
    act(() => toast.error('Pas de connexion'));
    expect(hapticError).toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(2300); });
    expect(queryByText('Pas de connexion')).toBeTruthy();
    fireEvent.press(getByText('Pas de connexion'));
    expect(queryByText('Pas de connexion')).toBeNull();
  });

  it('restarts the timer when the same message is shown again', () => {
    const { queryByText } = render(<ToastHost />);
    act(() => toast.success('Enregistré'));
    act(() => { jest.advanceTimersByTime(1500); });
    act(() => toast.success('Enregistré'));
    act(() => { jest.advanceTimersByTime(1500); });
    expect(queryByText('Enregistré')).toBeTruthy();
  });
});
