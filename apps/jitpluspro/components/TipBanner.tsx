import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { X, Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';

const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };

/**
 * Shared dismissable tip banner (light violet gradient, lightning icon,
 * title + description, "don't show again" persisted by the caller).
 *
 * Used identically on the Accueil (activity) and Clients (index) screens so
 * both surfaces render the exact same component.
 */
const TipBanner = React.memo(function TipBanner({
  title,
  description,
  hideLabel,
  onDismiss,
  onDismissForever,
}: {
  title: string;
  description: string;
  hideLabel: string;
  onDismiss: () => void;
  onDismissForever: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const isDark = theme.mode === 'dark';

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
        onPress={onDismiss}
        hitSlop={HIT_SLOP_LARGE}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <X size={16} color={theme.textMuted} strokeWidth={2} />
      </TouchableOpacity>
      <View style={styles.content}>
        <Zap size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.6}>{title}</Text>
          <Text style={[styles.desc, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>{description}</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onDismissForever}
        style={styles.hideBtn}
        hitSlop={HIT_SLOP_LARGE}
        accessibilityRole="button"
        accessibilityLabel={hideLabel}
      >
        <Text style={[styles.hideText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>{hideLabel}</Text>
      </TouchableOpacity>
    </View>
  );
});

export default TipBanner;

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingRight: 24,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  desc: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 18,
    marginTop: 3,
    letterSpacing: 0.1,
  },
  hideBtn: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  hideText: {
    fontSize: 11,
    fontFamily: 'Lexend_500Medium',
    textDecorationLine: 'underline',
    letterSpacing: 0.1,
  },
});
