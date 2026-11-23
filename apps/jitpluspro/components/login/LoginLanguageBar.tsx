import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { wp, hp, ms, radius } from '@/utils/responsive';

/** Flag buttons in the top corner of the login screen. */
export function LoginLanguageBar({ interactive }: {
  /** False until the intro starts, so taps through the splash don't reach it. */
  interactive: boolean;
}) {
  const theme = useTheme();
  const { locale, setLocale } = useLanguage();
  const dir = useDir();

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.langBar, dir.isRTL ? styles.langBarRtl : styles.langBarLtr]}
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      <View style={[styles.langRow, { flexDirection: dir.row }]}>
        {LANGUAGES.map(({ code, flag, nativeLabel }) => {
          const active = locale === code;
          return (
            <TouchableOpacity
              key={code}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={nativeLabel}
              accessibilityState={{ selected: active }}
              onPress={async () => {
                if (code !== locale) await setLocale(code);
              }}
              style={[
                styles.langBtn,
                {
                  backgroundColor: active ? `${palette.violet}14` : theme.inputBg,
                  borderColor: active ? palette.violet : theme.inputBorder,
                },
              ]}
            >
              <Text style={styles.langFlag}>{flag}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  langBar: {
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
  langBarLtr: { right: 0, paddingRight: wp(16) },
  langBarRtl: { left: 0, paddingLeft: wp(16) },
  langRow: {
    gap: wp(7),
    paddingTop: hp(4),
  },
  langBtn: {
    minWidth: ms(42),
    minHeight: ms(42),
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 1 },
    }),
  },
  langFlag: { fontSize: ms(18) },
});
