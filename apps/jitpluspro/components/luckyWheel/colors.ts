import type { WheelStatus } from './types';

// Fixed hues rather than theme tokens: status and action tones stay identical in light and dark mode.
export const WHEEL_TONE = {
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#EF4444',
} as const;

export const WHEEL_STATUS_COLORS: Record<WheelStatus, string> = {
  DRAFT: '#78716C',
  ACTIVE: WHEEL_TONE.success,
  PAUSED: WHEEL_TONE.warning,
  ENDED: WHEEL_TONE.danger,
};
