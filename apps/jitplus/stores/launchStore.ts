import { create } from 'zustand';

/** True once the launch animation has opened onto the app (sign-in intros wait for it). */
export const useLaunchStore = create<{ done: boolean; setDone: () => void }>()((set) => ({
  done: false,
  setDone: () => set({ done: true }),
}));
