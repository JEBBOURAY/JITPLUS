import { useOnboardingStore } from '@/stores/onboardingStore';

const reset = () => useOnboardingStore.setState({ active: null, welcomeClosedFor: null });

describe('onboarding coordinator', () => {
  beforeEach(reset);

  it('lets only one full-screen surface show at a time', () => {
    const { request } = useOnboardingStore.getState();
    expect(request('welcome')).toBe(true);
    expect(request('tour')).toBe(false);
    expect(useOnboardingStore.getState().active).toBe('welcome');
  });

  it('frees the screen when the surface holding it is released', () => {
    const { request, release } = useOnboardingStore.getState();
    request('welcome');
    release('tour');
    expect(useOnboardingStore.getState().active).toBe('welcome');
    release('welcome');
    expect(request('tour')).toBe(true);
  });

  it('closing the welcome card frees the screen and remembers the merchant for the session', () => {
    const { request, closeWelcome } = useOnboardingStore.getState();
    request('welcome');
    closeWelcome('m1');
    expect(useOnboardingStore.getState()).toMatchObject({ active: null, welcomeClosedFor: 'm1' });
    expect(useOnboardingStore.getState().request('tour')).toBe(true);
  });
});
