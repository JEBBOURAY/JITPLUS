/**
 * Pages of the setup wizard (/setup), in order. One topic per page: a short
 * explanation of what it changes for the customer, then the controls.
 * Texts live under `setup.step.<id>.label|title|hint`.
 */
export type SetupStepId = 'brand' | 'card' | 'reward' | 'about' | 'social' | 'gallery' | 'done';

export const SETUP_STEPS: readonly SetupStepId[] = ['brand', 'card', 'reward', 'about', 'social', 'gallery', 'done'];

/** Steps the merchant may skip; the recap is always shown. */
export const SKIPPABLE_STEPS: ReadonlySet<SetupStepId> = new Set(['brand', 'card', 'reward', 'about', 'social', 'gallery']);

export function isSetupStep(value: unknown): value is SetupStepId {
  return typeof value === 'string' && (SETUP_STEPS as readonly string[]).includes(value);
}

export function parseSetupStep(value?: string | string[]): SetupStepId | null {
  const v = Array.isArray(value) ? value[0] : value;
  return isSetupStep(v) ? v : null;
}

export const setupStepKey = (id: SetupStepId, part: 'label' | 'title' | 'hint') => `setup.step.${id}.${part}`;
