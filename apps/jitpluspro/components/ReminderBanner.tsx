import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { X, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

interface ReminderBannerProps {
  /** Whether the underlying data is still missing (banner only shows when true). */
  visible: boolean;
  Icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onPress?: () => void;
  /** AsyncStorage key persisting a permanent dismissal. */
  storageKey: string;
}

/**
 * Discreet, dismissable contextual reminder for deferred configuration data
 * (e.g. missing logo / address). Non-blocking; hidden once the data exists or
 * the merchant dismisses it. Light-violet gradient per BRIEF-DESIGN tokens.
 */
export const ReminderBanner = React.memo(function ReminderBanner({
  visible,
  Icon,
  title,
  message,
  actionLabel,
  onPress,
  storageKey,
}: ReminderBannerProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const isDark = theme.mode === 'dark';
  const isRTL = I18nManager.isRTL;
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then((v) => active && setDismissed(v === 'true'))
      .catch(() => active && setDismissed(false));
    return () => {
      active = false;
    };
  }, [storageKey]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(storageKey, 'true').catch(() => {});
  }, [storageKey]);

  if (!visible || dismissed === null || dismissed) return null;

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.06)',
          borderColor: isDark ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.15)',
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(124,58,237,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={handleDismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <X size={16} color={theme.textMuted} strokeWidth={2} />
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={onPress ? 0.7 : 1}
        onPress={onPress}
        disabled={!onPress}
        style={styles.content}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${title}. ${message}`}
      >
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(124,58,237,0.12)' }]}>
          <Icon size={ms(16)} color="#7C3AED" strokeWidth={1.75} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.6} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.desc, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6} numberOfLines={2}>
            {message}
          </Text>
          {!!actionLabel && (
            <View style={styles.actionRow}>
              <Text style={[styles.action, { color: '#7C3AED' }]} maxFontSizeMultiplier={1.4}>
                {actionLabel}
              </Text>
              <ChevronRight
                size={ms(14)}
                color="#7C3AED"
                style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginTop: 12,
    ...Platform.select({
      ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  closeBtn: { position: 'absolute', top: 8, right: 8, zIndex: 2, padding: 4 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingRight: 32 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1 },
  title: { fontSize: ms(13), fontFamily: 'Lexend_600SemiBold' },
  desc: { fontSize: ms(12), fontFamily: 'Lexend_400Regular', marginTop: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  action: { fontSize: ms(12), fontFamily: 'Lexend_600SemiBold' },
});
