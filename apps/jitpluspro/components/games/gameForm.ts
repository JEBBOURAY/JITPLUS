// Pure helpers shared by the game wizards (no React Native).

/** Translation key, with its params, of the first problem found in a wizard step. */
export interface FormError {
  key: string;
  params?: Record<string, unknown>;
}

/** Number pads still accept pasted text: keep the digits only. */
export const digitsOnly = (s: string) => s.replace(/[^0-9]/g, '');
