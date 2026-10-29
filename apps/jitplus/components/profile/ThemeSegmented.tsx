import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic, HapticStyle } from '@/utils/haptics';
import { fontSize as FS, hp, ms, wp } from '@/utils/responsive';

type Mode = 'system' | 'light' | 'dark';

const OPTIONS: { mode: Mode; icon: LucideIcon; labelKey: string }[] = [
  { mode: 'system', icon: Monitor, labelKey: 'profile.themeAuto' },
  { mode: 'light', icon: Sun, labelKey: 'profile.themeLight' },
  { mode: 'dark', icon: Moon, labelKey: 'profile.themeDark' },
];

function ThemeSegmented() {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const { themeMode, setThemeMode } = theme;

  const select = useCallback((mode: Mode) => {
    if (mode === themeMode) return;
    haptic(HapticStyle.Light);
    setThemeMode(mode);
  }, [themeMode, setThemeMode]);

  return (
    <View
      style={[styles.track, { backgroundColor: theme.bgInput, borderColor: theme.border }]}
      accessibilityRole="radiogroup"
    >
      {OPTIONS.map(({ mode, icon: Icon, labelKey }) => {
        const selected = themeMode === mode;
        const color = selected ? theme.primary : theme.textMuted;
        return (
          <Pressable
            key={mode}
            onPress={() => select(mode)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t(labelKey)}
            style={[
              styles.segment,
              selected && [styles.segmentSelected, { backgroundColor: theme.bgCard }],
            ]}
          >
            <Icon size={ms(14)} color={color} strokeWidth={2.2} />
            <Text style={[styles.label, { color, fontFamily: selected ? fonts.semibold : fonts.medium }]} numberOfLines={1}>
              {t(labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(ThemeSegmented);

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: ms(12),
    borderWidth: StyleSheet.hairlineWidth,
    padding: ms(3),
    marginTop: hp(12),
    gap: ms(3),
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
    paddingVertical: hp(8),
    borderRadius: ms(9),
  },
  segmentSelected: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  label: { fontSize: FS.sm },
});
