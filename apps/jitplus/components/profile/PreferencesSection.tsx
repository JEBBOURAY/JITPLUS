import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { Moon, Share2, Globe, ChevronDown, Bell, Mail } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import FadeInView from '@/components/FadeInView';
import { profileStyles as styles } from './profileStyles';
import { ms } from '@/utils/responsive';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useTheme } from '@/contexts/ThemeContext';

type PrefKey = 'shareInfoMerchants' | 'notifPush' | 'notifEmail';

interface PreferencesSectionProps {
  theme: ReturnType<typeof useTheme>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: string;
  prefExpanded: boolean;
  setPrefExpanded: (v: boolean) => void;
  shareInfoMerchants: boolean;
  notifPush: boolean;
  notifEmail: boolean;
  isSavingPref: string | null;
  togglePreference: (key: PrefKey, value: boolean) => void;
  setShowLanguageModal: (v: boolean) => void;
}

export default function PreferencesSection({
  theme, t, locale, prefExpanded, setPrefExpanded,
  shareInfoMerchants, notifPush, notifEmail, isSavingPref,
  togglePreference, setShowLanguageModal,
}: PreferencesSectionProps) {
  return (
    <FadeInView delay={400}>
      <TouchableOpacity onPress={() => setPrefExpanded(!prefExpanded)} activeOpacity={0.7} style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('profile.preferences')}</Text>
        <ChevronDown size={ms(18)} color={theme.textMuted} strokeWidth={1.5}
          style={{ transform: [{ rotate: prefExpanded ? '180deg' : '0deg' }] }} />
      </TouchableOpacity>
      {prefExpanded && (
        <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
          {/* Dark mode */}
          <Pressable
            onPress={() => { theme.toggleDarkMode(); if (Platform.OS !== 'web') haptic(HapticStyle.Light); }}
            accessibilityRole="button" accessibilityLabel={t('profile.darkMode')}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, { borderBottomColor: theme.borderLight }, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Moon size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.darkMode')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                {theme.themeMode === 'system' ? t('profile.themeSystem') : theme.themeMode === 'dark' ? t('profile.themeDark') : t('profile.themeLight')}
              </Text>
            </View>
            <View style={[styles.toggle, theme.mode === 'dark' ? styles.toggleOn : { backgroundColor: theme.borderLight }]}>
              <View style={[styles.toggleKnob, theme.mode === 'dark' && styles.toggleKnobOn]} />
            </View>
          </Pressable>

          {/* Share info */}
          <Pressable
            onPress={() => togglePreference('shareInfoMerchants', !shareInfoMerchants)}
            disabled={isSavingPref === 'shareInfoMerchants'}
            accessibilityRole="switch" accessibilityState={{ checked: shareInfoMerchants }}
            accessibilityLabel={t('profile.shareInfoDesc')}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, { borderBottomColor: theme.borderLight }, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Share2 size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.shareInfo')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.shareInfoDesc')}</Text>
            </View>
            <View style={[styles.toggle, shareInfoMerchants ? styles.toggleOn : { backgroundColor: theme.borderLight }]}>
              {isSavingPref === 'shareInfoMerchants'
                ? <ActivityIndicator size="small" color="#fff" />
                : <View style={[styles.toggleKnob, shareInfoMerchants && styles.toggleKnobOn]} />}
            </View>
          </Pressable>

          {/* Push notifications (marketing opt-out) */}
          <Pressable
            onPress={() => togglePreference('notifPush', !notifPush)}
            disabled={isSavingPref === 'notifPush'}
            accessibilityRole="switch" accessibilityState={{ checked: notifPush }}
            accessibilityLabel={t('profile.pushNotifsDesc')}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, { borderBottomColor: theme.borderLight }, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Bell size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.pushNotifs')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.pushNotifsDesc')}</Text>
            </View>
            <View style={[styles.toggle, notifPush ? styles.toggleOn : { backgroundColor: theme.borderLight }]}>
              {isSavingPref === 'notifPush'
                ? <ActivityIndicator size="small" color="#fff" />
                : <View style={[styles.toggleKnob, notifPush && styles.toggleKnobOn]} />}
            </View>
          </Pressable>

          {/* Email notifications (marketing opt-out) */}
          <Pressable
            onPress={() => togglePreference('notifEmail', !notifEmail)}
            disabled={isSavingPref === 'notifEmail'}
            accessibilityRole="switch" accessibilityState={{ checked: notifEmail }}
            accessibilityLabel={t('profile.emailNotifsDesc')}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, { borderBottomColor: theme.borderLight }, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Mail size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.emailNotifs')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.emailNotifsDesc')}</Text>
            </View>
            <View style={[styles.toggle, notifEmail ? styles.toggleOn : { backgroundColor: theme.borderLight }]}>
              {isSavingPref === 'notifEmail'
                ? <ActivityIndicator size="small" color="#fff" />
                : <View style={[styles.toggleKnob, notifEmail && styles.toggleKnobOn]} />}
            </View>
          </Pressable>



          {/* Language */}
          <Pressable
            onPress={() => setShowLanguageModal(true)}
            android_ripple={{ color: `${palette.gold}10` }}
            style={({ pressed }) => [styles.infoRow, { borderBottomWidth: 0 }, pressed && Platform.OS === 'ios' && { opacity: 0.7 }]}
          >
            <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
              <Globe size={ms(16)} color={palette.gold} strokeWidth={1.5} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.language')}</Text>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.languageDesc')}</Text>
            </View>
            <Text style={[styles.langBadge, { color: theme.primary, backgroundColor: `${theme.primary}15` }]}>
              {t(`languages.${locale}`)}
            </Text>
          </Pressable>
        </View>
      )}
    </FadeInView>
  );
}
