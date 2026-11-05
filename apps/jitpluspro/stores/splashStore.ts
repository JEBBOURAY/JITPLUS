import { create } from 'zustand';

/**
 * Whether the animated splash has started opening. Screens mounted under the
 * splash (login) wait for this before playing their own intro, otherwise it
 * would run hidden behind the splash.
 */
interface SplashState {
  done: boolean;
  markDone: () => void;
}

export const useSplashStore = create<SplashState>((set) => ({
  done: false,
  markDone: () => set({ done: true }),
}));
