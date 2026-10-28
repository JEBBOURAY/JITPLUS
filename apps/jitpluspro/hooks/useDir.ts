import { useMemo } from 'react';
import type { FlexStyle, TextStyle, ViewStyle } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * The root view forces `direction: 'ltr'` (app/_layout.tsx), so logical
 * start/end props do not mirror. Screens mirror themselves through these values.
 */
export function useDir() {
  const { isRTL } = useLanguage();
  return useMemo(() => ({
    isRTL,
    row: (isRTL ? 'row-reverse' : 'row') as FlexStyle['flexDirection'],
    textAlign: (isRTL ? 'right' : 'left') as TextStyle['textAlign'],
    alignStart: (isRTL ? 'flex-end' : 'flex-start') as FlexStyle['alignItems'],
    alignEnd: (isRTL ? 'flex-start' : 'flex-end') as FlexStyle['alignItems'],
    flip: (isRTL ? { transform: [{ scaleX: -1 }] } : undefined) as ViewStyle | undefined,
  }), [isRTL]);
}
