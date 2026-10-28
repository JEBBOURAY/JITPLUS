import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, X, type LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '@/contexts/LanguageContext';
import { palette } from '@/contexts/ThemeContext';
import { radius } from '@/utils/responsive';

const GOLD = palette.gold;
const GRADIENT = ['#0f031e', '#1a0533'] as const;
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 0 };

interface Props {
  Icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  onPress: () => void;
  onDismiss?: () => void;
}

export function NoticeBanner({ Icon, title, description, actionLabel, onPress, onDismiss }: Props) {
  const { t, isRTL } = useLanguage();
  return (
    <LinearGradient colors={GRADIENT} start={GRADIENT_START} end={GRADIENT_END} style={styles.card}>
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${description}. ${actionLabel}`}
        style={styles.content}
      >
        <Icon size={20} color={GOLD} />
        <View style={styles.text}>
          <Text style={styles.title} maxFontSizeMultiplier={1.4}>{title}</Text>
          <Text style={styles.description} maxFontSizeMultiplier={1.4}>{description}</Text>
          <Text style={styles.action} maxFontSizeMultiplier={1.4}>{actionLabel}</Text>
        </View>
        <ChevronRight size={16} color={GOLD} style={isRTL ? styles.flip : undefined} />
      </TouchableOpacity>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.dismiss}>
          <X size={16} color="rgba(255,255,255,0.55)" />
        </TouchableOpacity>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'flex-start',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${GOLD}47`,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minHeight: 44 },
  text: { flex: 1 },
  title: { fontSize: 14, color: '#fff', fontFamily: 'Lexend_600SemiBold' },
  description: { marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_400Regular' },
  action: { marginTop: 8, fontSize: 12, color: GOLD, fontFamily: 'Lexend_600SemiBold' },
  dismiss: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ scaleX: -1 }] },
});
