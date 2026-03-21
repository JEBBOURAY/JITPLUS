import { wp, hp, ms } from '@/utils/responsive';

describe('responsive utils', () => {
  describe('wp (width percentage)', () => {
    it('returns a number', () => {
      expect(typeof wp(100)).toBe('number');
    });

    it('returns rounded integer', () => {
      expect(Number.isInteger(wp(17))).toBe(true);
    });

    it('scales proportionally', () => {
      // Larger input → larger output
      expect(wp(200)).toBeGreaterThan(wp(100));
    });

    it('returns 0 for 0', () => {
      expect(wp(0)).toBe(0);
    });
  });

  describe('hp (height percentage)', () => {
    it('returns a number', () => {
      expect(typeof hp(100)).toBe('number');
    });

    it('scales proportionally', () => {
      expect(hp(200)).toBeGreaterThan(hp(100));
    });
  });

  describe('ms (moderate scale)', () => {
    it('returns a number', () => {
      expect(typeof ms(16)).toBe('number');
    });

    it('factor=0 returns the input unchanged', () => {
      expect(ms(16, 0)).toBe(16);
    });

    it('factor=1 is equivalent to wp', () => {
      expect(ms(16, 1)).toBe(wp(16));
    });

    it('default factor is between input and wp', () => {
      const input = 20;
      const result = ms(input);
      const fullWp = wp(input);
      // With factor=0.5, result should be between input and wp(input)
      if (fullWp > input) {
        expect(result).toBeGreaterThanOrEqual(input);
        expect(result).toBeLessThanOrEqual(fullWp);
      } else if (fullWp < input) {
        expect(result).toBeLessThanOrEqual(input);
        expect(result).toBeGreaterThanOrEqual(fullWp);
      }
    });
  });
});
