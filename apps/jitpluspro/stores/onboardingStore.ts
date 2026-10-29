import { create } from 'zustand';

/**
 * Full-screen onboarding surfaces. Only one may be on screen at a time so a
 * new merchant never gets a welcome card, a tour and a modal stacked on top of
 * each other. Inline banners and the setup checklist are not tracked here.
 */
type BlockingSurface = 'welcome' | 'tour';

interface OnboardingState {
  active: BlockingSurface | null;
  /**
   * Merchant whose welcome card was closed during this app session. Kept in
   * memory to coordinate surfaces immediately. WelcomeGuideCard also saves
   * a per-merchant display preference across launches.
   */
  welcomeClosedFor: string | null;
  /** Claims the screen for `surface`. Returns false when another surface holds it. */
  request: (surface: BlockingSurface) => boolean;
  release: (surface: BlockingSurface) => void;
  closeWelcome: (merchantId: string) => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  active: null,
  welcomeClosedFor: null,
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
  closeWelcome: (merchantId) =>
    set((s) => ({
      welcomeClosedFor: merchantId,
      active: s.active === 'welcome' ? null : s.active,
    })),
}));
