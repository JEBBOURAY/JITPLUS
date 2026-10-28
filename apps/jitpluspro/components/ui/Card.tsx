import { View, StyleSheet, type ViewProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { radius } from '@/utils/responsive';

export function Card({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return <View {...props} style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }, style]} />;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, padding: 16 },
});
