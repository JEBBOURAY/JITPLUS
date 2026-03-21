import { TRANSACTION_TYPE_CONFIG, getTransactionConfig } from '@/constants/transactions';
import type { TransactionType } from '@/types';
import type { ThemeColors } from '@/contexts/ThemeContext';

// Minimal mock theme
const mockTheme: ThemeColors = {
  mode: 'dark',
  bg: '#000',
  bgCard: '#111',
  bgElevated: '#222',
  bgHeader: '#333',
  bgTabBar: '#111',
  bgTabBarBorder: '#222',
  bgInput: '#222',
  bgSkeleton: '#333',
  bgSkeletonHighlight: '#444',
  text: '#fff',
  textSecondary: '#ccc',
  textMuted: '#888',
  textInverse: '#000',
  primary: '#7C3AED',
  primaryLight: '#a78bfa',
  primaryBg: '#2d1b69',
  accent: '#ec4899',
  accentBg: '#4a1942',
  border: '#333',
  borderLight: '#444',
  inputBorder: '#555',
  inputBg: '#222',
  inputPlaceholder: '#666',
  shadowColor: '#000',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  isDark: true,
} as ThemeColors;

describe('TRANSACTION_TYPE_CONFIG', () => {
  const types: TransactionType[] = [
    'EARN_POINTS',
    'REDEEM_REWARD',
    'ADJUST_POINTS',
    'LOYALTY_PROGRAM_CHANGE',
  ];

  it('has configuration for all transaction types', () => {
    types.forEach((type) => {
      expect(TRANSACTION_TYPE_CONFIG[type]).toBeDefined();
    });
  });

  it('each type has icon, color function, and sign', () => {
    types.forEach((type) => {
      const cfg = TRANSACTION_TYPE_CONFIG[type];
      expect(typeof cfg.icon).toBe('function'); // Lucide icons are components
      expect(typeof cfg.color).toBe('function');
      expect(['+', '-', '']).toContain(cfg.sign);
    });
  });

  it('EARN_POINTS uses success color', () => {
    expect(TRANSACTION_TYPE_CONFIG.EARN_POINTS.color(mockTheme)).toBe(mockTheme.success);
  });

  it('REDEEM_REWARD uses warning color', () => {
    expect(TRANSACTION_TYPE_CONFIG.REDEEM_REWARD.color(mockTheme)).toBe(mockTheme.warning);
  });

  it('ADJUST_POINTS uses primary color', () => {
    expect(TRANSACTION_TYPE_CONFIG.ADJUST_POINTS.color(mockTheme)).toBe(mockTheme.primary);
  });
});

describe('getTransactionConfig', () => {
  it('returns config for EARN_POINTS (not cancelled)', () => {
    const result = getTransactionConfig('EARN_POINTS', false, mockTheme);
    expect(result.color).toBe(mockTheme.success);
    expect(result.sign).toBe('+');
  });

  it('overrides to danger color when cancelled', () => {
    const result = getTransactionConfig('EARN_POINTS', true, mockTheme);
    expect(result.color).toBe(mockTheme.danger);
    expect(result.sign).toBe('');
  });

  it('uses X icon when cancelled', () => {
    const normal = getTransactionConfig('EARN_POINTS', false, mockTheme);
    const cancelled = getTransactionConfig('EARN_POINTS', true, mockTheme);
    expect(cancelled.icon).not.toBe(normal.icon);
  });

  it('REDEEM_REWARD has minus sign', () => {
    const result = getTransactionConfig('REDEEM_REWARD', false, mockTheme);
    expect(result.sign).toBe('-');
  });

  it('LOYALTY_PROGRAM_CHANGE has empty sign', () => {
    const result = getTransactionConfig('LOYALTY_PROGRAM_CHANGE', false, mockTheme);
    expect(result.sign).toBe('');
    expect(result.color).toBe(mockTheme.primary);
  });
});
