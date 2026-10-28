import { resolveFontStyle, weightKeyFor } from '@/utils/fontResolution';

describe('resolveFontStyle', () => {
  it('derives the locale font from fontWeight when no family is set', () => {
    expect(resolveFontStyle({ fontWeight: '600' }, 'fr')).toEqual({ fontFamily: 'Lexend_600SemiBold' });
    expect(resolveFontStyle({ fontWeight: 'bold' }, 'ar')).toEqual({ fontFamily: 'Cairo_700Bold' });
    expect(resolveFontStyle(undefined, 'en')).toEqual({ fontFamily: 'Lexend_400Regular' });
  });

  it('swaps an app font for the same weight in the other script', () => {
    expect(resolveFontStyle({ fontFamily: 'Lexend_500Medium' }, 'ar')).toEqual({ fontFamily: 'Cairo_500Medium' });
    expect(resolveFontStyle({ fontFamily: 'Cairo_700Bold' }, 'fr')).toEqual({ fontFamily: 'Lexend_700Bold' });
  });

  it('keeps a family that already matches the locale or is not an app font', () => {
    expect(resolveFontStyle({ fontFamily: 'Lexend_700Bold' }, 'fr')).toBeNull();
    expect(resolveFontStyle({ fontFamily: 'SpaceMono' }, 'ar')).toBeNull();
  });

  it('lets nested text without a weight inherit its parent font', () => {
    expect(resolveFontStyle({ color: 'red' }, 'fr', true)).toBeNull();
    expect(resolveFontStyle({ fontWeight: '700' }, 'fr', true)).toEqual({ fontFamily: 'Lexend_700Bold' });
  });
});

describe('weightKeyFor', () => {
  it('maps numeric and named weights', () => {
    expect(weightKeyFor(undefined)).toBe('regular');
    expect(weightKeyFor('300')).toBe('regular');
    expect(weightKeyFor(500)).toBe('medium');
    expect(weightKeyFor('800')).toBe('bold');
  });
});
