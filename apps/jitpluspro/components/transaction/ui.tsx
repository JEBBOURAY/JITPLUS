import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';

/** Soft card used by every block of the stamps screen. */
export function cardSurface(theme: ThemeColors): ViewStyle {
  return {
    backgroundColor: theme.bgCard,
    borderColor: theme.mode === 'dark' ? theme.border : theme.borderLight,
    shadowColor: theme.mode === 'dark' ? '#000' : '#1F2937',
    shadowOpacity: theme.mode === 'dark' ? 0.3 : 0.06,
  };
}

/** Tinted inline message (warning, info, success). */
export function TintNotice({ text, color, icon: Icon, isRTL }: {
  text: string;
  color: string;
  icon: LucideIcon;
  isRTL: boolean;
}) {
  return (
    <View style={[styles.notice, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: `${color}14` }]}>
      <Icon size={ms(15)} color={color} strokeWidth={1.9} />
      <Text style={[styles.noticeText, { color, textAlign: isRTL ? 'right' : 'left' }]}>{text}</Text>
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  notice: { alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  noticeText: { flex: 1, fontSize: ms(12.5), lineHeight: ms(18), fontFamily: 'Lexend_500Medium' },
});
