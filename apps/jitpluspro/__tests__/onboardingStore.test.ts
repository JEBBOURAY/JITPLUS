import { useOnboardingStore } from '@/stores/onboardingStore';

const reset = () => useOnboardingStore.setState({ active: null });

describe('onboarding coordinator', () => {
  beforeEach(reset);

  it('lets only one full-screen surface show at a time', () => {
    const { request } = useOnboardingStore.getState();
    expect(request('introVideo')).toBe(true);
    expect(request('notif')).toBe(false);
    expect(useOnboardingStore.getState().active).toBe('introVideo');
  });

  it('frees the screen when the surface holding it is released', () => {
    const { request, release } = useOnboardingStore.getState();
    request('introVideo');
    release('notif');
    expect(useOnboardingStore.getState().active).toBe('introVideo');
    release('introVideo');
    expect(request('notif')).toBe(true);
  });
});
