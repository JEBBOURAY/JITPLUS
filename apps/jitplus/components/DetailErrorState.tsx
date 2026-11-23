import type React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/utils/fonts';
import { fontSize, hp, ms, radius, wp } from '@/utils/responsive';

export interface DetailErrorAction {
  label: string;
  onPress: () => void;
  /** Quiet button next to the main one. */
  secondary?: boolean;
}

/** Full-screen "not found" or load error of a detail page (merchant, deal). */
export default function DetailErrorState({ title, message, actions, header }: {
  title: string;
  message: string;
  actions: DetailErrorAction[];
  /** Above the message, e.g. a back button. */
  header?: React.ReactNode;
}) {
  const theme = useTheme();
  const fonts = useAppFonts();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      {header}
      <View style={styles.center}>
        <View style={[styles.icon, { backgroundColor: theme.primaryBg }]}>
          <AlertCircle size={ms(24)} color={theme.primary} strokeWidth={1.75} />
        </View>
        <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[styles.text, { color: theme.textMuted, fontFamily: fonts.regular }]}>{message}</Text>
        <View style={styles.actions}>
          {actions.map(({ label, onPress, secondary }) => (
            <Pressable
              key={label}
              onPress={onPress}
              style={[styles.button, { backgroundColor: secondary ? theme.bgInput : theme.primary }]}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, { fontFamily: fonts.semibold }, secondary && { color: theme.text }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: wp(40) },
  icon: { width: ms(56), height: ms(56), borderRadius: ms(28), alignItems: 'center', justifyContent: 'center', marginBottom: hp(16) },
  title: { fontSize: fontSize.xl, marginBottom: hp(8), textAlign: 'center' },
  text: { fontSize: fontSize.md, textAlign: 'center', lineHeight: ms(22), marginBottom: hp(24) },
  actions: { flexDirection: 'row', gap: wp(12) },
  button: { minHeight: ms(48), justifyContent: 'center', paddingHorizontal: wp(24), borderRadius: radius.md },
  buttonText: { color: '#fff', fontSize: fontSize.md },
});
