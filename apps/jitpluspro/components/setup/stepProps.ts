import type { Merchant } from '@/types';

/** Runs when the merchant taps "Continuer"; resolves false to stay on the page (the step shows the error). */
export type SaveHandler = () => Promise<boolean>;

export interface StepProps {
  merchant: Merchant;
  /**
   * Registers what "Continuer" must do before leaving the page (null = nothing to save).
   * `dirty` tells the wizard the page holds unsaved input, so "Passer" and the
   * back arrow ask before dropping it.
   */
  registerSave: (fn: SaveHandler | null, dirty?: boolean) => void;
}
