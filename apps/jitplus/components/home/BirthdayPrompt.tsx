import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Gift, X } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { BIRTHDAY_PROMPT_DISMISSED_KEY } from '@/constants';

/**
 * Asks for the birth date once the account exists (it left the sign-up to keep
 * it short). Only when the server said there is none: the offline profile cache
 * has no birth date, which must not show the card.
 */
export default function BirthdayPrompt() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const linkColor = theme.primary;
  const router = useRouter();
  const missing = useAuthStore((s) => s.client?.dateNaissance === null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!missing) return;
    AsyncStorage.getItem(BIRTHDAY_PROMPT_DISMISSED_KEY)
      .then((v) => setDismissed(v === '1'))
      .catch(() => setDismissed(false));
  }, [missing]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(BIRTHDAY_PROMPT_DISMISSED_KEY, '1').catch(() => {});
  }, []);

  if (!missing || dismissed) return null;

  return (
    <View style={[styles.card, { backgroundColor: `${palette.gold}12`, borderColor: `${palette.gold}30` }]}>
      <Gift size={ms(20)} color={palette.goldDark} strokeWidth={1.75} />
      <TouchableOpacity style={styles.body} onPress={() => router.push('/edit-profile')} accessibilityRole="button" activeOpacity={0.8}>
        <Text style={[styles.title, { color: theme.text, fontFamily: fonts.semibold }]}>{t('home.birthdayPromptTitle')}</Text>
        <Text style={[styles.desc, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('home.birthdayPromptDesc')}</Text>
        <Text style={[styles.cta, { color: linkColor, fontFamily: fonts.semibold }]}>{t('home.birthdayPromptCta')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={dismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
        <X size={ms(18)} color={theme.textMuted} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: wp(12),
    padding: wp(16),
    borderRadius: radius.lg,
    borderWidth: 1,
    // The list already has the 16 side gutter; 24 below, like every group of the page.
    marginBottom: hp(24),
  },
  body: { flex: 1 },
  title: { fontSize: fontSize.md, marginBottom: hp(2) },
  desc: { fontSize: fontSize.sm, lineHeight: ms(20) },
  cta: { fontSize: fontSize.sm, marginTop: hp(8) },
});
