import { computeSetupStatus, countSetupDone, SETUP_ITEMS, SETUP_ITEM_STEP } from '@/components/setup/setupStatus';
import { SETUP_STEPS, SKIPPABLE_STEPS, parseSetupStep } from '@/components/setup/setupSteps';

const empty = { logoUrl: undefined, coverUrl: undefined, description: '', tagline: null, socialLinks: null, gallery: [] };

describe('computeSetupStatus', () => {
  it('reports nothing done for a fresh account', () => {
    const status = computeSetupStatus(empty, []);
    expect(Object.values(status).every((v) => v === false)).toBe(true);
    expect(countSetupDone(status)).toEqual({ done: 0, total: SETUP_ITEMS.length });
  });

  it('ticks each item from the saved data', () => {
    const status = computeSetupStatus({
      logoUrl: 'logo.png',
      coverUrl: undefined,
      description: '  ',
      tagline: 'Café et pâtisseries',
      socialLinks: { instagram: 'cafeatlas' },
      gallery: ['a.jpg'],
    }, [{ id: 'r1', titre: 'Café', cout: 10 }]);
    expect(status).toEqual({ logo: true, cover: false, reward: true, about: true, social: true, gallery: true });
    expect(countSetupDone(status)).toEqual({ done: 5, total: 6 });
  });

  it('treats rewards still loading as not done', () => {
    expect(computeSetupStatus(empty, undefined).reward).toBe(false);
  });

  it('sends every item back to a page of the wizard', () => {
    for (const id of SETUP_ITEMS) expect(SETUP_STEPS).toContain(SETUP_ITEM_STEP[id]);
  });
});

describe('setup steps', () => {
  it('starts with the logo page and ends with the unskippable recap', () => {
    expect(SETUP_STEPS[0]).toBe('brand');
    expect(SETUP_STEPS[SETUP_STEPS.length - 1]).toBe('done');
    expect(SKIPPABLE_STEPS.has('done')).toBe(false);
    expect(SETUP_STEPS.slice(0, -1).every((s) => SKIPPABLE_STEPS.has(s))).toBe(true);
  });

  it('parses the step URL parameter', () => {
    expect(parseSetupStep('social')).toBe('social');
    expect(parseSetupStep(['reward'])).toBe('reward');
    expect(parseSetupStep('nope')).toBeNull();
    expect(parseSetupStep(undefined)).toBeNull();
  });
});
