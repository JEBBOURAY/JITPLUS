import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Text } from '@/components/AppText';
import { X, ChevronRight } from 'lucide-react-native';
import { usePersistedFlag } from '@/hooks/usePersistedFlag';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
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
 * the merchant dismisses it.
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
  // The root view is forced LTR (app/_layout.tsx): mirror by hand, like every Pro screen.
  const { isRTL, row, textAlign, flip } = useDir();
  const { value: dismissed, setValue: setDismissed } = usePersistedFlag(storageKey);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, [setDismissed]);

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
      <TouchableOpacity
        style={[styles.closeBtn, isRTL ? styles.closeBtnStart : styles.closeBtnEnd]}
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
        style={[styles.content, isRTL ? styles.contentRtl : styles.contentLtr, { flexDirection: row }]}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${title}. ${message}`}
      >
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(124,58,237,0.12)' }]}>
          <Icon size={ms(16)} color="#7C3AED" strokeWidth={1.75} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.6} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.desc, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.6} numberOfLines={2}>
            {message}
          </Text>
          {!!actionLabel && (
            <View style={[styles.actionRow, { flexDirection: row }]}>
              <Text style={[styles.action, { color: '#7C3AED' }]} maxFontSizeMultiplier={1.4}>
                {actionLabel}
              </Text>
              <ChevronRight
                size={ms(14)}
                color="#7C3AED"
                style={flip}
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
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  closeBtn: { position: 'absolute', top: 8, zIndex: 2, padding: 4 },
  closeBtnEnd: { right: 8 },
  closeBtnStart: { left: 8 },
  content: { alignItems: 'center', gap: 12, padding: 14 },
  contentLtr: { paddingRight: 32 },
  contentRtl: { paddingLeft: 32 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1 },
  title: { fontSize: ms(13), fontFamily: 'Lexend_600SemiBold' },
  desc: { fontSize: ms(12), fontFamily: 'Lexend_400Regular', marginTop: 1 },
  actionRow: { alignItems: 'center', gap: 2, marginTop: 4 },
  action: { fontSize: ms(12), fontFamily: 'Lexend_600SemiBold' },
});
