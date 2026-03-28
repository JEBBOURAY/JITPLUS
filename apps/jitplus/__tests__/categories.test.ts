import { getCategoryEmoji, CATEGORY_EMOJI, CATEGORIES } from '@/utils/categories';

describe('CATEGORY_EMOJI', () => {
  it('has an emoji for every CATEGORIES id except "all"', () => {
    const categoryIds = CATEGORIES.filter((c) => c.id !== 'all').map((c) => c.id);
    for (const id of categoryIds) {
      expect(CATEGORY_EMOJI[id]).toBeDefined();
    }
  });
});

describe('getCategoryEmoji', () => {
  it('returns ☕ for CAFE', () => {
    expect(getCategoryEmoji('CAFE')).toBe('☕');
  });

  it('is case-insensitive for exact match (uppercases input)', () => {
    expect(getCategoryEmoji('cafe')).toBe('☕');
  });

  it('returns 🍽️ for RESTAURANT', () => {
    expect(getCategoryEmoji('RESTAURANT')).toBe('🍽️');
  });

  it('handles fuzzy match for coffee', () => {
    expect(getCategoryEmoji('coffee shop')).toBe('☕');
  });

  it('handles fuzzy match for beauty', () => {
    expect(getCategoryEmoji('beauty salon')).toBe('💇');
  });

  it('handles fuzzy match for gym', () => {
    expect(getCategoryEmoji('gym club')).toBe('🏋️');
  });

  it('returns default 🏪 for unknown', () => {
    expect(getCategoryEmoji('xyz-unknown')).toBe('🏪');
  });

  it('returns default 🏪 for undefined', () => {
    expect(getCategoryEmoji(undefined)).toBe('🏪');
  });

  it('returns default 🏪 for empty string', () => {
    expect(getCategoryEmoji('')).toBe('🏪');
  });
});
