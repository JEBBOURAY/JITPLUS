import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useDir } from '@/hooks/useDir';
import { formStyles } from './formStyles';

/** Red message under a field, read out by screen readers when it appears. */
export function FieldError({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <Text
      style={[formStyles.errorHint, { color: theme.danger, textAlign: dir.textAlign }]}
      accessibilityLiveRegion="polite"
    >
      {children}
    </Text>
  );
}
