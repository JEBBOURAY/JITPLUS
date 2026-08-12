import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { LifeBuoy, MessageCircle, Mail } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, palette, brandGradientFull } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFocusFade } from '@/hooks/useFocusFade';
import { Animated } from 'react-native';
import { ms } from '@/utils/responsive';

const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212755073325';
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'contact@jitplus.com';

/**
 * Support tab — 1-tap access to customer support (WhatsApp / e-mail).
 * Same underlying channels as Compte › Contacter le support, surfaced
 * directly from the bottom bar.
 */
export default function SupportScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { focusStyle } = useFocusFade();

  const openWhatsApp = useCallback(async () => {
    const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(t('account.contactSupportMsg'))}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('common.genericError'));
    }
  }, [t]);

  const openEmail = useCallback(async () => {
    const subject = encodeURIComponent('JitPlus Pro — Support');
    const body = encodeURIComponent(t('account.contactSupportMsg'));
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('common.genericError'));
    }
  }, [t]);

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      {/* ── Brand gradient header ── */}
      <LinearGradient
        colors={brandGradientFull}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerIcon}>
          <LifeBuoy size={ms(28)} color="#fff" strokeWidth={1.8} />
        </View>
        <Text style={styles.headerTitle} maxFontSizeMultiplier={1.4} accessibilityRole="header">
          {t('account.contactSupport')}
        </Text>
        <Text style={styles.headerSubtitle} maxFontSizeMultiplier={1.6}>
          {t('account.contactSupportVia')}
        </Text>
      </LinearGradient>

      {/* ── Contact channels ── */}
      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.channelCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
          onPress={openWhatsApp}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('account.contactViaWhatsApp')}
        >
          <View style={[styles.channelIcon, { backgroundColor: 'rgba(37,211,102,0.12)' }]}>
            <MessageCircle size={ms(22)} color="#25D366" strokeWidth={2} />
          </View>
          <Text style={[styles.channelLabel, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
            {t('account.contactViaWhatsApp')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.channelCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
          onPress={openEmail}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('account.contactViaEmail')}
        >
          <View style={[styles.channelIcon, { backgroundColor: `${palette.violet}14` }]}>
            <Mail size={ms(22)} color={palette.violet} strokeWidth={2} />
          </View>
          <Text style={[styles.channelLabel, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
            {t('account.contactViaEmail')}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
  },
  headerIcon: {
    width: ms(60),
    height: ms(60),
    borderRadius: ms(20),
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: 'Lexend_400Regular',
    marginTop: 6,
    textAlign: 'center',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  channelIcon: {
    width: ms(44),
    height: ms(44),
    borderRadius: ms(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelLabel: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
});
