import { create } from 'zustand';

/** Steps of the guide done so far, out of the ones this account can do. */
export interface GuideCount {
  done: number;
  total: number;
}

interface GuideSheetState {
  visible: boolean;
  /** Published by HomeGuide once known; null while loading or when not tracked. */
  progress: GuideCount | null;
  open: () => void;
  close: () => void;
  setProgress: (progress: GuideCount | null) => void;
}

/**
 * State of the "Guide de départ" shared between the Accueil tool card (which
 * opens the sheet and shows how many steps are left) and HomeGuide (which
 * renders the sheet and computes the progress).
 */
export const useGuideSheetStore = create<GuideSheetState>((set) => ({
  visible: false,
  progress: null,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  setProgress: (progress) => set({ progress }),
}));
