import { avatarColor } from '@/utils/avatarColor';

describe('avatarColor', () => {
  it('returns a color string for a normal name', () => {
    const color = avatarColor('Alice');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('is deterministic — same name always returns same color', () => {
    expect(avatarColor('Bob')).toBe(avatarColor('Bob'));
  });

  it('different names can yield different colors', () => {
    // 'A' (65) and 'B' (66) differ by 1, should hit different palette entries
    expect(avatarColor('A')).not.toBe(avatarColor('B'));
  });

  it('handles empty string with fallback', () => {
    const color = avatarColor('');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('handles unicode characters', () => {
    const color = avatarColor('عبد');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
