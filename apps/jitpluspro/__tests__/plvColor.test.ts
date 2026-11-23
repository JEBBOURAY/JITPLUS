import { luminance, mix, rgb, shade } from '@/components/plv/color';

describe('plv colour math', () => {
  it('reads and blends hex colours', () => {
    expect(rgb('#7C3AED')).toEqual([124, 58, 237]);
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#7C3AED', '#F59E0B', 0)).toBe('#7c3aed');
  });

  it('shades towards black or white like the former poster helper', () => {
    // Former PlvPoster.shade: c * (1 + amount) when darkening, c + (255 - c) * amount when lightening.
    expect(shade('#C8A050', -0.2)).toBe('#a08040');
    expect(shade('#C8A050', 0.5)).toBe('#e4d0a8');
  });

  it('computes WCAG luminance', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1);
    expect(luminance('#000000')).toBe(0);
  });
});
