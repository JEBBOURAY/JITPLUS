import { create } from 'zustand';

/**
 * Full-screen onboarding surfaces. Only one may be on screen at a time so a
 * new merchant never gets a tour and a modal stacked on top of each other.
 * Inline banners and the setup checklist are not tracked here.
 */
type BlockingSurface = 'tour' | 'notif' | 'introVideo';

interface OnboardingState {
  active: BlockingSurface | null;
  /** Claims the screen for `surface`. Returns false when another surface holds it. */
  request: (surface: BlockingSurface) => boolean;
  release: (surface: BlockingSurface) => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  active: null,
  request: (surface) => {
    const { active } = get();
    if (active === surface) return true;
    if (active) return false;
    set({ active: surface });
    return true;
  },
  release: (surface) => {
    if (get().active === surface) set({ active: null });
  },
}));
