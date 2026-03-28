import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { LogIn } from 'lucide-react-native';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import BrandText from '@/components/BrandText';

/**
 * Full-screen prompt shown to guest users on tabs that require authentication.
 * Encourages them to sign up / log in.
 */
export default function GuestGuard() {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.iconCircle, { backgroundColor: palette.violet + '15' }]}>
        <LogIn size={ms(48)} color={palette.violet} strokeWidth={1.5} />
      </View>

      <View style={styles.brand}>
        <BrandText size={22} />
      </View>

      <Text style={[styles.title, { color: theme.text }]}>
        {t('guest.loginRequired')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {t('guest.loginRequiredDesc')}
      </Text>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push('/login')}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel={t('welcome.login')}
      >
        <LinearGradient
          colors={[brandGradient[0], brandGradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          <Text style={styles.btnText}>{t('welcome.login')}</Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push('/register')}
        style={styles.secondaryBtn}
        accessibilityRole="button"
        accessibilityLabel={t('welcome.createAccount')}
      >
        <Text style={[styles.secondaryText, { color: palette.violet }]}>
          {t('welcome.createAccount')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(32),
  },
  iconCircle: {
    width: wp(96),
    height: wp(96),
    borderRadius: wp(48),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(20),
  },
  brand: { marginBottom: hp(16) },
  title: {
    fontFamily: 'Lexend_600SemiBold',
    fontSize: ms(20),
    textAlign: 'center',
    marginBottom: hp(8),
  },
  subtitle: {
    fontFamily: 'Lexend_400Regular',
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: ms(22),
    marginBottom: hp(28),
    paddingHorizontal: wp(8),
  },
  btn: { borderRadius: radius.xl, overflow: 'hidden', width: '100%' },
  gradient: {
    paddingVertical: hp(15),
    borderRadius: radius.xl,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'Lexend_600SemiBold',
    fontSize: fontSize.md,
    color: '#FFFFFF',
  },
  secondaryBtn: { marginTop: hp(16), paddingVertical: hp(8) },
  secondaryText: {
    fontFamily: 'Lexend_500Medium',
    fontSize: fontSize.md,
  },
});
