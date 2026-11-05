import { useOnboardingStore } from '@/stores/onboardingStore';

const reset = () => useOnboardingStore.setState({ active: null });

describe('onboarding coordinator', () => {
  beforeEach(reset);

  it('lets only one full-screen surface show at a time', () => {
    const { request } = useOnboardingStore.getState();
    expect(request('tour')).toBe(true);
    expect(request('notif')).toBe(false);
    expect(useOnboardingStore.getState().active).toBe('tour');
  });

  it('frees the screen when the surface holding it is released', () => {
    const { request, release } = useOnboardingStore.getState();
    request('tour');
    release('notif');
    expect(useOnboardingStore.getState().active).toBe('tour');
    release('tour');
    expect(request('notif')).toBe(true);
  });
});
