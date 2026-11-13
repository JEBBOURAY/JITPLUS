import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { wp, hp, radius } from '@/utils/responsive';
import { EASE_OUT } from '@/utils/motion';

// Fade only: the banner sits in the layout flow, a translate would fight it.
const ERROR_IN = FadeIn.duration(180).easing(EASE_OUT);
const ERROR_OUT = FadeOut.duration(140);

interface FormErrorProps {
  message?: string;
}

export default memo(function FormError({ message }: FormErrorProps) {
  const theme = useTheme();
  if (!message) return null;

  return (
    <Animated.View
      entering={ERROR_IN}
      exiting={ERROR_OUT}
      style={[styles.container, { backgroundColor: `${theme.danger}10` }]}
      accessibilityRole="alert"
    >
      <Text style={[styles.text, { color: theme.danger }]}>{message}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: { borderRadius: radius.md, padding: wp(12), marginBottom: hp(16) },
  text: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
});
