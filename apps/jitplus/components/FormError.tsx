import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { wp, hp, radius } from '@/utils/responsive';

interface FormErrorProps {
  message?: string;
}

export default memo(function FormError({ message }: FormErrorProps) {
  const theme = useTheme();
  if (!message) return null;

  return (
    <View style={[styles.container, { backgroundColor: `${theme.danger}10` }]} accessibilityRole="alert">
      <Text style={[styles.text, { color: theme.danger }]}>{message}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { borderRadius: radius.md, padding: wp(12), marginBottom: hp(16) },
  text: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
});
